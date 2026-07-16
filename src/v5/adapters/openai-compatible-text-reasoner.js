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
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new OpenAICompatibleTextReasonerError('BASE_URL_INVALID', 'Base URL 必须是有效的 HTTP(S) 地址');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new OpenAICompatibleTextReasonerError('BASE_URL_INVALID', 'Base URL 只允许 HTTP(S) 地址');
  }
  return parsed.pathname.endsWith('/chat/completions')
    ? parsed.toString()
    : `${parsed.toString().replace(/\/$/, '')}/chat/completions`;
}

function responseText(response) {
  if (typeof response?.outputText === 'string') return response.outputText.trim();
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((item) => typeof item === 'string' ? item : item?.text || '').join('').trim();
  }
  return '';
}

export function createOpenAICompatibleTextReasoner(options = {}) {
  const apiKey = String(options.apiKey || '').trim();
  const model = String(options.model || '').trim();
  const provider = String(options.provider || 'openai-compatible').trim();
  const maxTokens = Number.isInteger(options.maxTokens) && options.maxTokens > 0
    ? options.maxTokens
    : 16_384;
  const url = completionUrl(String(options.baseUrl || '').trim());
  const client = options.client || fetch;

  if (!apiKey) throw new OpenAICompatibleTextReasonerError('API_KEY_MISSING', 'API Key 尚未配置');
  if (!model) throw new OpenAICompatibleTextReasonerError('MODEL_MISSING', 'Model ID 尚未配置');

  return async function reason(messages, context = {}) {
    let response;
    try {
      response = await client(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: false }),
        signal: context.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new OpenAICompatibleTextReasonerError(
        'REQUEST_FAILED',
        `模型 API 请求失败：${redact(error?.message, apiKey)}`,
        { provider, model }
      );
    }

    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* mapped below */ }
    if (!response.ok) {
      const detail = body?.error?.message || body?.message || response.statusText || '未知错误';
      throw new OpenAICompatibleTextReasonerError(
        'API_ERROR',
        `模型 API 请求失败（HTTP ${response.status}）：${redact(detail, apiKey)}`,
        { provider, model, httpStatus: response.status }
      );
    }
    if (!body) {
      throw new OpenAICompatibleTextReasonerError(
        'RESPONSE_INVALID',
        '模型 API 返回了无效 JSON',
        { provider, model }
      );
    }
    const text = responseText(body);
    if (!text) {
      throw new OpenAICompatibleTextReasonerError(
        'EMPTY_RESPONSE',
        '模型返回空内容',
        { provider, model }
      );
    }
    return Object.freeze({
      runId: String(body.id || `brand-dna-${crypto.randomUUID()}`),
      provider,
      model: String(body.model || model),
      text,
      completedAt: new Date().toISOString()
    });
  };
}
