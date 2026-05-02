// linux.do Discourse 邀请链接校验
// 标准格式：https://linux.do/invites/<token>，token 通常 16-64 位 base62
const INVITE_REGEX = /^https:\/\/linux\.do\/invites\/[A-Za-z0-9]{16,64}\/?$/;

export type ValidateResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: string };

export function validateInviteUrl(raw: string): ValidateResult {
  if (typeof raw !== 'string') return { ok: false, reason: '链接必须是字符串' };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: '链接不能为空' };
  if (trimmed.length > 256) return { ok: false, reason: '链接过长' };

  if (!INVITE_REGEX.test(trimmed)) {
    return {
      ok: false,
      reason: '链接格式错误。请贡献形如 https://linux.do/invites/<token> 的标准 Discourse 邀请链接。',
    };
  }

  // 去掉末尾斜杠
  const normalized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  return { ok: true, normalized };
}
