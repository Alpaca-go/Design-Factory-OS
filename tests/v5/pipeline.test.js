import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runV5Pipeline } from '../../src/v5/bootstrap.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

async function fixture() {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-v5-'));
  const input = path.join(projectRoot, 'input');
  const output = path.join(projectRoot, 'outputs');
  await fs.mkdir(input, { recursive: true });
  await fs.writeFile(path.join(input, 'logo.png'), ONE_PIXEL_PNG);
  await fs.writeFile(path.join(output, '01-Analysis.md'), '# v4 history\n').catch(async (error) => {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, '01-Analysis.md'), '# v4 history\n');
  });
  return { projectRoot, input, output };
}

function result() {
  return {
    runId: 'deep-run-1',
    provider: 'test-provider',
    model: 'test-model',
    completedAt: new Date().toISOString(),
    reportMarkdown: '# 项目视觉方案升级报告\n\nSprint 1 pipeline output.'
  };
}

test('v5 performs one reasoning call, skips Compilers and publishes one official document', async () => {
  const { projectRoot, input, output } = await fixture();
  let calls = 0;
  const execution = await runV5Pipeline(input, {
    projectRoot,
    output,
    deepCreativeDirectorReasoner: async () => {
      calls += 1;
      return result();
    }
  });
  assert.equal(calls, 1);
  assert.equal(execution.result.analysisMode, 'deep');
  assert.equal(execution.result.creativeAuthority, 'maximum');
  assert.deepEqual(execution.result.lockedVisualAssets, ['logo']);
  assert.deepEqual(execution.result.outputFiles, ['视觉方案升级报告.md']);
  assert.equal(execution.result.runReport.fullReasoningRuns, 1);
  assert.equal('compilation' in execution.result, false);
  assert.match(await fs.readFile(path.join(output, '视觉方案升级报告.md'), 'utf8'), /Sprint 1 pipeline output/);
  assert.match(await fs.readFile(path.join(output, '01-Analysis.md'), 'utf8'), /v4 history/);
  assert.equal(JSON.parse(await fs.readFile(path.join(projectRoot, '.runtime', 'run-report.json'), 'utf8')).status, 'success');
});

test('v5 rejects retired mode selection before reasoning', async () => {
  const { projectRoot, input, output } = await fixture();
  await assert.rejects(
    runV5Pipeline(input, { projectRoot, output, mode: 'standard', deepCreativeDirectorReasoner: async () => result() }),
    /--mode 已在 v5 废弃/
  );
});
