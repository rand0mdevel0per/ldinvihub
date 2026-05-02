// reCAPTCHA v3 服务端校验（可选第二层人机验证）
//
// 设计原则：reCAPTCHA 是**补充信号**，不是硬门。Turnstile 已经是硬门了。
// 用户装广告拦截（uBlock/AdGuard）会屏蔽 google.com/recaptcha，前端拿不到 token，
// 此时不应连累正常用户。仅当显式设置 RECAPTCHA_REQUIRE_TOKEN=1 时才硬卡缺 token。
//
// - secret 未配置：直接放行
// - 配置了 secret，但前端没传 token（脚本被屏蔽 / 加载失败）：默认软放行
// - 配置了 secret，前端传了 token：严格校验 success/action/score
const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const DEFAULT_MIN_SCORE = 0.5;

export interface RecaptchaResult {
  success: boolean;
  score?: number;
  action?: string;
  errorCodes?: string[];
  skipped?: boolean;
}

export async function verifyRecaptcha(
  token: string | undefined | null,
  secret: string | undefined,
  expectedAction: string,
  remoteIp?: string,
  minScore: number = DEFAULT_MIN_SCORE,
  requireToken: boolean = false,
): Promise<RecaptchaResult> {
  if (!secret) {
    return { success: true, skipped: true, errorCodes: ['recaptcha-not-configured'] };
  }
  if (!token) {
    if (requireToken) {
      return { success: false, errorCodes: ['missing-token'] };
    }
    // 软放行：reCAPTCHA 脚本可能被广告拦截屏蔽，依赖 Turnstile 和其他防线
    return { success: true, skipped: true, errorCodes: ['recaptcha-token-absent'] };
  }

  const body = new URLSearchParams();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const resp = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = (await resp.json()) as {
      success: boolean;
      score?: number;
      action?: string;
      'error-codes'?: string[];
    };
    if (!data.success) {
      return { success: false, errorCodes: data['error-codes'] };
    }
    if (data.action !== expectedAction) {
      return { success: false, errorCodes: ['action-mismatch'], action: data.action };
    }
    if (typeof data.score === 'number' && data.score < minScore) {
      return { success: false, score: data.score, errorCodes: ['low-score'] };
    }
    return { success: true, score: data.score, action: data.action };
  } catch {
    return { success: false, errorCodes: ['network-error'] };
  }
}
