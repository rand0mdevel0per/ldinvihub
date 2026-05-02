// Cloudflare Turnstile 服务端校验
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
}

export async function verifyTurnstile(
  token: string | undefined,
  secret: string | undefined,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  if (!secret) {
    // 开发环境未配置 secret 时放行（生产必须配置）
    return { success: true, errorCodes: ['turnstile-not-configured'] };
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
    const data = (await resp.json()) as { success: boolean; 'error-codes'?: string[] };
    return { success: !!data.success, errorCodes: data['error-codes'] };
  } catch (err) {
    return { success: false, errorCodes: ['network-error'] };
  }
}
