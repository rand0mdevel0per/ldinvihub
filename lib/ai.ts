// Workers AI 调用 + JSON 解析容错
import { buildSystemPrompt, buildUserPrompt } from './prompt';

export interface AiVerdict {
  score: number;
  reason: string;
  violations: string[];
  raw: string;
}

export interface AiCallOptions {
  ai: Ai;
  applicantText: string;
  primaryModel: string;
  fallbackModel: string;
}

const SYSTEM_PROMPT = buildSystemPrompt();

export async function judgeRequest(opts: AiCallOptions): Promise<AiVerdict> {
  const { ai, applicantText, primaryModel, fallbackModel } = opts;
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: buildUserPrompt(applicantText) },
  ];

  let raw = '';
  let lastErr: unknown;
  for (const model of [primaryModel, fallbackModel]) {
    try {
      const resp = await (ai as unknown as { run: (m: string, opts: unknown) => Promise<unknown> }).run(model, {
        messages,
        max_tokens: 256,
        temperature: 0.2,
      });
      raw = extractText(resp);
      if (raw) break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!raw) {
    throw new Error(`AI 不可用: ${lastErr instanceof Error ? lastErr.message : 'unknown'}`);
  }

  return parseVerdict(raw);
}

function extractText(resp: unknown): string {
  if (!resp) return '';
  if (typeof resp === 'string') return resp;
  if (typeof resp === 'object') {
    const obj = resp as Record<string, unknown>;
    if (typeof obj.response === 'string') return obj.response;
    if (typeof obj.result === 'string') return obj.result;
    // 部分模型返回 { response: { ... } } 或 choices[]
    if (obj.choices && Array.isArray(obj.choices)) {
      const first = (obj.choices as Array<Record<string, unknown>>)[0];
      const message = first?.message as Record<string, unknown> | undefined;
      if (typeof message?.content === 'string') return message.content;
    }
  }
  return '';
}

function parseVerdict(raw: string): AiVerdict {
  // 尝试从输出中抽取 JSON 对象（容忍前后多余文字）
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`AI 输出不含 JSON: ${raw.slice(0, 120)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error(`AI 输出 JSON 解析失败: ${match[0].slice(0, 120)}`);
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;

  const scoreNum = Number(obj.score);
  const score = Number.isFinite(scoreNum) ? clamp(Math.round(scoreNum), 0, 100) : 0;
  const reason = typeof obj.reason === 'string' ? obj.reason.slice(0, 200) : '';
  const violations = Array.isArray(obj.violations)
    ? obj.violations.filter((v): v is string => typeof v === 'string').slice(0, 10)
    : [];

  return { score, reason, violations, raw };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
