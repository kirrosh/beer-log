// Хранилище рехостнутых изображений (task-15): S3-совместимое (Yandex Object Storage) или
// локальный фоллбэк. Картинки НЕ в git — лежат в бакете, в БД image_url = публичный URL.
//
// Конфиг (gitignored): data/.secrets/s3.json
//   {
//     "endpoint": "https://storage.yandexcloud.net",
//     "region": "ru-central1",
//     "bucket": "beerlog-img",
//     "accessKeyId": "<ключ сервисного аккаунта>",
//     "secretAccessKey": "<секрет>",
//     "publicBaseUrl": "https://beerlog-img.storage.yandexcloud.net"   // опц., по умолчанию вирт-хост
//   }
// Бакет должен допускать публичное чтение (ACL public-read на объектах ставим при заливке).
//
// Без конфига putImage() пишет в packages/web/static/<key> и возвращает локальный путь "/<key>" —
// удобно для дев-прогона без облака (но static/img gitignored, в прод-сборку не едет).
import { S3Client } from "bun";

const CONFIG_PATH = "data/.secrets/s3.json";
const STATIC_DIR = "packages/web/static"; // локальный фоллбэк (adapter-static раздаёт с корня)

export interface S3Config {
  endpoint: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** база публичного URL без хвостового слэша; по умолчанию вирт-хост бакета */
  publicBaseUrl?: string;
}

let _loaded = false;
let _cfg: S3Config | null = null;
let _client: S3Client | null = null;

async function load(): Promise<void> {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = await Bun.file(CONFIG_PATH).text();
    const cfg = JSON.parse(raw) as S3Config;
    if (cfg.bucket && cfg.accessKeyId && cfg.secretAccessKey && cfg.endpoint) {
      _cfg = cfg;
      _client = new S3Client({
        endpoint: cfg.endpoint,
        region: cfg.region ?? "ru-central1",
        bucket: cfg.bucket,
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      });
    }
  } catch {
    _cfg = null; // конфига нет — работаем в локальном режиме
  }
}

/** Настроено ли S3-хранилище (есть валидный data/.secrets/s3.json). */
export async function isS3Configured(): Promise<boolean> {
  await load();
  return _client != null;
}

/** Публичный URL объекта по ключу (для уже залитых картинок / миграции). */
export async function publicUrl(key: string): Promise<string> {
  await load();
  if (_cfg) {
    const base = _cfg.publicBaseUrl?.replace(/\/+$/, "")
      ?? `https://${_cfg.bucket}.${new URL(_cfg.endpoint).host}`;
    return `${base}/${key}`;
  }
  return `/${key}`; // локальный режим
}

/**
 * Залить картинку и вернуть URL для БД (image_url).
 * key — путь-ключ без ведущего слэша, напр. "img/brewery/salden-s.jpeg".
 * S3-режим: PUT в бакет с ACL public-read → публичный URL. Локальный режим: запись в static/<key>.
 */
export async function putImage(key: string, bytes: ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
  await load();
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (_client) {
    await _client.write(key, data, { type: contentType, acl: "public-read" });
    return publicUrl(key);
  }
  await Bun.write(`${STATIC_DIR}/${key}`, data);
  return `/${key}`;
}
