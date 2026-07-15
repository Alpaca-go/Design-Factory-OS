import {
  DEFAULT_RUNTIME_THRESHOLDS,
  RUNTIME_STAGE_LABELS,
  RUNTIME_STAGE_ORDER,
  RuntimeTraceCollector,
  measureRuntimeStage,
  measureRuntimeStageSync,
  runtimeTraceFromError
} from './runtime-trace.js';

export const PERFORMANCE_PROFILE_SCHEMA_VERSION = '1.0.0';
export const PERFORMANCE_STAGE_KEYS = RUNTIME_STAGE_ORDER;
export const PERFORMANCE_STAGE_LABELS = RUNTIME_STAGE_LABELS;

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Runtime Trace collector. It owns no CLI stopwatch. Actual work modules call
 * syncStage/asyncStage themselves or contribute Provider-generated traces.
 */
export class PerformanceProfiler extends RuntimeTraceCollector {
  constructor(options = {}) {
    super(options);
    this.clock = options.clock;
    this.stack = [];
  }

  assertStage(stage) {
    if (!RUNTIME_STAGE_ORDER.includes(stage)) throw new Error(`未知 Performance Stage：${stage}`);
  }

  syncStage(stage, operation, options = {}) {
    this.assertStage(stage);
    const parentSpan = this.stack.at(-1) || null;
    try {
      const provider = options.provider || (['compilerPipeline', 'creativeBrief'].includes(stage) ? 'compiler' : 'local');
      const measured = measureRuntimeStageSync(stage, { ...options, provider, clock: options.clock || this.clock }, (span) => {
        this.stack.push(span);
        try { return operation(); }
        finally { this.stack.pop(); }
      });
      if (parentSpan) parentSpan.addChild(measured.runtimeTrace);
      else this.add(measured.runtimeTrace);
      return measured.value;
    } catch (error) {
      const trace = runtimeTraceFromError(error);
      if (trace) {
        if (parentSpan) parentSpan.addChild(trace);
        else this.add(trace);
      }
      throw error;
    }
  }

  async asyncStage(stage, operation, options = {}) {
    this.assertStage(stage);
    const parentSpan = this.stack.at(-1) || null;
    try {
      const provider = options.provider || (['compilerPipeline', 'creativeBrief'].includes(stage) ? 'compiler' : 'local');
      const measured = await measureRuntimeStage(stage, { ...options, provider, clock: options.clock || this.clock }, async (span) => {
        this.stack.push(span);
        try { return await operation(); }
        finally { this.stack.pop(); }
      });
      if (parentSpan) parentSpan.addChild(measured.runtimeTrace);
      else this.add(measured.runtimeTrace);
      return measured.value;
    } catch (error) {
      const trace = runtimeTraceFromError(error);
      if (trace) {
        if (parentSpan) parentSpan.addChild(trace);
        else this.add(trace);
      }
      throw error;
    }
  }
}

export function createPerformanceProfiler(options = {}) {
  return new PerformanceProfiler(options);
}

export function formatPerformanceProfile(profile) {
  const byStage = new Map((profile.stageSummary || []).map((item) => [item.stage, item]));
  const lines = ['[Performance]', ''];
  RUNTIME_STAGE_ORDER.forEach((stage, index) => {
    const item = byStage.get(stage);
    const duration = item ? formatDuration(item.durationMs) : '--:--';
    const status = item && item.status !== 'success' ? `  ${item.status.toUpperCase()}` : '';
    lines.push(`${pad(index + 1)} ${(RUNTIME_STAGE_LABELS[stage] || stage).padEnd(25)} ${duration}${status}`);
  });
  lines.push('----------------------------------------');
  lines.push(`Total${' '.repeat(23)} ${formatDuration(profile.totalDurationMs || 0)}`);
  if (profile.slowestStage) {
    const slowest = byStage.get(profile.slowestStage);
    lines.push('', 'Slowest Stage:');
    lines.push(`${slowest?.label || profile.slowestStage}  ${formatDuration(profile.slowestStageDurationMs)} (${profile.slowestStagePercent}%)`);
  }
  for (const warning of profile.warnings || []) {
    const marker = warning.severity === 'critical' ? 'CRITICAL' : 'WARNING';
    lines.push(`⚠ ${warning.stage}: ${warning.message} — ${marker}`);
  }
  return lines.join('\n');
}

export { DEFAULT_RUNTIME_THRESHOLDS };
