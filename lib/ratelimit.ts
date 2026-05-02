// 基于 D1 的指纹日额度限流
import type { D1Database } from '@cloudflare/workers-types';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSec?: number;
}

// 贡献：每指纹 24h 内 ≤ 5 条
export async function checkContributeRate(db: D1Database, fp: string): Promise<RateLimitResult> {
  const since = Date.now() - DAY;
  const row = await db
    .prepare(`SELECT COUNT(*) as c FROM invites WHERE submitter_fp = ? AND created_at > ?`)
    .bind(fp, since)
    .first<{ c: number }>();
  const count = row?.c ?? 0;
  if (count >= 5) {
    return { allowed: false, reason: '24 小时内最多贡献 5 条邀请，明天再来吧。', retryAfterSec: 24 * 3600 };
  }
  return { allowed: true };
}

// 领取：24h 内 ≤ 3 次申请；7 天内已成功领取过则冷却
export async function checkRequestRate(db: D1Database, fp: string): Promise<RateLimitResult> {
  const now = Date.now();
  const sinceDay = now - DAY;
  const sinceWeek = now - WEEK;

  const approved = await db
    .prepare(
      `SELECT COUNT(*) as c FROM requests WHERE fp = ? AND status = 'approved' AND created_at > ?`,
    )
    .bind(fp, sinceWeek)
    .first<{ c: number }>();
  if ((approved?.c ?? 0) >= 1) {
    return {
      allowed: false,
      reason: '7 天内已成功领取过邀请，请把机会让给他人。',
      retryAfterSec: 7 * 24 * 3600,
    };
  }

  const today = await db
    .prepare(`SELECT COUNT(*) as c FROM requests WHERE fp = ? AND created_at > ?`)
    .bind(fp, sinceDay)
    .first<{ c: number }>();
  if ((today?.c ?? 0) >= 3) {
    return {
      allowed: false,
      reason: '24 小时内最多申请 3 次，请明天再试或调整理由。',
      retryAfterSec: 24 * 3600,
    };
  }

  return { allowed: true };
}
