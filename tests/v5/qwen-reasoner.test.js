import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createQwenReasoner, QwenReasonerError } from '../../src/v5/adapters/qwen-reasoner.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

async function contextFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-qwen-'));
  const image = path.join(root, 'contact-sheet.png');
  const markdown = path.join(root, 'brief.md');
  const pdf = path.join(root, 'source.pdf');
  await fs.writeFile(image, ONE_PIXEL_PNG);
  await fs.writeFile(markdown, '# Source brief\nVerified text');
  await fs.writeFile(pdf, '%PDF fixture');
  return {
    projectName: 'Qwen Demo',
    signal: new AbortController().signal,
    maximumDurationMs: 1000,
    prompt: {
      messages: [
        { role: 'system', content: 'System contract' },
        { role: 'user', content: 'User contract' }
      ],
      attachments: [
        { assetId: 'contact-sheet', path: image, mediaType: 'image', readable: true },
        { assetId: 'asset-001', path: markdown, mediaType: 'document', readable: true },
        { assetId: 'asset-002', path: pdf, mediaType: 'document', readable: true }
      ]
    }
  };
}

test('Qwen Reasoner sends one multimodal request with asset labels and readable text documents', async () => {
  const context = await contextFixture();
  const requests = [];
  const diagnostics = [];
  const reasoner = createQwenReasoner({
    apiKey: 'test-secret',
    model: 'qwen-vl-test',
    baseUrl: 'https://example.test/compatible-mode/v1',
    client: async (request) => {
      requests.push(request);
      return { id: 'mock-qwen-run-001', model: 'mock-qwen-vl', outputText: '# 视觉方案升级报告\n\n测试内容' };
    },
    onDiagnostic: (entry) => diagnostics.push(entry)
  });
  const result = await reasoner(context);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://example.test/compatible-mode/v1/chat/completions');
  assert.equal(requests[0].body.messages.length, 2);
  const userContent = requests[0].body.messages[1].content;
  assert.equal(userContent.filter((item) => item.type === 'image_url').length, 1);
  assert.match(userContent.find((item) => item.type === 'image_url').image_url.url, /^data:image\/jpeg;base64,/);
  assert.match(userContent.find((item) => item.text?.includes('文档附件'))?.text, /Verified text/);
  assert.ok(diagnostics.some((item) => item.assetId === 'contact-sheet' && item.status === 'attached-as-optimized-image'));
  assert.ok(diagnostics.some((item) => item.assetId === 'asset-002' && item.status === 'manifest-only'));
  assert.equal(result.provider, 'qwen');
  assert.equal(result.runId, 'mock-qwen-run-001');
  assert.deepEqual(result.inspectedAssetIds, ['contact-sheet']);
});

test('Qwen Reasoner validates required credentials and model', () => {
  assert.throws(
    () => createQwenReasoner({ environment: { QWEN_MODEL: 'qwen-vl' } }),
    (error) => error instanceof QwenReasonerError && error.code === 'QWEN_API_KEY_MISSING'
  );
  assert.throws(
    () => createQwenReasoner({ environment: { QWEN_API_KEY: 'key' } }),
    (error) => error instanceof QwenReasonerError && error.code === 'QWEN_MODEL_MISSING'
  );
});

test('Qwen Reasoner rejects empty reports and redacts secrets from client errors', async () => {
  const context = await contextFixture();
  const empty = createQwenReasoner({
    apiKey: 'empty-key', model: 'qwen-vl', client: async () => ({ choices: [{ message: { content: '' } }] })
  });
  await assert.rejects(empty(context), { code: 'QWEN_EMPTY_REPORT' });

  const secret = 'never-print-this-key';
  const failing = createQwenReasoner({
    apiKey: secret, model: 'qwen-vl', client: async () => { throw new Error(`provider rejected ${secret}`); }
  });
  await assert.rejects(failing(context), (error) => {
    assert.equal(error.code, 'QWEN_REQUEST_FAILED');
    assert.doesNotMatch(error.message, new RegExp(secret));
    assert.match(error.message, /\[REDACTED\]/);
    return true;
  });
});
