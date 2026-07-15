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

test('Performance Profiler accumulates fixed stages and total with deterministic units', async () => {
  let clock = 0;
  const profiler = createPerformanceProfiler({ now: () => clock });

  profiler.syncStage('readAssets', () => { clock += 1500; });
  profiler.syncStage('brandUnderstanding', () => { clock += 200; });
  profiler.syncStage('brandUnderstanding', () => { clock += 300; });
  await profiler.asyncStage('industryBenchmark', async () => { clock += 2000; });
  profiler.syncStage('compilerPipeline', () => {
    clock += 100;
    profiler.syncStage('creativeBrief', () => { clock += 250; });
    clock += 150;
  });
  profiler.syncStage('review', () => { clock += 500; });

  const profile = profiler.snapshot({ decisionId: 'decision-profile', inputImages: 12 });
  assert.deepEqual(Object.keys(profile), [
    'schemaVersion', 'units', ...PERFORMANCE_STAGE_KEYS, 'total', 'context'
  ]);
  assert.equal(profile.readAssets, 1.5);
  assert.equal(profile.brandUnderstanding, 0.5);
  assert.equal(profile.industryBenchmark, 2);
  assert.equal(profile.creativeDecision, 0);
  assert.equal(profile.compilerPipeline, 0.5);
  assert.equal(profile.creativeBrief, 0.25);
  assert.equal(profile.review, 0.5);
  assert.equal(profile.total, 5);
  assert.equal(profile.context.decisionId, 'decision-profile');
  assert.equal(profile.context.inputImages, 12);
  assert.equal(profile.context.tokens, null);
  assert.equal(Object.isFrozen(profile), true);
});

test('Profiler rejects unknown stages and still records a failed stage duration', () => {
  let clock = 0;
  const profiler = createPerformanceProfiler({ now: () => clock });
  assert.throws(() => profiler.syncStage('unknown', () => {}), /未知 Performance Stage/);
  assert.throws(() => profiler.syncStage('review', () => {
    clock += 400;
    throw new Error('review failed');
  }), /review failed/);
  assert.equal(profiler.snapshot().review, 0.4);
});

test('v4 Compiler profiling is separate from deterministic Compiler output', () => {
  const state = createV4CompilerState();
  const direct = compileCreativeDecisionState(state);
  const profiled = profileCreativeDecisionState(state, { context: { inputImages: 3 } });

  assert.equal(canonicalStringify(profiled.result), canonicalStringify(direct));
  assert.equal(profiled.performance.context.decisionId, state.meta.decisionId);
  assert.equal(profiled.performance.context.inputImages, 3);
  assert.equal(typeof profiled.performance.compilerPipeline, 'number');
  assert.equal(typeof profiled.performance.creativeBrief, 'number');
  assert.ok(profiled.performance.compilerPipeline >= profiled.performance.creativeBrief);
  for (const stage of ['readAssets', 'brandUnderstanding', 'industryBenchmark', 'creativeDecision', 'review']) {
    assert.equal(profiled.performance[stage], 0);
  }
  assert.equal('performance' in profiled.result, false);
});

test('console formatter always presents the seven stages and total', () => {
  const profiler = createPerformanceProfiler({ now: () => 0 });
  const output = formatPerformanceProfile(profiler.snapshot());
  for (const label of [
    'Read Assets', 'Brand Understanding', 'Industry Benchmark', 'Creative Decision',
    'Compiler Pipeline', 'Creative Brief', 'Review', 'Total'
  ]) assert.match(output, new RegExp(`${label}:`));
});
