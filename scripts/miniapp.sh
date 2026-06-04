#!/usr/bin/env bash
# Единый запуск мини-аппа «экран точки» через ngrok (TASK-34 #2).
# Поднимает: API точек (:5174) + витрину (:3000) + ngrok-туннель + бот.
# Ждёт публичный HTTPS-URL от ngrok и отдаёт его боту. Ctrl+C гасит ВСЁ.
#
#   bun run mini          (или: bash scripts/miniapp.sh)
#
# Токен бота берётся из .env (BOT_TOKEN) — bun автозагружает его, в скрипт не пишем.
set -uo pipefail
cd "$(dirname "$0")/.."   # корень проекта

WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${VENUE_API_PORT:-5174}"
NGROK_LOG="/tmp/beerlog-ngrok.log"

# Постоянный ngrok-домен: из env или из .env (без выполнения файла — только эта строка).
# Если задан — URL мини-аппа НЕ меняется между перезапусками (старые кнопки не протухают).
NGROK_DOMAIN="${NGROK_DOMAIN:-$(grep -E '^NGROK_DOMAIN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'\'' ')}"

echo "▸ чищу прежние процессы…"
pkill -f "scripts/venue-server.ts" 2>/dev/null || true
pkill -f "vite dev"                2>/dev/null || true
pkill -f "ngrok http"              2>/dev/null || true
pkill -f "scripts/telegram-bot.ts" 2>/dev/null || true
sleep 1

pids=()
cleanup() {
  echo; echo "▸ останавливаю всё…"
  for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
  pkill -f "ngrok http $WEB_PORT" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "▸ API точек :$API_PORT"
bun run scripts/venue-server.ts & pids+=("$!")

echo "▸ витрина :$WEB_PORT"
bun --filter @beer-log/web dev & pids+=("$!")

if [ -n "$NGROK_DOMAIN" ]; then
  echo "▸ ngrok → :$WEB_PORT (постоянный домен $NGROK_DOMAIN)"
  ngrok http "$WEB_PORT" --domain="$NGROK_DOMAIN" --log stdout >"$NGROK_LOG" 2>&1 & pids+=("$!")
else
  echo "▸ ngrok → :$WEB_PORT (ВРЕМЕННЫЙ URL — меняется при перезапуске!)"
  echo "  ⚠ чтобы кнопки/menu не протухали: заведи бесплатный static-домен"
  echo "    https://dashboard.ngrok.com/domains → пропиши NGROK_DOMAIN=<домен> в .env"
  ngrok http "$WEB_PORT" --log stdout >"$NGROK_LOG" 2>&1 & pids+=("$!")
fi

# ждём витрину
for _ in $(seq 1 40); do curl -sf -o /dev/null "http://localhost:$WEB_PORT/" && break; sleep 1; done

# ждём публичный HTTPS-URL ngrok (через его локальный API :4040)
URL=""
for _ in $(seq 1 40); do
  URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | bun -e 'try{const d=JSON.parse(await Bun.stdin.text());const t=(d.tunnels||[]).find(x=>x.public_url?.startsWith("https"));process.stdout.write(t?.public_url||"")}catch{}' 2>/dev/null)
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then
  echo "✗ ngrok не дал HTTPS-URL. Лог: $NGROK_LOG"
  cleanup
fi

echo "▸ бот (мини-апп $URL)…"
WEBAPP_URL="$URL" bun run scripts/telegram-bot.ts & pids+=("$!")

echo
echo "✓ всё поднято. Мини-апп: $URL/venues"
echo "  ngrok при первом заходе покажет страницу-предупреждение — жми «Visit Site»."
echo "  Ctrl+C — остановить всё."
wait
