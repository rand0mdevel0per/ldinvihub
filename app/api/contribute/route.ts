import { NextRequest, NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { ensureFingerprint, buildFpCookieHeader } from '@/lib/fingerprint';
import { verifyTurnstile } from '@/lib/turnstile';
import { verifyRecaptcha } from '@/lib/recaptcha';
import { validateInviteUrl } from '@/lib/validate';
import { checkContributeRate } from '@/lib/ratelimit';

export const runtime = 'edge';

interface ContributeBody {
  url?: string;
  turnstileToken?: string;
  recaptchaToken?: string;
}

export async function POST(req: NextRequest) {
  let body: ContributeBody;
  try {
    body = (await req.json()) as ContributeBody;
  } catch {
    return NextResponse.json({ ok: false, error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const env = getEnv();
  const ip = req.headers.get('cf-connecting-ip') ?? undefined;

  // 1. Turnstile（一层）
  const ts = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET, ip);
  if (!ts.success) {
    return NextResponse.json(
      { ok: false, error: '人机验证失败，请刷新重试。', detail: ts.errorCodes },
      { status: 400 },
    );
  }

  // 1.5. reCAPTCHA v3 invisible（二层，可选）
  const minScore = Number(env.RECAPTCHA_MIN_SCORE ?? '0.5');
  const rc = await verifyRecaptcha(
    body.recaptchaToken,
    env.RECAPTCHA_SECRET,
    'contribute',
    ip,
    minScore,
  );
  if (!rc.success) {
    return NextResponse.json(
      { ok: false, error: '风控校验未通过，请稍后再试。', detail: rc.errorCodes },
      { status: 400 },
    );
  }

  // 2. 链接校验
  const v = validateInviteUrl(body.url ?? '');
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.reason }, { status: 400 });
  }

  // 3. 指纹与限流
  const { fp, isNew } = await ensureFingerprint();
  const db = getDB();
  const rate = await checkContributeRate(db, fp);
  if (!rate.allowed) {
    return NextResponse.json({ ok: false, error: rate.reason }, { status: 429 });
  }

  // 4. 入库（UNIQUE 触发即重复）
  const now = Date.now();
  try {
    await db
      .prepare(
        `INSERT INTO invites (url, submitter_fp, created_at, used) VALUES (?, ?, ?, 0)`,
      )
      .bind(v.normalized, fp, now)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/UNIQUE/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: '这条链接已经被提交过啦，换一条吧。' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: '入库失败，请稍后重试。', detail: msg },
      { status: 500 },
    );
  }

  const headers = new Headers();
  if (isNew) headers.append('Set-Cookie', buildFpCookieHeader(fp));
  return NextResponse.json({ ok: true, message: '感谢贡献喵！' }, { status: 200, headers });
}
