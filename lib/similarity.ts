// 字符 trigram Jaccard 查重
// 适用于中英文混合文本：3-字符滑动窗口生成 shingle 集合，计算两个集合的 Jaccard 相似度。
// 80% 阈值用于检测"换汤不换药"的复刻申请。

import type { D1Database } from '@cloudflare/workers-types';

const SHINGLE_SIZE = 3;
const EIGHT_HOURS = 8 * 60 * 60 * 1000;

export interface DupCheckHit {
  similarity: number;
  matchedRequestId: number;
  matchedAt: number;
}

export interface DupCheckResult {
  duplicate: boolean;
  hit?: DupCheckHit;
}

function normalize(text: string): string {
  // 去掉所有空白字符并转小写
  return text.replace(/\s+/g, '').toLowerCase();
}

function shingles(text: string, n = SHINGLE_SIZE): Set<string> {
  const norm = normalize(text);
  const set = new Set<string>();
  if (norm.length < n) {
    if (norm) set.add(norm);
    return set;
  }
  for (let i = 0; i <= norm.length - n; i++) {
    set.add(norm.slice(i, i + n));
  }
  return set;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  // 遍历较小集合提速
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const s of small) {
    if (large.has(s)) inter++;
  }
  const union = a.size + b.size - inter;
  return inter / union;
}

export function similarity(a: string, b: string): number {
  return jaccard(shingles(a), shingles(b));
}

/**
 * 在最近 8 小时的 approved 请求中查重，命中阈值返回最高相似度信息。
 * @param db D1 句柄
 * @param newText 新申请文本
 * @param threshold 相似度阈值（默认 0.8）
 */
export async function checkDuplicate(
  db: D1Database,
  newText: string,
  threshold = 0.8,
): Promise<DupCheckResult> {
  const since = Date.now() - EIGHT_HOURS;
  const rows = await db
    .prepare(
      `SELECT id, text, created_at FROM requests
       WHERE status = 'approved' AND created_at > ?
       ORDER BY created_at DESC LIMIT 200`,
    )
    .bind(since)
    .all<{ id: number; text: string; created_at: number }>();

  const newShingles = shingles(newText);
  let best: DupCheckHit | undefined;
  for (const row of rows.results ?? []) {
    const sim = jaccard(newShingles, shingles(row.text));
    if (sim >= threshold && (!best || sim > best.similarity)) {
      best = { similarity: sim, matchedRequestId: row.id, matchedAt: row.created_at };
    }
  }

  return best ? { duplicate: true, hit: best } : { duplicate: false };
}
