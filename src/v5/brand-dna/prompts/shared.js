export const SYSTEM_CORE = `你正在执行 Masterpiece OS 的 brand-dna-v1.1 深度分析协议。

共同规则：
- 只使用输入中的文档证据和已批准的上游结构化对象。
- 不输出私有思维过程，只输出可审计的简短依据。
- 不编造市场份额、竞品数据、消费者调研、创始人故事、产品功能、认证或合规事实。
- 建议必须标记 suggested，冲突必须保留，缺失信息不得自行补齐。
- 没有现有视觉资产时，不得假装已有 Logo、包装、主色或产品形态。
- 未提供已批准 Logo 或认证图形时，不得要求生成、重绘、仿造或冒用相关资产。
- 项目名称不得包含“品牌 DNA 合成、深度分析、分析报告、策划案”等任务词；无法确认时标记 missing。
- 所有图片任务的文字政策、Logo 政策、必须元素、禁止元素和最终 Prompt 必须互相一致。
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
