// Доступ к Telegram WebApp SDK (TASK-34 #2, нативность). Всё — безопасный no-op вне Telegram:
// SDK подключён в app.html, но вне клиента platform==="unknown" → считаем, что мы в обычном браузере.
// Компоненты импортят haptic/tgWebApp и зовут без проверок — внутри уже есть guard.

/** WebApp API, если мы реально внутри Telegram-клиента; иначе null. */
export function tgWebApp(): any | null {
  if (typeof window === "undefined") return null;
  const a = (window as any).Telegram?.WebApp;
  return a && a.platform && a.platform !== "unknown" ? a : null;
}

export const isTelegram = (): boolean => !!tgWebApp();

// тактильная отдача — мягкие сигналы под действия у полки (no-op вне TG / на старых клиентах)
export const haptic = {
  impact(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") {
    try { tgWebApp()?.HapticFeedback?.impactOccurred?.(style); } catch { /* старый клиент */ }
  },
  notify(type: "success" | "warning" | "error") {
    try { tgWebApp()?.HapticFeedback?.notificationOccurred?.(type); } catch { /* старый клиент */ }
  },
  select() {
    try { tgWebApp()?.HapticFeedback?.selectionChanged?.(); } catch { /* старый клиент */ }
  },
};

const APP_BG = "#0e0f12"; // --bg витрины: красим нативный чрома в тон, чтобы шов был незаметен

/** Инициализация нативного чрома Telegram: развернуть, покрасить шапку/фон, запретить свайп-закрытие. */
export function initTelegramChrome(): any | null {
  const tg = tgWebApp();
  if (!tg) return null;
  tg.ready();
  try { tg.expand?.(); } catch { /* */ }
  try { tg.setHeaderColor?.(APP_BG); } catch { /* < 6.9 */ }
  try { tg.setBackgroundColor?.(APP_BG); } catch { /* < 6.9 */ }
  try { tg.setBottomBarColor?.(APP_BG); } catch { /* < 7.10 */ }
  try { tg.disableVerticalSwipes?.(); } catch { /* < 7.7 — скролл пула не закрывает аппу случайно */ }
  return tg;
}
