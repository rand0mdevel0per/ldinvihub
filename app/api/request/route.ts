import { NextRequest, NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { ensureFingerprint, buildFpCookieHeader } from '@/lib/fingerprint';
import { verifyTurnstile } from '@/lib/turnstile';
import { verifyRecaptcha } from '@/lib/recaptcha';
import { checkRequestRate } from '@/lib/ratelimit';
import { judgeRequest } from '@/lib/ai';
import { checkDuplicate } from '@/lib/similarity';

export const runtime = 'edge';

interface RequestBody {
  text?: string;
  turnstileToken?: string;
  recaptchaToken?: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const text = (body.text ?? '').trim();
  const env = getEnv();
  const ip = req.headers.get('cf-connecting-ip') ?? undefined;

  // 1. 字数校验（>= 50 字，按字符计算）
  if (text.length < 50) {
    return NextResponse.json(
      { ok: false, error: `申请理由至少 50 字，当前 ${text.length} 字。` },
      { status: 400 },
    );
  }
  if (text.length > 2000) {
    return NextResponse.json(
      { ok: false, error: '申请理由过长（上限 2000 字），请精简。' },
      { status: 400 },
    );
  }

  // 2. Turnstile
  const ts = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET, ip);
  if (!ts.success) {
    return NextResponse.json(
      { ok: false, error: '人机验证失败，请刷新重试。', detail: ts.errorCodes },
      { status: 400 },
    );
  }

  // 2.5. reCAPTCHA v3 invisible（补充信号；缺 token 默认软放行）
  const minScore = Number(env.RECAPTCHA_MIN_SCORE ?? '0.5');
  const requireToken = env.RECAPTCHA_REQUIRE_TOKEN === '1';
  const rc = await verifyRecaptcha(
    body.recaptchaToken,
    env.RECAPTCHA_SECRET,
    'request',
    ip,
    minScore,
    requireToken,
  );
  if (!rc.success) {
    return NextResponse.json(
      { ok: false, error: '风控校验未通过，请稍后再试。', detail: rc.errorCodes },
      { status: 400 },
    );
  }

  // 3. 指纹与限流
  const { fp, isNew } = await ensureFingerprint();
  const db = getDB();
  const rate = await checkRequestRate(db, fp);
  if (!rate.allowed) {
    return NextResponse.json({ ok: false, error: rate.reason }, { status: 429 });
  }

  // 3.5. 查重：与最近 8 小时内 approved 申请相似度 >= 80% 直接拒绝（不调 AI）
  const dup = await checkDuplicate(db, text, 0.8);
  if (dup.duplicate && dup.hit) {
    const now0 = Date.now();
    await db
      .prepare(
        `INSERT INTO requests (fp, text, score, reason, violations, status, created_at)
         VALUES (?, ?, NULL, ?, ?, 'dup_rejected', ?)`,
      )
      .bind(
        fp,
        text,
        `与 8 小时内某条已通过申请相似度 ${(dup.hit.similarity * 100).toFixed(1)}%`,
        JSON.stringify([`duplicate-of-request-${dup.hit.matchedRequestId}`]),
        now0,
      )
      .run();

    const headers = new Headers();
    if (isNew) headers.append('Set-Cookie', buildFpCookieHeader(fp));
    return NextResponse.json(
      {
        ok: false,
        passed: false,
        reason: '检测到与近期已通过的申请高度相似，请用自己的话独立撰写。',
        violations: [`与 ${(dup.hit.similarity * 100).toFixed(0)}% 的近期通过申请重复`],
        error: '申请疑似抄袭，已自动拒绝（不消耗 AI 评审次数）。',
      },
      { status: 200, headers },
    );
  }

  // 4. AI 评审
  const threshold = Number(env.SCORE_THRESHOLD ?? '75');
  const primary = env.AI_MODEL_PRIMARY ?? '@cf/qwen/qwen1.5-14b-chat-awq';
  const fallback = env.AI_MODEL_FALLBACK ?? '@cf/qwen/qwen1.5-7b-chat-awq';

  let verdict: Awaited<ReturnType<typeof judgeRequest>>;
  try {
    verdict = await judgeRequest({
      ai: env.AI,
      applicantText: text,
      primaryModel: primary,
      fallbackModel: fallback,
    });
  } catch (err) {
    // AI 出错：记录但不消耗用户额度（写一条 status=error 的 request）
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO requests (fp, text, status, created_at) VALUES (?, ?, 'error', ?)`,
      )
      .bind(fp, text, now)
      .run()
      .catch(() => {});
    const headers = new Headers();
    if (isNew) headers.append('Set-Cookie', buildFpCookieHeader(fp));
    return NextResponse.json(
      {
        ok: false,
        error: 'AI 评审服务暂时不可用，请稍后重试。',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 503, headers },
    );
  }

  const now = Date.now();
  const passed = verdict.score >= threshold;

  if (!passed) {
    // 写一条 rejected 记录
    await db
      .prepare(
        `INSERT INTO requests (fp, text, score, reason, violations, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'rejected', ?)`,
      )
      .bind(fp, text, verdict.score, verdict.reason, JSON.stringify(verdict.violations), now)
      .run();

    const headers = new Headers();
    if (isNew) headers.append('Set-Cookie', buildFpCookieHeader(fp));
    return NextResponse.json(
      {
        ok: false,
        passed: false,
        score: verdict.score,
        threshold,
        reason: verdict.reason,
        violations: verdict.violations,
        error: `评分 ${verdict.score} 未达阈值 ${threshold}，申请未通过。`,
      },
      { status: 200, headers },
    );
  }

  // 5. AI 通过：先写 request 取到 id，再原子领取一条邀请
  const insertReq = await db
    .prepare(
      `INSERT INTO requests (fp, text, score, reason, violations, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'approved', ?) RETURNING id`,
    )
    .bind(fp, text, verdict.score, verdict.reason, JSON.stringify(verdict.violations), now)
    .first<{ id: number }>();

  const requestId = insertReq?.id;
  if (!requestId) {
    return NextResponse.json(
      { ok: false, error: '记录申请失败，请重试。' },
      { status: 500 },
    );
  }

  // 原子 claim：UPDATE ... RETURNING 保证不会双发
  const claim = await db
    .prepare(
      `UPDATE invites
       SET used = 1, used_at = ?, used_by_fp = ?, used_by_request_id = ?
       WHERE id = (SELECT id FROM invites WHERE used = 0 ORDER BY id LIMIT 1)
       RETURNING id, url`,
    )
    .bind(now, fp, requestId)
    .first<{ id: number; url: string }>();

  if (!claim) {
    // 库存空：把刚才的 approved 改回 rejected_no_stock，并提示
    await db
      .prepare(`UPDATE requests SET status = 'no_stock' WHERE id = ?`)
      .bind(requestId)
      .run();
    const headers = new Headers();
    if (isNew) headers.append('Set-Cookie', buildFpCookieHeader(fp));
    return NextResponse.json(
      {
        ok: false,
        passed: true,
        score: verdict.score,
        reason: verdict.reason,
        error: '申请通过了，但库存已空，请等待新的贡献者。可稍后重试，本次不消耗额度。',
      },
      { status: 200, headers },
    );
  }

  // 把 invite_id 回写到 request
  await db
    .prepare(`UPDATE requests SET invite_id = ? WHERE id = ?`)
    .bind(claim.id, requestId)
    .run();

  const headers = new Headers();
  if (isNew) headers.append('Set-Cookie', buildFpCookieHeader(fp));
  return NextResponse.json(
    {
      ok: true,
      passed: true,
      score: verdict.score,
      reason: verdict.reason,
      url: claim.url,
      message: '恭喜通过！请立刻点击邀请链接（一次性失效）。',
    },
    { status: 200, headers },
  );
}
