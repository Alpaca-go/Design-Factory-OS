export function detectStructuredOutputCapability(options = {}) {
  const identity = [
    options.provider,
    options.model,
    options.baseUrl
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  const isQwen = /qwen|dashscope|aliyun|aliyuncs/.test(identity);
  const jsonObject = options.jsonObject !== false
    && (options.jsonMode === true || isQwen || options.openAICompatible !== false);
  const jsonSchema = options.jsonSchema === true
    || /api\.openai\.com|\bopenai\b/.test(identity);
  return Object.freeze({
    jsonObject,
    jsonSchema,
    strictJsonSchema: jsonSchema && options.strictJsonSchema === true,
    supportsMaxTokensWithJsonMode: options.supportsMaxTokensWithJsonMode !== false,
    supportsThinkingWithJsonMode: isQwen || options.supportsThinkingWithJsonMode === true,
    source: 'static-adapter-config',
    checkedAt: new Date().toISOString()
  });
}

export function chooseStructuredOutputMode(capability) {
  if (capability?.jsonSchema && capability?.strictJsonSchema) return 'json-schema';
  if (capability?.jsonSchema) return 'json-schema';
  if (capability?.jsonObject) return 'json-object';
  return 'unsupported';
}
