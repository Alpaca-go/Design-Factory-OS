import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERFORMANCE_STAGE_KEYS,
  createPerformanceProfiler,
  formatPerformanceProfile
} from '../src/performance-profiler.js';
import {
  compileCreativeDecisionState,
  profileCreativeDecisionState
} from '../src/compiler-pipeline.js';
import { canonicalStringify } from '../src/creative-decision-state.js';
import { createV4CompilerState } from './fixtures/v4-creative-decision-state.js';

function deterministicClock(read) {
  const base = Date.parse('2026-07-15T00:00:00.000Z');
  return {
    monotonicNow: read,
    wallNow: () => new Date(base + read())
  };
}

function summary(profile, stage) {
  return profile.stageSummary.find((item) => item.stage === stage);
}

test('Runtime Trace aggregates module-owned stages without a CLI stopwatch', async () => {
  let clock = 0;
  const profiler = createPerformanceProfiler({ clock: deterministicClock(() => clock) });

  profiler.syncStage('readAssets', () => { clock += 1500; }, { provider: 'filesystem' });
  profiler.syncStage('brandUnderstanding', () => { clock += 200; }, { provider: 'ai' });
  profiler.syncStage('brandUnderstanding', () => { clock += 300; }, { provider: 'ai' });
  await profiler.asyncStage('industryBenchmark', async () => { clock += 2000; }, { provider: 'web+ai' });
  profiler.syncStage('compilerPipeline', () => {
    clock += 100;
    profiler.syncStage('creativeBrief', () => { clock += 250; });
    clock += 150;
  });
  profiler.syncStage('designReview', () => { clock += 500; }, { provider: 'review' });

  const profile = profiler.snapshot({ decisionId: 'decision-profile', inputImages: 12 });
  assert.equal(profile.schemaVersion, '1.0.0');
  assert.equal(profile.totalDurationMs, 5000);
  assert.equal(summary(profile, 'readAssets').durationMs, 1500);
  assert.equal(summary(profile, 'brandUnderstanding').durationMs, 500);
  assert.equal(summary(profile, 'brandUnderstanding').attempts, 2);
  assert.equal(summary(profile, 'brandUnderstanding').duplicateInvocation, true);
  assert.equal(summary(profile, 'industryBenchmark').durationMs, 2000);
  assert.equal(summary(profile, 'compilerPipeline').durationMs, 500);
  assert.equal(summary(profile, 'creativeBrief').durationMs, 250);
  assert.equal(profile.slowestStage, 'industryBenchmark');
  assert.equal(profile.context.decisionId, 'decision-profile');
  assert.equal(profile.context.inputImages, 12);
  assert.ok(profile.warnings.some((item) => item.code === 'DUPLICATE_STAGE_INVOCATION'));
  assert.equal(Object.isFrozen(profile), true);
});
test('Profiler rejects unknown stages and preserves failed stage trace', () => {
  let clock = 0;
  const profiler = createPerformanceProfiler({ clock: deterministicClock(() => clock) });
  assert.throws(() => profiler.syncStage('unknown', () => {}), /未知 Performance Stage/);
  assert.throws(() => profiler.syncStage('designReview', () => {
    clock += 400;
    const error = new Error('review failed');
    error.code = 'REVIEW_FAILED';
    throw error;
  }), /review failed/);
  const failed = summary(profiler.snapshot(), 'designReview');
  assert.equal(failed.durationMs, 400);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errorCode, 'REVIEW_FAILED');
  assert.equal(failed.errorMessage, 'review failed');
});

test('v4 Compiler Runtime Trace is separate from deterministic Compiler output', () => {
  const state = createV4CompilerState();
  const direct = compileCreativeDecisionState(state);
  const profiled = profileCreativeDecisionState(state, { context: { inputImages: 3 } });

  assert.equal(canonicalStringify(profiled.result), canonicalStringify(direct));
  assert.equal(profiled.performance.context.decisionId, state.meta.decisionId);
  assert.equal(profiled.performance.context.inputImages, 3);
  assert.equal(typeof summary(profiled.performance, 'compilerPipeline').durationMs, 'number');
  assert.equal(typeof summary(profiled.performance, 'creativeBrief').durationMs, 'number');
  assert.ok(summary(profiled.performance, 'compilerPipeline').durationMs >= summary(profiled.performance, 'creativeBrief').durationMs);
  assert.equal('performance' in profiled.result, false);
});

test('console formatter presents all nine Runtime Trace stages, total and slowest stage', () => {
  let clock = 0;
  const profiler = createPerformanceProfiler({ clock: deterministicClock(() => clock) });
  profiler.syncStage('readAssets', () => { clock += 1000; });
  const output = formatPerformanceProfile(profiler.snapshot());
  for (const label of [
    'Read Assets', 'Brand Understanding', 'Industry Benchmark', 'Creative Decision',
    'State Validation', 'Compiler Pipeline', 'Creative Brief', 'Design Review',
    'Output Publishing', 'Total', 'Slowest Stage'
  ]) assert.match(output, new RegExp(label));
  assert.deepEqual(PERFORMANCE_STAGE_KEYS, [
    'readAssets', 'brandUnderstanding', 'industryBenchmark', 'creativeDecision',
    'stateValidation', 'compilerPipeline', 'creativeBrief', 'designReview', 'outputPublishing'
  ]);
});
