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

function parseErrorBody(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function streamTimeoutError(code, message, details) {
  return new OpenAICompatibleTextReasonerError(code, message, details);
}

async function readOpenAICompatibleStream(response, options = {}) {
  if (!response.body?.getReader) {
    throw new OpenAICompatibleTextReasonerError('STREAM_UNAVAILABLE', 'Provider 未返回可读取的流式响应');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoningContent = '';
  let finish = '';
  let usage = null;
  let responseId = '';
  let responseModel = options.model;
  let chunksReceived = 0;
  let firstActivitySeen = false;
  let firstReasoningSeen = false;
  let firstContentSeen = false;
  let doneMarkerSeen = false;
  let abortListener;
  const aborted = options.signal ? new Promise((_, reject) => {
    abortListener = () => reject(options.signal.reason || new DOMException('The operation was aborted', 'AbortError'));
    if (options.signal.aborted) abortListener();
    else options.signal.addEventListener('abort', abortListener, { once: true });
  }) : null;

  const emit = (type, extra = {}) => options.onEvent?.({
    type,
    elapsedMs: Date.now() - options.startedAt,
    receivedChars: content.length,
    reasoningChars: reasoningContent.length,
    chunksReceived,
    ...extra
  });

  const activity = (kind) => {
    if (!firstActivitySeen) {
      firstActivitySeen = true;
      options.onFirstActivity?.();
      emit('first_activity', { activityKind: kind });
    }
    options.onActivity?.();
  };

  const processPayload = (data) => {
    if (!data) return;
    if (data === '[DONE]') {
      doneMarkerSeen = true;
      return;
    }
    let payload;
    try {
      payload = JSON.parse(data);
    } catch (error) {
      throw new OpenAICompatibleTextReasonerError('STREAM_PROTOCOL_ERROR', `流式响应包含无效 JSON：${error.message}`);
    }
    if (payload?.error) {
      throw new OpenAICompatibleTextReasonerError('API_ERROR', `模型 API 流式响应失败：${payload.error.message || 'unknown error'}`);
    }
    responseId = String(payload.id || responseId || '');
    responseModel = String(payload.model || responseModel || '');
    if (payload.usage) usage = payload.usage;
    const choice = payload.choices?.[0];
    if (!choice) return;
    chunksReceived += 1;
    const delta = choice.delta || choice.message || {};
    const reasoning = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
    const answer = typeof delta.content === 'string'
      ? delta.content
      : Array.isArray(delta.content)
        ? delta.content.map((item) => typeof item === 'string' ? item : item?.text || '').join('')
        : '';
    if (reasoning) {
      reasoningContent += reasoning;
      activity('reasoning');
      if (!firstReasoningSeen) {
        firstReasoningSeen = true;
        emit('first_reasoning_token');
      }
    }
    if (answer) {
      content += answer;
      activity('content');
      if (!firstContentSeen) {
        firstContentSeen = true;
        emit('first_content_token');
      }
    }
    if (choice.finish_reason) finish = String(choice.finish_reason);
    if (reasoning || answer) emit('progress');
  };

  const processEvents = (flush = false) => {
    const blocks = buffer.split(/\r?\n\r?\n/u);
    if (!flush) buffer = blocks.pop() || '';
    else buffer = '';
    for (const block of blocks) {
      const data = block.split(/\r?\n/u)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      processPayload(data);
    }
  };

  try {
    let streamEnded = false;
    while (!streamEnded) {
      const { value, done } = await (aborted ? Promise.race([reader.read(), aborted]) : reader.read());
      streamEnded = done;
      if (streamEnded) continue;
      buffer += decoder.decode(value, { stream: true });
      processEvents(false);
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      buffer += '\n\n';
      processEvents(true);
    }
  } finally {
    if (options.signal?.aborted) await reader.cancel(options.signal.reason).catch(() => undefined);
    if (abortListener) options.signal.removeEventListener('abort', abortListener);
    reader.releaseLock?.();
  }

  emit('end', { finishReason: finish || null, doneMarkerSeen });
  return {
    id: responseId,
    model: responseModel,
    choices: [{ message: { role: 'assistant', content, reasoning_content: reasoningContent }, finish_reason: finish }],
    usage
  };
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
    const startedAt = Date.now();
    const timeoutSignal = context.requestTimeoutMs ? AbortSignal.timeout(context.requestTimeoutMs) : null;
    const activityController = context.stream ? new AbortController() : null;
    const signals = [context.signal, timeoutSignal, activityController?.signal].filter(Boolean);
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    let firstActivityTimer = null;
    let idleTimer = null;
    const clearStreamTimers = () => {
      clearTimeout(firstActivityTimer);
      clearTimeout(idleTimer);
    };
    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      if (!context.streamIdleTimeoutMs) return;
      idleTimer = setTimeout(() => activityController.abort(streamTimeoutError(
        'STEP4_STREAM_IDLE_TIMEOUT',
        'Step 4 stream stopped producing reasoning or content tokens',
        { provider, model, timeoutMs: context.streamIdleTimeoutMs }
      )), context.streamIdleTimeoutMs);
      idleTimer.unref?.();
    };
    if (context.stream && context.firstActivityTimeoutMs) {
      firstActivityTimer = setTimeout(() => activityController.abort(streamTimeoutError(
        'STEP4_FIRST_ACTIVITY_TIMEOUT',
        'Step 4 stream did not produce its first reasoning or content token in time',
        { provider, model, timeoutMs: context.firstActivityTimeoutMs }
      )), context.firstActivityTimeoutMs);
      firstActivityTimer.unref?.();
    }
    let response;
    let body = null;
    try {
      const normalizedMessages = messages.some((message) => message.role === 'user')
        ? messages
        : [
            { role: 'system', content: '严格遵循用户消息中的协议、字段约束与 JSON 输出要求。' },
            { role: 'user', content: messages.map((message) => message.content).join('\n\n') }
          ];
      const requestBody = { model, messages: normalizedMessages, max_tokens: context.maxOutputTokens || 16384, stream: Boolean(context.stream) };
      if (context.stream) requestBody.stream_options = { include_usage: true };
      if (supportsThinking && typeof context.enableThinking === 'boolean') {
        requestBody.enable_thinking = context.enableThinking;
        if (context.enableThinking && context.thinkingBudget) requestBody.thinking_budget = context.thinkingBudget;
      }
      response = await client(url, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal });
      if (!response.ok) {
        const rawError = await response.text();
        const errorBody = parseErrorBody(rawError);
        throw new OpenAICompatibleTextReasonerError('API_ERROR', `模型 API 请求失败（HTTP ${response.status}）：${redact(errorBody?.error?.message || response.statusText, apiKey)}`, { provider, model, httpStatus: response.status });
      }
      const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
      if (context.stream && contentType.includes('text/event-stream')) {
        body = await readOpenAICompatibleStream(response, {
          model,
          signal,
          startedAt,
          onEvent: context.onStreamEvent,
          onFirstActivity() {
            clearTimeout(firstActivityTimer);
            armIdleTimer();
          },
          onActivity: armIdleTimer
        });
      } else {
        body = parseErrorBody(await response.text());
      }
    } catch (error) {
      clearStreamTimers();
      if (signal?.aborted) {
        if (signal.reason instanceof OpenAICompatibleTextReasonerError) throw signal.reason;
        if (timeoutSignal?.aborted && context.timeoutErrorCode) {
          throw new OpenAICompatibleTextReasonerError(context.timeoutErrorCode, context.timeoutErrorCode, { provider, model, timeoutMs: context.requestTimeoutMs });
        }
        if (context.signal?.aborted) throw new DOMException('User cancelled the analysis', 'AbortError');
      }
      if (error instanceof OpenAICompatibleTextReasonerError) throw error;
      if (error?.name === 'AbortError') throw error;
      const cause = error?.cause;
      const causeMessage = cause && cause.code ? ` (${cause.code})` : '';
      const detail = `${redact(error?.message, apiKey)}${causeMessage}`;
      throw new OpenAICompatibleTextReasonerError('REQUEST_FAILED', `模型 API 请求失败：${detail}`, { provider, model, causeCode: cause?.code || null });
    } finally {
      clearStreamTimers();
    }
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
