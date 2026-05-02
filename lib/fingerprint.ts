// Cookie 指纹：HttpOnly UUID，1 年有效
// Next 15 起 cookies() 是异步的；route handler 中 await 拿到 store
import { cookies } from 'next/headers';

const COOKIE_NAME = 'fp';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface FingerprintInfo {
  fp: string;
  isNew: boolean;
}

export async function ensureFingerprint(): Promise<FingerprintInfo> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing && /^[a-f0-9-]{32,40}$/.test(existing)) {
    return { fp: existing, isNew: false };
  }
  const fp = crypto.randomUUID();
  try {
    store.set({
      name: COOKIE_NAME,
      value: fp,
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
    });
  } catch {
    // 在某些只读上下文下 cookies().set 不可用，调用方需自行用 Set-Cookie 头兜底
  }
  return { fp, isNew: true };
}

export function buildFpCookieHeader(fp: string): string {
  return `${COOKIE_NAME}=${fp}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ONE_YEAR_SECONDS}`;
}
