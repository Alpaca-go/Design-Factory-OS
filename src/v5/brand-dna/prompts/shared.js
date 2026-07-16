export const SYSTEM_CORE = `你正在执行 Masterpiece OS 的 brand-dna-v1 深度分析协议。

共同规则：
- 只使用输入中的文档证据和已批准的上游结构化对象。
- 不输出私有思维过程，只输出可审计的简短依据。
- 不编造市场份额、竞品数据、消费者调研、创始人故事、产品功能、认证或合规事实。
- 建议必须标记 suggested，冲突必须保留，缺失信息不得自行补齐。
- 没有现有视觉资产时，不得假装已有 Logo、包装、主色或产品形态。
- 只返回严格 JSON，不要 Markdown、代码围栏或解释。`;

export function buildStagePrompt(stage, task, input, schema, rules = '') {
  return Object.freeze([
    Object.freeze({ role: 'system', content: SYSTEM_CORE }),
    Object.freeze({
      role: 'user',
      content: `PROTOCOL_STAGE=${stage}

## 当前任务

${task}

${rules ? `## 补充规则\n\n${rules}\n\n` : ''}## 输入

${JSON.stringify(input)}

## 输出 JSON 结构

${schema}

只返回完整 JSON 对象。`
    })
  ]);
}
