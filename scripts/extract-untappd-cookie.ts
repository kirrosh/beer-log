// Скоупленный экстрактор untappd-cookie из Chrome (task-16, headless-путь пагинации).
//
// Достаёт ТОЛЬКО cookie домена untappd.com из локального стора Chrome, расшифровывает их ключом
// из macOS Keychain и пишет готовый Cookie-заголовок в data/.secrets/untappd-cookie.txt (gitignored).
// После этого ingest-untappd.ts пагинирует сорта headless: parse(url,{paginate:true}).
//
// БЕЗОПАСНОСТЬ / ГРАНИЦА:
//  - SQL-фильтр host_key LIKE '%untappd.com' — в вывод попадают ИСКЛЮЧИТЕЛЬНО untappd-cookie,
//    сессии других сайтов не читаются и не пишутся.
//  - Ключ расшифровки Chrome глобальный (так устроен Chrome) — берётся из Keychain «Chrome Safe
//    Storage»; при первом доступе macOS спросит разрешение (нужен логин-пароль). Это разовый allow.
//  - Файл-результат gitignored; cookie протухает при разлогине — перезапустить экстрактор.
//
// Запуск:  bun run scripts/extract-untappd-cookie.ts
//          CHROME_PROFILE="Profile 1" bun run scripts/extract-untappd-cookie.ts   # иной профиль
import { Database } from "bun:sqlite";
import { pbkdf2Sync, createDecipheriv, createHash } from "node:crypto";
import { homedir } from "node:os";
import { existsSync, copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = "data/.secrets/untappd-cookie.txt";
const profile = process.env.CHROME_PROFILE ?? "Default";
const base = join(homedir(), "Library", "Application Support", "Google", "Chrome", profile);
// Свежие Chrome держат базу в <Profile>/Network/Cookies, старые — в <Profile>/Cookies.
const candidates = [join(base, "Network", "Cookies"), join(base, "Cookies")];
const cookiesDb = candidates.find((p) => existsSync(p));
if (!cookiesDb) {
  console.error(`✗ не найден Cookies-стор Chrome для профиля «${profile}». Искал:\n  ${candidates.join("\n  ")}`);
  process.exit(1);
}

// Ключ AES: пароль из Keychain → PBKDF2(salt=saltysalt, 1003, 16 байт). Доступ к Keychain
// вызовет системный диалог — разреши один раз.
const kc = Bun.spawnSync(["security", "find-generic-password", "-wa", "Chrome", "-s", "Chrome Safe Storage"]);
const kcPass = new TextDecoder().decode(kc.stdout).trim();
if (!kcPass) {
  console.error("✗ не удалось получить ключ «Chrome Safe Storage» из Keychain (доступ не разрешён?).");
  process.exit(1);
}
const aesKey = pbkdf2Sync(kcPass, "saltysalt", 1003, 16, "sha1");

function decryptValue(enc: Buffer, hostKey: string): string {
  if (enc.length === 0) return "";
  const prefix = enc.subarray(0, 3).toString();
  if (prefix !== "v10") return enc.toString(); // незашифрованное значение (редко)
  const iv = Buffer.alloc(16, " ");
  const decipher = createDecipheriv("aes-128-cbc", aesKey, iv);
  decipher.setAutoPadding(false);
  let out = Buffer.concat([decipher.update(enc.subarray(3)), decipher.final()]);
  // снять PKCS7-паддинг
  const pad = out[out.length - 1] ?? 0;
  if (pad > 0 && pad <= 16) out = out.subarray(0, out.length - pad);
  // Свежий Chrome (macOS) префиксует плейнтекст 32-байтным SHA256(host_key) — срезаем
  // детерминированно: только если первые 32 байта реально равны этому хэшу.
  if (out.length >= 32) {
    const domHash = createHash("sha256").update(hostKey).digest();
    if (out.subarray(0, 32).equals(domHash)) out = out.subarray(32);
  }
  return out.toString("utf8");
}

// Копируем базу во временный файл (Chrome держит лок) и читаем read-only.
const tmp = join(mkdtempSync(join(tmpdir(), "untappd-ck-")), "Cookies");
copyFileSync(cookiesDb, tmp);
const db = new Database(tmp, { readonly: true });
const rows = db
  .query("SELECT name, host_key, encrypted_value FROM cookies WHERE host_key LIKE '%untappd.com'")
  .all() as { name: string; host_key: string; encrypted_value: Buffer }[];
db.close();

const pairs: string[] = [];
for (const r of rows) {
  const val = decryptValue(Buffer.from(r.encrypted_value), r.host_key);
  // только печатаемые ASCII-значения (битые/непонятные пропускаем, чтобы не портить заголовок)
  if (val && /^[\x20-\x7E]*$/.test(val)) pairs.push(`${r.name}=${val}`);
}
if (pairs.length === 0) {
  console.error("✗ untappd.com-cookie не найдены — залогинен ли ты в Untappd в этом профиле Chrome?");
  process.exit(1);
}

await Bun.write(OUT, pairs.join("; "));
// не печатаем значения cookie — только имена и счётчик
console.log(`✓ записано ${pairs.length} untappd-cookie (${pairs.map((p) => p.split("=")[0]).join(", ")}) → ${OUT}`);
console.log("  Теперь: bun run scripts/ingest-untappd.ts <slug...>  (пагинирует headless)");
