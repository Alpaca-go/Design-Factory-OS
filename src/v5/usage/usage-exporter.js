const CSV_HEADERS = Object.freeze([
  ['createdAt', '时间'],
  ['projectNameSnapshot', '项目'],
  ['analysisMode', '分析模式'],
  ['pipelineStage', 'Pipeline阶段'],
  ['provider', 'Provider'],
  ['modelId', '模型'],
  ['apiProfileNameSnapshot', 'API配置名称'],
  ['status', '状态'],
  ['finishReason', '完成原因'],
  ['thinkingEnabled', '思考模式'],
  ['thinkingBudgetTokens', '思考预算Token'],
  ['structuredOutputMode', '结构化输出模式'],
  ['maxOutputTokens', '输出上限Token'],
  ['inputTokens', '输入Token'],
  ['outputTokens', '输出Token'],
  ['totalTokens', '总Token'],
  ['cachedInputTokens', '缓存Token'],
  ['reasoningTokens', '思考Token'],
  ['imageInputTokens', '图片Token'],
  ['durationMs', '调用耗时'],
  ['providerRequestId', '请求ID'],
  ['estimatedCostMicros', '标准价格预估微单位'],
  ['currency', '币种'],
  ['usageSource', 'Usage来源'],
  ['errorCategory', '错误分类']
]);

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function usageRecordsToCsv(records) {
  const lines = [
    CSV_HEADERS.map(([, label]) => csvCell(label)).join(','),
    ...(records || []).map((record) => (
      CSV_HEADERS.map(([key]) => csvCell(record[key])).join(',')
    ))
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
