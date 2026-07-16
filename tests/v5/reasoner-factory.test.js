import test from 'node:test';
import assert from 'node:assert/strict';
import { createReasonerFromEnvironment, ReasonerFactoryError } from '../../src/v5/adapters/reasoner-factory.js';

test('Reasoner Factory selects qwen and codex-host without fallback', async () => {
  const qwen = createReasonerFromEnvironment({
    provider: 'qwen',
    environment: { QWEN_API_KEY: 'test-key', QWEN_MODEL: 'qwen-test' },
    client: async () => ({ id: 'qwen-1', model: 'qwen-test', outputText: '# Report' })
  });
  assert.equal(typeof qwen, 'function');

  const codex = createReasonerFromEnvironment({ provider: 'codex-host', environment: {} });
  assert.equal(typeof codex, 'function');
  await assert.rejects(codex({}), { code: 'CODEX_HOST_RUNNER_UNAVAILABLE' });
});

test('Reasoner Factory rejects empty and unknown providers clearly', () => {
  assert.throws(
    () => createReasonerFromEnvironment({ environment: {} }),
    (error) => error instanceof ReasonerFactoryError && error.code === 'REASONER_PROVIDER_MISSING'
  );
  assert.throws(
    () => createReasonerFromEnvironment({ provider: 'mystery', environment: {} }),
    (error) => error instanceof ReasonerFactoryError && error.code === 'REASONER_PROVIDER_UNSUPPORTED'
  );
});

test('Codex Host only uses an explicitly injected host runner', async () => {
  const reasoner = createReasonerFromEnvironment({
    provider: 'codex-host',
    environment: {},
    model: 'gpt-host-test',
    hostRunner: async (context) => ({ outputText: `# Report\n\n${context.projectName}` })
  });
  const result = await reasoner({ projectName: 'Host Demo', prompt: { attachments: [] } });
  assert.equal(result.provider, 'codex-host');
  assert.equal(result.model, 'gpt-host-test');
  assert.match(result.reportMarkdown, /Host Demo/);
});
