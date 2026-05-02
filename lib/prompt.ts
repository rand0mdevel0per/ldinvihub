// 构建发送给 qwen 的 system prompt（rules.md 在构建期内联）
import rulesMd from '../rules.md';

const HEADER = `你是 linux.do 邀请链接分享站的审查员。你的任务是判断用户的"领取邀请申请理由"是否合理。

你必须严格按照下方"站点硬约束"打分，并且只输出一个 JSON 对象，不要输出任何其他文字、不要使用 markdown 代码块包裹。

输出 JSON 格式（必须严格符合）：
{
  "score": <0-100 的整数>,
  "reason": "<不超过 80 字的中文打分理由>",
  "violations": ["<违反的规则简述>", ...]
}

打分原则：
- 严格按照"站点硬约束"中的拒绝条款给分
- 只要触发任一拒绝条款，score 必须 < 50
- 申请理由具体、个人化、有真实使用场景 → 高分
- 申请理由空泛、套话、像 AI 生成 → 低分
- 不要因为申请者态度好就放水，要看内容质量
- violations 是一个数组，列出违反的规则；若无违反，传 []`;

export function buildSystemPrompt(): string {
  return `${HEADER}\n\n=== 站点硬约束 ===\n${rulesMd}\n=== 硬约束结束 ===`;
}

export function buildUserPrompt(applicantText: string): string {
  return `以下是用户提交的领取邀请申请理由，请你严格审查并按照上述 JSON 格式输出评分结果：

<申请理由>
${applicantText}
</申请理由>

请直接输出 JSON 对象，不要输出任何其他内容。`;
}
