import crypto from 'node:crypto';

export class OpenAICompatibleTextReasonerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OpenAICompatibleTextReasonerError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function redact(value, secret) {
  const message = String(value || '');
  return secret ? message.split(secret).join('[REDACTED]') : message;
}

function completionUrl(baseUrl) {
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new OpenAICompatibleTextReasonerError('BASE_URL_INVALID', 'Base URL 必须是有效的 HTTP(S) 地址'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new OpenAICompatibleTextReasonerError('BASE_URL_INVALID', 'Base URL 只允许 HTTP(S) 地址');
  return parsed.pathname.endsWith('/chat/completions') ? parsed.toString() : `${parsed.toString().replace(/\/$/, '')}/chat/completions`;
}

function responseText(response) {
  if (typeof response?.outputText === 'string') return response.outputText.trim();
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((item) => typeof item === 'string' ? item : item?.text || '').join('').trim();
  return '';
}

function finishReason(response) {
  return String(response?.choices?.[0]?.finish_reason || response?.finish_reason || response?.stop_reason || '').trim();
}

export function createOpenAICompatibleTextReasoner(options = {}) {
  const apiKey = String(options.apiKey || '').trim();
  const model = String(options.model || '').trim();
  const provider = String(options.provider || 'openai-compatible').trim();
  const url = completionUrl(String(options.baseUrl || '').trim());
  const client = options.client || fetch;
  if (!apiKey) throw new OpenAICompatibleTextReasonerError('API_KEY_MISSING', 'API Key 尚未配置');
  if (!model) throw new OpenAICompatibleTextReasonerError('MODEL_MISSING', 'Model ID 尚未配置');
  const supportsThinking = /(?:maas\.aliyuncs\.com|dashscope\.aliyuncs\.com)$/i.test(new URL(url).hostname);
  return async function reason(messages, context = {}) {
    const timeoutSignal = context.requestTimeoutMs ? AbortSignal.timeout(context.requestTimeoutMs) : null;
    const signal = timeoutSignal && context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal || context.signal;
    let response;
    try {
      const normalizedMessages = messages.some((message) => message.role === 'user')
        ? messages
        : [
            { role: 'system', content: '严格遵循用户消息中的协议、字段约束与 JSON 输出要求。' },
            { role: 'user', content: messages.map((message) => message.content).join('\n\n') }
          ];
      const body = { model, messages: normalizedMessages, max_tokens: context.maxOutputTokens || 16384, stream: false };
      if (supportsThinking && typeof context.enableThinking === 'boolean') {
        body.enable_thinking = context.enableThinking;
        if (context.enableThinking && context.thinkingBudget) body.thinking_budget = context.thinkingBudget;
      }
      response = await client(url, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new OpenAICompatibleTextReasonerError('REQUEST_FAILED', `模型 API 请求失败：${redact(error?.message, apiKey)}`, { provider, model });
    }
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* mapped below */ }
    if (!response.ok) throw new OpenAICompatibleTextReasonerError('API_ERROR', `模型 API 请求失败（HTTP ${response.status}）：${redact(body?.error?.message || response.statusText, apiKey)}`, { provider, model, httpStatus: response.status });
    const text = responseText(body);
    const reason = finishReason(body);
    if (/^(?:length|max[_-]?tokens?|token[_-]?limit|output[_-]?limit)$/i.test(reason)) throw new OpenAICompatibleTextReasonerError('OUTPUT_TRUNCATED', '模型输出达到长度上限，结构化 JSON 被截断', { provider, model, finishReason: reason, outputCharacters: text.length });
    if (!text) throw new OpenAICompatibleTextReasonerError('EMPTY_RESPONSE', '模型返回空内容', { provider, model });
    return Object.freeze({
      runId: String(body.id || `visual-translation-${crypto.randomUUID()}`), provider, model: String(body.model || model), text, finishReason: reason,
      usage: body.usage ? { inputTokens: body.usage.prompt_tokens ?? null, outputTokens: body.usage.completion_tokens ?? null, totalTokens: body.usage.total_tokens ?? null } : null,
      completedAt: new Date().toISOString()
    });
  };
}
