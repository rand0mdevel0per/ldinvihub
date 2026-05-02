import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';

export const runtime = 'edge';

export async function GET() {
  const db = getDB();
  const env = getEnv();
  try {
    const totalRow = await db
      .prepare(`SELECT COUNT(*) as c FROM invites`)
      .first<{ c: number }>();
    const usedRow = await db
      .prepare(`SELECT COUNT(*) as c FROM invites WHERE used = 1`)
      .first<{ c: number }>();
    const reqRow = await db
      .prepare(`SELECT COUNT(*) as c FROM requests WHERE status = 'approved'`)
      .first<{ c: number }>();

    const total = totalRow?.c ?? 0;
    const used = usedRow?.c ?? 0;
    return NextResponse.json({
      ok: true,
      total,
      used,
      available: Math.max(total - used, 0),
      approved: reqRow?.c ?? 0,
      siteKey: env.TURNSTILE_SITE_KEY ?? null,
      recaptchaSiteKey: env.RECAPTCHA_SITE_KEY ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'stats error' },
      { status: 500 },
    );
  }
}
