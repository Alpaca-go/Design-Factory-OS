import test from 'node:test';
import assert from 'node:assert/strict';

import { createOpenAICompatibleTextReasoner } from '../../src/v5/adapters/openai-compatible-text-reasoner.js';

const encoder = new TextEncoder();

function sseResponse(chunks, { keepOpen = false } = {}) {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (!keepOpen) controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

test('OpenAI-compatible stream assembles reasoning, content and final usage', async () => {
  let requestBody;
  const events = [];
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret', model: 'qwen3.6-plus', provider: 'qwen',
    baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    client: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return sseResponse([
        'data: {"id":"r1","model":"qwen3.6-plus","choices":[{"delta":{"reasoning_content":"分析"},"finish_reason":null}]}\n\n',
        'data: {"id":"r1","model":"qwen3.6-plus","choices":[{"delta":{"content":"{\\"ok\\":"},"finish_reason":null}]}\n\n',
        'data: {"id":"r1","model":"qwen3.6-plus","choices":[{"delta":{"content":"true}"},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":8,"total_tokens":28}}\n\n',
        'data: [DONE]\n\n'
      ]);
    }
  });
  const result = await reasoner([{ role: 'user', content: 'generate' }], {
    stream: true, enableThinking: true, thinkingBudget: 1000, maxOutputTokens: 20000,
    firstActivityTimeoutMs: 100, streamIdleTimeoutMs: 100,
    onStreamEvent: (event) => events.push(event)
  });
  assert.equal(result.text, '{"ok":true}');
  assert.equal(result.usage.outputTokens, 8);
  assert.equal(requestBody.stream, true);
  assert.deepEqual(requestBody.stream_options, { include_usage: true });
  assert.equal(requestBody.thinking_budget, 1000);
  assert.ok(events.some((event) => event.type === 'first_reasoning_token'));
  assert.ok(events.some((event) => event.type === 'first_content_token'));
  assert.equal(events.at(-1).type, 'end');
});

test('stream rejects when no reasoning or content activity arrives', async () => {
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret', model: 'qwen3.6-plus',
    baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    client: async () => sseResponse([], { keepOpen: true })
  });
  await assert.rejects(() => reasoner([{ role: 'user', content: 'generate' }], {
    stream: true, firstActivityTimeoutMs: 10, requestTimeoutMs: 100
  }), (error) => error.code === 'STEP4_FIRST_ACTIVITY_TIMEOUT');
});

test('stream idle timeout counts reasoning as activity and then rejects after silence', async () => {
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret', model: 'qwen3.6-plus',
    baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    client: async () => sseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"仍在分析"},"finish_reason":null}]}\n\n'
    ], { keepOpen: true })
  });
  await assert.rejects(() => reasoner([{ role: 'user', content: 'generate' }], {
    stream: true, firstActivityTimeoutMs: 100, streamIdleTimeoutMs: 10, requestTimeoutMs: 200
  }), (error) => error.code === 'STEP4_STREAM_IDLE_TIMEOUT');
});

test('stream hard timeout has a Step 4 specific error code', async () => {
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret', model: 'qwen3.6-plus',
    baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    client: async () => sseResponse([], { keepOpen: true })
  });
  await assert.rejects(() => reasoner([{ role: 'user', content: 'generate' }], {
    stream: true, requestTimeoutMs: 10, timeoutErrorCode: 'STEP4_PROVIDER_HARD_TIMEOUT'
  }), (error) => error.code === 'STEP4_PROVIDER_HARD_TIMEOUT');
});

test('streamed length finish reason is still surfaced as OUTPUT_TRUNCATED', async () => {
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret', model: 'qwen3.6-plus',
    baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    client: async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"{\\"broken\\":"},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n'
    ])
  });
  await assert.rejects(() => reasoner([{ role: 'user', content: 'generate' }], {
    stream: true, firstActivityTimeoutMs: 100, streamIdleTimeoutMs: 100
  }), (error) => error.code === 'OUTPUT_TRUNCATED');
});

test('stream request safely accepts a provider that falls back to JSON', async () => {
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret', model: 'compatible-model', baseUrl: 'https://example.test/v1',
    client: async () => new Response(JSON.stringify({
      id: 'fallback', model: 'compatible-model',
      choices: [{ finish_reason: 'stop', message: { content: '{"fallback":true}' } }],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  });
  const result = await reasoner([{ role: 'user', content: 'generate' }], {
    stream: true, firstActivityTimeoutMs: 100, requestTimeoutMs: 200
  });
  assert.equal(result.text, '{"fallback":true}');
  assert.equal(result.usage.outputTokens, 3);
});
