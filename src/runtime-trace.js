import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

export const RUNTIME_TRACE_SCHEMA_VERSION = '1.0.0';

export const RUNTIME_STAGE_ORDER = Object.freeze([
  'readAssets',
  'brandUnderstanding',
  'industryBenchmark',
  'creativeDecision',
  'stateValidation',
  'compilerPipeline',
  'creativeBrief',
  'designReview',
  'outputPublishing'
]);

export const RUNTIME_STAGE_LABELS = Object.freeze({
  readAssets: 'Read Assets',
  brandUnderstanding: 'Brand Understanding',
  industryBenchmark: 'Industry Benchmark',
  creativeDecision: 'Creative Decision',
  stateValidation: 'State Validation',
  compilerPipeline: 'Compiler Pipeline',
  creativeBrief: 'Creative Brief',
  designReview: 'Design Review',
  outputPublishing: 'Output Publishing',
  total: 'Total'
});

export const DEFAULT_RUNTIME_THRESHOLDS = Object.freeze({
  warningMs: 180_000,
  criticalMs: 360_000
});

const TRACE_STATUSES = new Set(['success', 'failed', 'skipped', 'blocked']);
const STAGE_ORDER = new Map(RUNTIME_STAGE_ORDER.map((stage, index) => [stage, index]));
const TRACE_SYMBOL = Symbol.for('masterpiece-os.runtime-trace');

function clone(value) {
  return structuredClone(value);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function iso(value) {
  return new Date(value).toISOString();
}

function traceClock(options = {}) {
  return {
    monotonicNow: options.monotonicNow || (() => performance.now()),
    wallNow: options.wallNow || (() => new Date())
  };
}

function errorSummary(error) {
  return {
    errorCode: nonEmptyString(error?.code) ? error.code : (error?.name || 'RUNTIME_STAGE_FAILED'),
    errorMessage: nonEmptyString(error?.message) ? error.message : String(error || 'Unknown error')
  };
}

function normalizedCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function sanitizedMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') return undefined;
  const allowed = {};
  for (const key of ['aiCalls', 'webSearchCalls', 'fileReads', 'retries']) {
    if (Number.isInteger(metrics[key]) && metrics[key] >= 0) allowed[key] = metrics[key];
  }
  return Object.keys(allowed).length ? allowed : undefined;
}

export function sanitizeRuntimeTrace(trace) {
  validateRuntimeTrace(trace);
  const metrics = sanitizedMetrics(trace.metrics);
  return {
    stage: trace.stage,
    label: trace.label,
    startedAt: trace.startedAt,
    endedAt: trace.endedAt,
    durationMs: trace.durationMs,
    status: trace.status,
    attempts: trace.attempts,
    provider: trace.provider,
    inputCount: trace.inputCount,
    outputCount: trace.outputCount,
    errorCode: trace.errorCode,
    errorMessage: trace.errorMessage,
    ...(Array.isArray(trace.children) && trace.children.length
      ? { children: trace.children.map(sanitizeRuntimeTrace) }
      : {}),
    ...(metrics ? { metrics } : {})
  };
}

export function failRuntimeTrace(trace, error) {
  const clean = sanitizeRuntimeTrace(trace);
  const summary = errorSummary(error);
  return {
    ...clean,
    status: 'failed',
    errorCode: summary.errorCode,
    errorMessage: summary.errorMessage
  };
}

export class RuntimeTraceValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RuntimeTraceValidationError';
    this.code = code;
  }
}

export function validateRuntimeTrace(trace, options = {}) {
  const path = options.path || 'runtimeTrace';
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) {
    throw new RuntimeTraceValidationError('TRACE_INVALID', `${path} 必须是对象`);
  }
  if (!nonEmptyString(trace.stage)) throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.stage 必须是非空字符串`);
  if (options.stage && trace.stage !== options.stage) {
    throw new RuntimeTraceValidationError('TRACE_STAGE_MISMATCH', `${path}.stage 必须为 ${options.stage}`);
  }
  if (!nonEmptyString(trace.label)) throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.label 必须是非空字符串`);
  if (!nonEmptyString(trace.startedAt) || Number.isNaN(Date.parse(trace.startedAt))) {
    throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.startedAt 必须是 ISO 时间`);
  }
  if (!nonEmptyString(trace.endedAt) || Number.isNaN(Date.parse(trace.endedAt))) {
    throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.endedAt 必须是 ISO 时间`);
  }
  if (Date.parse(trace.endedAt) < Date.parse(trace.startedAt)) {
    throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.endedAt 不得早于 startedAt`);
  }
  if (!finiteNumber(trace.durationMs) || trace.durationMs < 0) {
    throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.durationMs 必须是非负数`);
  }
  if (!TRACE_STATUSES.has(trace.status)) {
    throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.status 必须是 success / failed / skipped / blocked`);
  }
  if (!Number.isInteger(trace.attempts) || trace.attempts < 1) {
    throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.attempts 必须是正整数`);
  }
  if (!nonEmptyString(trace.provider)) throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.provider 必须是非空字符串`);
  for (const field of ['inputCount', 'outputCount']) {
    if (trace[field] !== null && (!Number.isInteger(trace[field]) || trace[field] < 0)) {
      throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.${field} 必须是非负整数或 null`);
    }
  }
  for (const field of ['errorCode', 'errorMessage']) {
    if (trace[field] !== null && !nonEmptyString(trace[field])) {
      throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.${field} 必须是非空字符串或 null`);
    }
  }
  if (trace.status === 'failed' && !nonEmptyString(trace.errorMessage)) {
    throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.failed 必须包含 errorMessage`);
  }
  if (trace.children !== undefined) {
    if (!Array.isArray(trace.children)) throw new RuntimeTraceValidationError('TRACE_INVALID', `${path}.children 必须是数组`);
    trace.children.forEach((child, index) => validateRuntimeTrace(child, { path: `${path}.children[${index}]` }));
  }
  return trace;
}

export function startRuntimeStage(stage, options = {}) {
  if (!nonEmptyString(stage)) throw new RuntimeTraceValidationError('TRACE_STAGE_REQUIRED', 'stage 必须是非空字符串');
  const clock = traceClock(options.clock);
  const startedMono = clock.monotonicNow();
  const startedWall = clock.wallNow();
  const children = [];
  let completed = false;

  function finish(status, details = {}) {
    if (completed) throw new RuntimeTraceValidationError('TRACE_ALREADY_COMPLETED', `${stage} Runtime Trace 已结束`);
    completed = true;
    const endedWall = clock.wallNow();
    const durationMs = Math.max(0, clock.monotonicNow() - startedMono);
    const trace = {
      stage,
      label: options.label || RUNTIME_STAGE_LABELS[stage] || stage,
      startedAt: iso(startedWall),
      endedAt: iso(endedWall),
      durationMs: Number(durationMs.toFixed(3)),
      status,
      attempts: Number.isInteger(details.attempts) && details.attempts > 0 ? details.attempts : 1,
      provider: details.provider || options.provider || 'local',
      inputCount: normalizedCount(details.inputCount ?? options.inputCount),
      outputCount: normalizedCount(details.outputCount ?? options.outputCount),
      errorCode: details.errorCode ?? null,
      errorMessage: details.errorMessage ?? null,
      ...(children.length ? { children: children.map(clone) } : {}),
      ...(details.metrics && typeof details.metrics === 'object' ? { metrics: clone(details.metrics) } : {})
    };
    validateRuntimeTrace(trace);
    return Object.freeze(trace);
  }

  return Object.freeze({
    addChild(trace) {
      validateRuntimeTrace(trace);
      children.push(clone(trace));
      return this;
    },
    success(details = {}) {
      return finish('success', details);
    },
    fail(error, details = {}) {
      return finish('failed', { ...errorSummary(error), ...details });
    },
    skip(details = {}) {
      return finish('skipped', details);
    },
    block(details = {}) {
      return finish('blocked', details);
    }
  });
}

export function attachRuntimeTrace(error, trace) {
  if (error && typeof error === 'object') {
    Object.defineProperty(error, TRACE_SYMBOL, { value: trace, configurable: true });
  }
  return error;
}

export function runtimeTraceFromError(error) {
  return error?.[TRACE_SYMBOL] || null;
}

export async function measureRuntimeStage(stage, options, operation) {
  const span = startRuntimeStage(stage, options);
  try {
    const value = await operation(span);
    const details = typeof options?.resultDetails === 'function' ? options.resultDetails(value) : {};
    return { value, runtimeTrace: span.success(details) };
  } catch (error) {
    const runtimeTrace = span.fail(error);
    attachRuntimeTrace(error, runtimeTrace);
    throw error;
  }
}

export function measureRuntimeStageSync(stage, options, operation) {
  const span = startRuntimeStage(stage, options);
  try {
    const value = operation(span);
    const details = typeof options?.resultDetails === 'function' ? options.resultDetails(value) : {};
    return { value, runtimeTrace: span.success(details) };
  } catch (error) {
    const runtimeTrace = span.fail(error);
    attachRuntimeTrace(error, runtimeTrace);
    throw error;
  }
}

function flatten(traces) {
  const output = [];
  const visit = (trace) => {
    output.push(trace);
    for (const child of trace.children || []) visit(child);
  };
  for (const trace of traces) visit(trace);
  return output;
}

function sortTraces(traces) {
  return [...traces].sort((left, right) => {
    const leftOrder = STAGE_ORDER.get(left.stage) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = STAGE_ORDER.get(right.stage) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.startedAt.localeCompare(right.startedAt) || left.stage.localeCompare(right.stage);
  });
}

function aggregateStageSummary(traces) {
  const groups = new Map();
  for (const trace of flatten(traces)) {
    const items = groups.get(trace.stage) || [];
    items.push(trace);
    groups.set(trace.stage, items);
  }
  return sortTraces([...groups.entries()].map(([stage, items]) => {
    const attempts = items.reduce((sum, item) => sum + item.attempts, 0);
    const failed = items.find((item) => item.status === 'failed');
    const blocked = items.find((item) => item.status === 'blocked');
    const skipped = items.find((item) => item.status === 'skipped');
    return {
      stage,
      label: items[0].label,
      durationMs: Number(items.reduce((sum, item) => sum + item.durationMs, 0).toFixed(3)),
      status: failed ? 'failed' : blocked ? 'blocked' : skipped && items.every((item) => item.status === 'skipped') ? 'skipped' : 'success',
      attempts,
      duplicateInvocation: items.length > 1 || attempts > 1,
      provider: [...new Set(items.map((item) => item.provider))].join('+'),
      inputCount: items.every((item) => item.inputCount !== null) ? items.reduce((sum, item) => sum + item.inputCount, 0) : null,
      outputCount: items.every((item) => item.outputCount !== null) ? items.reduce((sum, item) => sum + item.outputCount, 0) : null,
      errorCode: failed?.errorCode || blocked?.errorCode || null,
      errorMessage: failed?.errorMessage || blocked?.errorMessage || null
    };
  }));
}

function blockedTrace(stage, at, error) {
  return {
    stage,
    label: RUNTIME_STAGE_LABELS[stage] || stage,
    startedAt: at,
    endedAt: at,
    durationMs: 0,
    status: 'blocked',
    attempts: 1,
    provider: 'runtime',
    inputCount: null,
    outputCount: null,
    errorCode: error?.code || 'UPSTREAM_STAGE_FAILED',
    errorMessage: `Blocked because an upstream stage failed: ${error?.message || 'Unknown error'}`
  };
}

export class RuntimeTraceCollector {
  constructor(options = {}) {
    this.runId = options.runId || crypto.randomUUID();
    this.thresholds = {
      warningMs: options.warningMs ?? DEFAULT_RUNTIME_THRESHOLDS.warningMs,
      criticalMs: options.criticalMs ?? DEFAULT_RUNTIME_THRESHOLDS.criticalMs
    };
    this.traces = [];
  }

  add(trace) {
    validateRuntimeTrace(trace);
    const duplicate = this.traces.some((item) => (
      item.stage === trace.stage
      && item.startedAt === trace.startedAt
      && item.endedAt === trace.endedAt
      && item.status === trace.status
      && item.durationMs === trace.durationMs
    ));
    if (duplicate) return trace;
    this.traces.push(sanitizeRuntimeTrace(trace));
    return trace;
  }

  addFromError(error) {
    const trace = runtimeTraceFromError(error);
    if (trace) this.add(trace);
    return trace;
  }

  blockAfter(failedStage, error) {
    const index = RUNTIME_STAGE_ORDER.indexOf(failedStage);
    const existing = new Set(flatten(this.traces).map((item) => item.stage));
    const at = new Date().toISOString();
    for (const stage of RUNTIME_STAGE_ORDER.slice(index < 0 ? 0 : index + 1)) {
      if (!existing.has(stage)) this.add(blockedTrace(stage, at, error));
    }
  }

  snapshot(context = {}) {
    const stages = sortTraces(this.traces).map(clone);
    const flattened = flatten(stages);
    const stageSummary = aggregateStageSummary(stages);
    const rootsWithDuration = stages.filter((item) => item.durationMs >= 0);
    const startedAt = rootsWithDuration.length
      ? rootsWithDuration.map((item) => item.startedAt).sort()[0]
      : new Date().toISOString();
    const endedAt = rootsWithDuration.length
      ? rootsWithDuration.map((item) => item.endedAt).sort().at(-1)
      : startedAt;
    const totalDurationMs = Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));
    const completed = stageSummary.filter((item) => item.status === 'success');
    const slowest = completed.sort((left, right) => right.durationMs - left.durationMs)[0] || null;
    const warnings = [];
    for (const item of stageSummary) {
      if (item.duplicateInvocation) {
        warnings.push({ code: 'DUPLICATE_STAGE_INVOCATION', stage: item.stage, severity: 'warning', message: `${item.stage} was executed ${item.attempts} times.` });
      }
      if (item.durationMs >= this.thresholds.criticalMs) {
        warnings.push({ code: 'SLOW_STAGE', stage: item.stage, severity: 'critical', message: `${item.label} exceeded the critical threshold.` });
      } else if (item.durationMs >= this.thresholds.warningMs) {
        warnings.push({ code: 'SLOW_STAGE', stage: item.stage, severity: 'warning', message: `${item.label} exceeded the warning threshold.` });
      }
    }
    return Object.freeze({
      schemaVersion: RUNTIME_TRACE_SCHEMA_VERSION,
      project: context.project ?? null,
      mode: context.mode ?? null,
      runId: this.runId,
      startedAt,
      endedAt,
      totalDurationMs,
      slowestStage: slowest?.stage ?? null,
      slowestStageDurationMs: slowest?.durationMs ?? 0,
      slowestStagePercent: totalDurationMs > 0 && slowest ? Number(((slowest.durationMs / totalDurationMs) * 100).toFixed(1)) : 0,
      stages,
      stageSummary,
      warnings,
      counters: {
        aiCalls: flattened.reduce((sum, item) => sum + (item.metrics?.aiCalls || 0), 0),
        webSearchCalls: flattened.reduce((sum, item) => sum + (item.metrics?.webSearchCalls || 0), 0),
        fileReads: flattened.reduce((sum, item) => sum + (item.metrics?.fileReads || 0), 0),
        retries: flattened.reduce((sum, item) => sum + (item.metrics?.retries || 0), 0)
      },
      environment: {
        appVersion: context.appVersion || '4.0.0',
        nodeVersion: process.version,
        platform: process.platform
      },
      context: clone(context)
    });
  }
}

export function stripRuntimeTraceMetadata(config) {
  const clean = clone(config || {});
  for (const result of Object.values(clean.reasoningProviderResults || {})) {
    if (result && typeof result === 'object') delete result.runtimeTrace;
  }
  return clean;
}

export function attachResultRuntimeTrace(result, runtimeTrace) {
  Object.defineProperty(result, 'runtimeTrace', {
    value: runtimeTrace,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return result;
}
