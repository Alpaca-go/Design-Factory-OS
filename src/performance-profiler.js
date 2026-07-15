import { performance } from 'node:perf_hooks';

export const PERFORMANCE_PROFILE_SCHEMA_VERSION = '4.0.0';

export const PERFORMANCE_STAGE_KEYS = Object.freeze([
  'readAssets',
  'brandUnderstanding',
  'industryBenchmark',
  'creativeDecision',
  'compilerPipeline',
  'creativeBrief',
  'review'
]);

export const PERFORMANCE_STAGE_LABELS = Object.freeze({
  readAssets: 'Read Assets',
  brandUnderstanding: 'Brand Understanding',
  industryBenchmark: 'Industry Benchmark',
  creativeDecision: 'Creative Decision',
  compilerPipeline: 'Compiler Pipeline',
  creativeBrief: 'Creative Brief',
  review: 'Review',
  total: 'Total'
});

const STAGE_SET = new Set(PERFORMANCE_STAGE_KEYS);

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

export class PerformanceProfiler {
  constructor(options = {}) {
    this.now = options.now || (() => performance.now());
    this.startedAt = this.now();
    this.completedAt = null;
    this.milliseconds = Object.fromEntries(PERFORMANCE_STAGE_KEYS.map((key) => [key, 0]));
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
    try {
      return operation();
    } finally {
      this.record(stage, startedAt);
    }
  }

  async asyncStage(stage, operation) {
    this.assertStage(stage);
    const startedAt = this.now();
    try {
      return await operation();
    } finally {
      this.record(stage, startedAt);
    }
  }

  complete() {
    if (this.completedAt === null) this.completedAt = this.now();
    return this;
  }

  snapshot(context = {}) {
    this.complete();
    const stages = Object.fromEntries(
      PERFORMANCE_STAGE_KEYS.map((key) => [key, seconds(this.milliseconds[key])])
    );
    return Object.freeze({
      schemaVersion: PERFORMANCE_PROFILE_SCHEMA_VERSION,
      units: 'seconds',
      ...stages,
      total: seconds(Math.max(0, this.completedAt - this.startedAt)),
      context: Object.freeze(normalizedContext(context))
    });
  }
}

export function createPerformanceProfiler(options = {}) {
  return new PerformanceProfiler(options);
}

export function formatPerformanceProfile(profile) {
  const lines = ['Performance Profiling'];
  for (const stage of [...PERFORMANCE_STAGE_KEYS, 'total']) {
    lines.push(`${PERFORMANCE_STAGE_LABELS[stage]}: ${Number(profile[stage] || 0).toFixed(4)} s`);
  }
  return lines.join('\n');
}
