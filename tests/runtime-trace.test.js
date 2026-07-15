import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RuntimeTraceCollector,
  RuntimeTraceValidationError,
  validateRuntimeTrace
} from '../src/runtime-trace.js';

function trace(stage, startedAt, durationMs, extra = {}) {
  return {
    stage,
    label: extra.label || stage,
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + durationMs).toISOString(),
    durationMs,
    status: extra.status || 'success',
    attempts: extra.attempts || 1,
    provider: extra.provider || 'test-provider',
    inputCount: extra.inputCount ?? 1,
    outputCount: extra.outputCount ?? 1,
    errorCode: extra.errorCode ?? null,
    errorMessage: extra.errorMessage ?? null,
    ...(extra.children ? { children: extra.children } : {}),
    ...(extra.metrics ? { metrics: extra.metrics } : {})
  };
}

test('Runtime Trace validates mandatory stage fields and rejects invalid Provider traces', () => {
  const valid = trace('brandUnderstanding', '2026-07-15T00:00:00.000Z', 1000, { provider: 'ai' });
  assert.equal(validateRuntimeTrace(valid, { stage: 'brandUnderstanding' }), valid);
  assert.throws(
    () => validateRuntimeTrace({ ...valid, durationMs: -1 }),
    (error) => error instanceof RuntimeTraceValidationError && error.code === 'TRACE_INVALID'
  );
  assert.throws(
    () => validateRuntimeTrace(valid, { stage: 'industryBenchmark' }),
    (error) => error.code === 'TRACE_STAGE_MISMATCH'
  );
});

test('Runtime Trace marks slow stages, counts calls and never double-sums nested elapsed time', () => {
  const collector = new RuntimeTraceCollector();
  const creativeBrief = trace('creativeBrief', '2026-07-15T00:08:00.000Z', 60_000, { provider: 'compiler' });
  const unsafeProviderTrace = trace('brandUnderstanding', '2026-07-15T00:00:00.000Z', 200_000, {
    provider: 'ai', metrics: { aiCalls: 1, fileReads: 34 }
  });
  unsafeProviderTrace.prompt = 'must never persist';
  unsafeProviderTrace.apiKey = 'secret';
  collector.add(unsafeProviderTrace);
  collector.add(trace('industryBenchmark', '2026-07-15T00:03:20.000Z', 400_000, {
    provider: 'web+ai', metrics: { aiCalls: 1, webSearchCalls: 6, retries: 1 }
  }));
  collector.add(trace('compilerPipeline', '2026-07-15T00:08:00.000Z', 120_000, {
    provider: 'compiler', children: [creativeBrief]
  }));
  const profile = collector.snapshot({ project: '真实项目' });

  assert.equal(profile.totalDurationMs, 600_000);
  assert.equal(profile.slowestStage, 'industryBenchmark');
  assert.equal(profile.slowestStagePercent, 66.7);
  assert.ok(profile.warnings.some((item) => item.stage === 'brandUnderstanding' && item.severity === 'warning'));
  assert.ok(profile.warnings.some((item) => item.stage === 'industryBenchmark' && item.severity === 'critical'));
  assert.deepEqual(profile.counters, { aiCalls: 2, webSearchCalls: 6, fileReads: 34, retries: 1 });
  assert.equal(profile.stageSummary.find((item) => item.stage === 'creativeBrief').durationMs, 60_000);
  assert.doesNotMatch(JSON.stringify(profile), /must never persist|apiKey|secret/);
});

test('failure trace keeps completed stages and marks all downstream stages blocked', () => {
  const collector = new RuntimeTraceCollector();
  collector.add(trace('readAssets', '2026-07-15T00:00:00.000Z', 1000, { provider: 'filesystem' }));
  const failure = Object.assign(new Error('network timeout'), { code: 'WEB_TIMEOUT' });
  collector.add(trace('industryBenchmark', '2026-07-15T00:00:01.000Z', 5000, {
    provider: 'web', status: 'failed', errorCode: failure.code, errorMessage: failure.message
  }));
  collector.blockAfter('industryBenchmark', failure);
  const profile = collector.snapshot({ failed: true });

  assert.equal(profile.stageSummary.find((item) => item.stage === 'readAssets').status, 'success');
  assert.equal(profile.stageSummary.find((item) => item.stage === 'industryBenchmark').status, 'failed');
  for (const stage of ['creativeDecision', 'stateValidation', 'compilerPipeline', 'creativeBrief', 'designReview', 'outputPublishing']) {
    assert.equal(profile.stageSummary.find((item) => item.stage === stage).status, 'blocked');
  }
});
