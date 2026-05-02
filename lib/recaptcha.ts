// reCAPTCHA v3 服务端校验（可选第二层人机验证）
// 当 RECAPTCHA_SECRET 未配置时直接放行；配置后校验 token 有效且 score >= 阈值
const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const DEFAULT_MIN_SCORE = 0.5;

export interface RecaptchaResult {
  success: boolean;
  score?: number;
  action?: string;
  errorCodes?: string[];
}

export async function verifyRecaptcha(
  token: string | undefined,
  secret: string | undefined,
  expectedAction: string,
  remoteIp?: string,
  minScore: number = DEFAULT_MIN_SCORE,
): Promise<RecaptchaResult> {
  if (!secret) {
    // 未配置 secret：跳过此层
    return { success: true };
  }
  if (!token) return { success: false, errorCodes: ['missing-token'] };

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
