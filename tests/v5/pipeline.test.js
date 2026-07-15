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
  let receivedPrompt = null;
  const execution = await runV5Pipeline(input, {
    projectRoot,
    output,
    deepCreativeDirectorReasoner: async (context) => {
      calls += 1;
      receivedPrompt = context.prompt;
      return result();
    }
  });
  assert.equal(calls, 1);
  assert.equal(receivedPrompt.modelCalls, 1);
  assert.equal(receivedPrompt.messages.length, 2);
  assert.equal(receivedPrompt.attachments.length, 1);
  assert.equal(execution.result.analysisMode, 'deep');
  assert.equal(execution.result.creativeAuthority, 'maximum');
  assert.deepEqual(execution.result.lockedVisualAssets, ['logo']);
  assert.deepEqual(execution.result.outputFiles, ['视觉方案升级报告.md']);
  assert.equal(execution.result.runReport.fullReasoningRuns, 1);
  assert.equal(execution.result.runReport.promptDigest.length, 64);
  assert.equal(execution.result.runReport.promptModelCalls, 1);
  assert.equal(execution.result.runReport.modelCallsThisRun, 1);
  assert.equal(execution.result.runReport.performanceBudgetStatus, 'within-target');
  assert.equal(execution.result.runReport.visualStrategy, 'all-assets');
  assert.equal(execution.result.runReport.timingScope, 'pipeline-entry-to-report-written');
  assert.equal('compilation' in execution.result, false);
  assert.match(await fs.readFile(path.join(output, '视觉方案升级报告.md'), 'utf8'), /Sprint 1 pipeline output/);
  assert.match(await fs.readFile(path.join(output, '01-Analysis.md'), 'utf8'), /v4 history/);
  assert.equal(JSON.parse(await fs.readFile(path.join(projectRoot, '.runtime', 'run-report.json'), 'utf8')).status, 'success');
});

test('v5 reuses an exact prompt result without a second model call', async () => {
  const { projectRoot, input, output } = await fixture();
  let calls = 0;
  const reasoner = async () => {
    calls += 1;
    return result();
  };
  await runV5Pipeline(input, { projectRoot, output, deepCreativeDirectorReasoner: reasoner });
  const second = await runV5Pipeline(input, { projectRoot, output, deepCreativeDirectorReasoner: reasoner });
  assert.equal(calls, 1);
  assert.equal(second.result.creativeDirector.executionSource, 'reasoning-cache');
  assert.equal(second.result.runReport.modelCallsThisRun, 0);
  assert.equal(second.result.runReport.reasoningCacheHit, true);
  assert.equal(second.result.runReport.fullReasoningRuns, 0);
});

test('v5 rejects retired mode selection before reasoning', async () => {
  const { projectRoot, input, output } = await fixture();
  await assert.rejects(
    runV5Pipeline(input, { projectRoot, output, mode: 'standard', deepCreativeDirectorReasoner: async () => result() }),
    /--mode 已在 v5 废弃/
  );
});

test('v5 records failure stage, wall-clock time, and model-call start', async () => {
  const { projectRoot, input, output } = await fixture();
  await assert.rejects(runV5Pipeline(input, {
    projectRoot,
    output,
    deepCreativeDirectorReasoner: async () => {
      throw new Error('provider unavailable');
    }
  }), /provider unavailable/);
  const report = JSON.parse(await fs.readFile(path.join(projectRoot, '.runtime', 'run-report.json'), 'utf8'));
  assert.equal(report.status, 'failed');
  assert.equal(report.failureStage, 'creative-director');
  assert.equal(report.modelCallStarted, true);
  assert.equal(report.modelCallsThisRun, 1);
  assert.equal(report.timingScope, 'pipeline-entry-to-failure');
  assert.equal(typeof report.totalWallClockTimeMs, 'number');
});
