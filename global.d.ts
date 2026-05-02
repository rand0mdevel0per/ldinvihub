// Markdown 文件作为字符串导入（见 next.config.mjs 中 webpack rule）
declare module '*.md' {
  const content: string;
  export default content;
}

// Cloudflare 绑定类型
interface CloudflareEnv {
  DB: D1Database;
  AI: Ai;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  RECAPTCHA_SITE_KEY?: string;
  RECAPTCHA_SECRET?: string;
  RECAPTCHA_MIN_SCORE?: string;
  RECAPTCHA_REQUIRE_TOKEN?: string;
  SCORE_THRESHOLD?: string;
  AI_MODEL_PRIMARY?: string;
  AI_MODEL_FALLBACK?: string;
}
