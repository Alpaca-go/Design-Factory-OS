import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createQwenReasoner } from '../../src/v5/adapters/qwen-reasoner.js';
import { runV5Pipeline } from '../../src/v5/bootstrap.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test('Qwen integration performs one request, caches it, and force-reasoning performs one new request', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-qwen-integration-'));
  const input = path.join(projectRoot, 'input');
  const output = path.join(projectRoot, 'outputs');
  await fs.mkdir(input);
  await fs.writeFile(path.join(input, 'logo.png'), ONE_PIXEL_PNG);
  let calls = 0;
  const reasoner = createQwenReasoner({
    apiKey: 'integration-key',
    model: 'qwen-vl-test',
    client: async () => {
      calls += 1;
      return { id: `qwen-run-${calls}`, model: 'qwen-vl-test', outputText: `# 视觉方案升级报告\n\nRun ${calls}` };
    }
  });

  const first = await runV5Pipeline(input, { projectRoot, output, deepCreativeDirectorReasoner: reasoner });
  const cached = await runV5Pipeline(input, { projectRoot, output, deepCreativeDirectorReasoner: reasoner });
  const forced = await runV5Pipeline(input, {
    projectRoot, output, deepCreativeDirectorReasoner: reasoner, forceReasoning: true
  });

  assert.equal(calls, 2);
  assert.equal(first.result.runReport.modelCallsThisRun, 1);
  assert.equal(first.result.runReport.provider, 'qwen');
  assert.equal(cached.result.runReport.modelCallsThisRun, 0);
  assert.equal(cached.result.runReport.reasoningCacheHit, true);
  assert.equal(forced.result.runReport.modelCallsThisRun, 1);
  assert.equal(forced.result.runReport.reasoningCacheHit, false);
  assert.deepEqual((await fs.readdir(output)).filter((name) => name.endsWith('.md')), ['视觉方案升级报告.md']);
});

test('reasoner factory is not created when the exact reasoning cache is hit', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-lazy-reasoner-'));
  const input = path.join(projectRoot, 'input');
  await fs.mkdir(input);
  await fs.writeFile(path.join(input, 'logo.png'), ONE_PIXEL_PNG);
  const fixtureResult = {
    runId: 'seed-run', provider: 'seed', model: 'seed-model', completedAt: new Date().toISOString(), reportMarkdown: '# Seed report'
  };
  await runV5Pipeline(input, { projectRoot, deepCreativeDirectorReasoner: async () => fixtureResult });
  let factoryCalls = 0;
  const cached = await runV5Pipeline(input, {
    projectRoot,
    deepCreativeDirectorReasonerFactory: () => {
      factoryCalls += 1;
      throw new Error('factory must remain lazy');
    }
  });
  assert.equal(factoryCalls, 0);
  assert.equal(cached.result.runReport.reasoningCacheHit, true);
});
