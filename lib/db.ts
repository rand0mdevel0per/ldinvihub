// Cloudflare 绑定访问入口
// 通过 @cloudflare/next-on-pages 提供的 getRequestContext() 在 edge runtime 下取到 env
import { getRequestContext } from '@cloudflare/next-on-pages';

export function getEnv(): CloudflareEnv {
  return getRequestContext().env as unknown as CloudflareEnv;
}

export function getDB(): D1Database {
  return getEnv().DB;
}

export function getAI(): Ai {
  return getEnv().AI;
}
