import { performance } from 'node:perf_hooks';

const STAGES = Object.freeze([
  'readAssets', 'brandUnderstanding', 'industryBenchmark', 'creativeDecision',
  'compilerPipeline', 'creativeBrief', 'review'
]);

const STAGE_SET = new Set(STAGES);

function seconds(milliseconds) {
  return Number((milliseconds / 1000).toFixed(6));
}

function normalizedContext(context = {}) {
  return {
    decisionId: context.decisionId ?? null,
    mode: context.mode ?? null,
    model: context.model ?? null,
    provider: context.provider ?? null,
    inputImages: context.inputImages ?? null,
    tokens: context.tokens ?? null,
    publicNetworkRequests: context.publicNetworkRequests ?? null,
    cacheHits: context.cacheHits ?? null,
    retries: context.retries ?? null,
    schemaValidationFailures: context.schemaValidationFailures ?? null
  };
}

class LegacyPerformanceProfiler {
  constructor(options = {}) {
    this.now = options.now || (() => performance.now());
    this.startedAt = this.now();
    this.completedAt = null;
    this.milliseconds = Object.fromEntries(STAGES.map((key) => [key, 0]));
  }

  assertStage(stage) {
    if (!STAGE_SET.has(stage)) throw new Error(`未知 Performance Stage：${stage}`);
  }

  record(stage, startedAt) {
    this.milliseconds[stage] += Math.max(0, this.now() - startedAt);
  }

  syncStage(stage, operation) {
    this.assertStage(stage);
    const startedAt = this.now();
    try { return operation(); }
    finally { this.record(stage, startedAt); }
  }

  async asyncStage(stage, operation) {
    this.assertStage(stage);
    const startedAt = this.now();
    try { return await operation(); }
    finally { this.record(stage, startedAt); }
  }

  snapshot(context = {}) {
    if (this.completedAt === null) this.completedAt = this.now();
    return Object.freeze({
      schemaVersion: '4.0.0',
      units: 'seconds',
      ...Object.fromEntries(STAGES.map((key) => [key, seconds(this.milliseconds[key])])),
      total: seconds(Math.max(0, this.completedAt - this.startedAt)),
      context: Object.freeze(normalizedContext(context))
    });
  }
}

export function createLegacyPerformanceProfiler(options = {}) {
  return new LegacyPerformanceProfiler(options);
}

