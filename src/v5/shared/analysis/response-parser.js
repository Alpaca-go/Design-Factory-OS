function extractJsonCandidate(value) {
  const text = String(value || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw Object.assign(new Error('模型输出中未找到 JSON 对象'), { code: 'FAILED_SCHEMA' });
  return text.slice(start, end + 1)
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function parseStructuredResponse(value) {
  const candidate = extractJsonCandidate(value);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw Object.assign(new Error(`结构化 JSON 解析失败：${error.message}`), { code: 'FAILED_SCHEMA', cause: error });
  }
}
