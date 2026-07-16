import crypto from 'node:crypto';
import { extractOpenAiCompatibleUsage } from '../usage/normalized-usage.js';
import {
  chooseStructuredOutputMode,
  detectStructuredOutputCapability
} from './structured-output-capabilities.js';
import {
  combineAbortSignals,
  createTimeoutSignal
} from '../shared/abort/combine-abort-signals.js';

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
  const jsonMode = options.jsonMode === true;
  const maxTokens = Number.isInteger(options.maxTokens) && options.maxTokens > 0
    ? options.maxTokens
    : 16_384;
  const url = completionUrl(String(options.baseUrl || '').trim());
  const client = options.client || fetch;
  const capability = detectStructuredOutputCapability(options);
  const defaultStructuredOutputMode = chooseStructuredOutputMode(capability);
  const maxTokenParameter = options.maxTokenParameter === 'max_completion_tokens'
    ? 'max_completion_tokens'
    : 'max_tokens';

  if (!apiKey) throw new OpenAICompatibleTextReasonerError('API_KEY_MISSING', 'API Key 尚未配置');
  if (!model) throw new OpenAICompatibleTextReasonerError('MODEL_MISSING', 'Model ID 尚未配置');

  return async function reason(messages, context = {}) {
    let response;
    const requestTimeoutMs = Number.isFinite(context.requestTimeoutMs)
      ? Math.max(1, Number(context.requestTimeoutMs))
      : null;
    const timeout = createTimeoutSignal(
      requestTimeoutMs,
      new OpenAICompatibleTextReasonerError(
        'REQUEST_TIMEOUT',
        `模型 API 请求超过 ${requestTimeoutMs || 0}ms。`,
        { provider, model, abortReason: 'request-timeout' }
      )
    );
    const combined = combineAbortSignals([context.signal, timeout.signal]);
    try {
      const body = { model, messages, stream: false };
      const structuredOutputMode = context.structuredOutputMode || (jsonMode ? defaultStructuredOutputMode : null);
      if (structuredOutputMode === 'json-schema' && context.jsonSchema) {
        body.response_format = { type: 'json_schema', json_schema: context.jsonSchema };
      } else if (structuredOutputMode === 'json-object' || jsonMode) {
        body.response_format = { type: 'json_object' };
      }
      const outputLimit = Number.isInteger(context.maxOutputTokens) && context.maxOutputTokens > 0
        ? context.maxOutputTokens
        : maxTokens;
      if (!body.response_format || capability.supportsMaxTokensWithJsonMode) {
        body[maxTokenParameter] = outputLimit;
      }
      if (
        typeof context.thinkingEnabled === 'boolean'
        && (!body.response_format || capability.supportsThinkingWithJsonMode)
      ) {
        body.enable_thinking = context.thinkingEnabled;
        if (context.thinkingEnabled && Number.isInteger(context.thinkingBudgetTokens)) {
          body.thinking_budget = context.thinkingBudgetTokens;
        }
      }
      response = await client(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: combined.signal
      });
    } catch (error) {
      if (combined.signal?.aborted && combined.signal.reason?.code) throw combined.signal.reason;
      if (error?.code === 'REQUEST_TIMEOUT') throw error;
      if (error?.name === 'AbortError') throw error;
      throw new OpenAICompatibleTextReasonerError(
        'REQUEST_FAILED',
        `模型 API 请求失败：${redact(error?.message, apiKey)}`,
        { provider, model }
      );
    } finally {
      timeout.dispose();
      combined.dispose();
    }

    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* mapped below */ }
    const finishReason = body?.choices?.[0]?.finish_reason || 'unknown';
    if (!response.ok) {
      const detail = body?.error?.message || body?.message || response.statusText || '未知错误';
      throw new OpenAICompatibleTextReasonerError(
        'API_ERROR',
        `模型 API 请求失败（HTTP ${response.status}）：${redact(detail, apiKey)}`,
        {
          provider,
          model,
          finishReason,
          httpStatus: response.status,
          providerRequestId: body?.id || body?.request_id || null,
          usage: extractOpenAiCompatibleUsage(body)
        }
      );
    }
    if (!body) {
      throw new OpenAICompatibleTextReasonerError(
        'RESPONSE_INVALID',
        '模型 API 返回了无效 JSON',
        { provider, model, httpStatus: response.status }
      );
    }
    const usage = extractOpenAiCompatibleUsage(body);
    const text = responseText(body);
    if (!text) {
      throw new OpenAICompatibleTextReasonerError(
        'EMPTY_RESPONSE',
        '模型返回空内容',
        {
          provider,
          model,
          finishReason,
          httpStatus: response.status,
          providerRequestId: body.id || body.request_id || null,
          usage
        }
      );
    }
    if (finishReason === 'length') {
      throw new OpenAICompatibleTextReasonerError(
        'OUTPUT_TRUNCATED',
        '模型输出达到长度上限，结构化 JSON 被截断',
        {
          provider,
          model,
          finishReason,
          httpStatus: response.status,
          providerRequestId: body.id || body.request_id || null,
          usage
        }
      );
    }
    return Object.freeze({
      runId: String(body.id || `brand-dna-${crypto.randomUUID()}`),
      provider,
      model: String(body.model || model),
      text,
      finishReason,
      structuredOutputMode: context.structuredOutputMode || (jsonMode ? defaultStructuredOutputMode : null),
      thinkingEnabled: typeof context.thinkingEnabled === 'boolean' ? context.thinkingEnabled : null,
      thinkingBudgetTokens: context.thinkingBudgetTokens ?? null,
      maxOutputTokens: Number.isInteger(context.maxOutputTokens) ? context.maxOutputTokens : maxTokens,
      providerRequestId: String(body.id || body.request_id || '') || null,
      httpStatus: response.status,
      usage,
      completedAt: new Date().toISOString()
    });
  };
}
