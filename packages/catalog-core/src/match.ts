import { slugify } from "./util.ts";

/** Нормализация имени сорта для сопоставления: убрать (can)/объём, транслит, компактно. */
export function normalizeName(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\bin can\b/gi, " ")
    .replace(/\b\d+([.,]\d+)?\s*(л|l|мл|ml)\b/gi, " ")
    .replace(/[«»"'“”?!.,]/g, " ");
  return slugify(cleaned).replace(/-/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(
        dp[j]! + 1,
        dp[j - 1]! + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n]!;
}

/** 0..1: насколько похожи имена сортов (после нормализации). */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

export function isSameBeer(a: string, b: string, threshold = 0.85): boolean {
  return nameSimilarity(a, b) >= threshold;
}
