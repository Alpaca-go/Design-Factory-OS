import crypto from 'node:crypto';
import { canonicalStringify } from './creative-decision-state.js';
import {
  attachRuntimeTrace,
  attachResultRuntimeTrace,
  failRuntimeTrace,
  measureRuntimeStage,
  startRuntimeStage,
  validateRuntimeTrace
} from './runtime-trace.js';

export const INDUSTRY_BENCHMARK_PROVIDER_ID = 'industry-benchmark-provider-v4';

export class IndustryBenchmarkProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IndustryBenchmarkProviderError';
    this.code = code;
  }
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new IndustryBenchmarkProviderError('RESULT_INVALID', `${path} 必须是非空字符串`);
  }
}

function requireStringArray(value, path, options = {}) {
  if (!Array.isArray(value) || (options.nonEmpty && value.length === 0)) {
    throw new IndustryBenchmarkProviderError('RESULT_INVALID', `${path} 必须是${options.nonEmpty ? '非空' : ''}数组`);
  }
  value.forEach((item, index) => requireString(item, `${path}[${index}]`));
}

function validateResult(result, brandUnderstanding) {
  requireString(result.runId, 'industryBenchmark.runId');
  requireString(result.provider, 'industryBenchmark.provider');
  requireString(result.model, 'industryBenchmark.model');
  requireString(result.completedAt, 'industryBenchmark.completedAt');
  requireString(result.industry, 'industryBenchmark.industry');
  if (result.industry !== brandUnderstanding.industry) {
    throw new IndustryBenchmarkProviderError(
      'INDUSTRY_MISMATCH',
      `Benchmark 行业 ${result.industry} 与 Brand Understanding 行业 ${brandUnderstanding.industry} 不一致`
    );
  }
  if (!Array.isArray(result.cases) || result.cases.length < 3) {
    throw new IndustryBenchmarkProviderError('INSUFFICIENT_CASES', 'Industry Benchmark 至少需要三个真实同品类案例');
  }
  result.cases.forEach((item, index) => {
    requireString(item.name, `industryBenchmark.cases[${index}].name`);
    requireString(item.url, `industryBenchmark.cases[${index}].url`);
    requireString(item.relevance, `industryBenchmark.cases[${index}].relevance`);
    if (!/^https?:\/\//i.test(item.url)) {
      throw new IndustryBenchmarkProviderError('SOURCE_INVALID', `industryBenchmark.cases[${index}].url 必须是公开 HTTP(S) 来源`);
    }
  });
  requireStringArray(result.observations, 'industryBenchmark.observations', { nonEmpty: true });
  requireStringArray(result.opportunities, 'industryBenchmark.opportunities', { nonEmpty: true });
  if (!Array.isArray(result.evidenceIndex) || result.evidenceIndex.length < 3) {
    throw new IndustryBenchmarkProviderError('RESULT_INVALID', 'Industry Benchmark 必须为至少三个案例提供 Evidence');
  }
  if (!Array.isArray(result.sourceTimestamps) || result.sourceTimestamps.length < 3) {
    throw new IndustryBenchmarkProviderError('RESULT_INVALID', 'Industry Benchmark 必须记录至少三个来源时间');
  }
}

async function resolveResult(context, options) {
  if (typeof options.reasoner === 'function') return options.reasoner(context);
  return context.config?.reasoningProviderResults?.industryBenchmark;
}

function finalizeResult(supplied, brandUnderstanding, runtimeTrace) {
  const result = clone(supplied);
  delete result.runtimeTrace;
  validateResult(result, brandUnderstanding);
  result.resultDigest = crypto.createHash('sha256')
    .update(canonicalStringify({ ...result, resultDigest: undefined }))
    .digest('hex');
  attachResultRuntimeTrace(result, runtimeTrace);
  return deepFreeze(result);
}

/** Execute exactly one same-industry benchmark reasoning run. */
export async function runIndustryBenchmarkProvider(context, options = {}) {
  if (!context?.brandUnderstanding || !context?.projectBrief || !context?.config) {
    throw new IndustryBenchmarkProviderError('INPUT_INVALID', 'Industry Benchmark 缺少 Brand Understanding、Project Brief 或项目配置');
  }
  if (typeof options.reasoner === 'function') {
    const measured = await measureRuntimeStage('industryBenchmark', {
      label: 'Industry Benchmark',
      provider: options.provider || 'web+ai',
      inputCount: 1,
      resultDetails: (result) => ({
        outputCount: result.cases?.length ?? 0,
        attempts: result.attempts || 1,
        metrics: {
          aiCalls: result.aiCalls ?? 1,
          webSearchCalls: result.publicNetworkRequests ?? result.webSearchCalls ?? 0,
          retries: result.retries || 0
        }
      })
    }, async () => {
      const supplied = await resolveResult(context, options);
      if (!supplied) {
        throw new IndustryBenchmarkProviderError('REASONING_RESULT_MISSING', 'Industry Benchmark Reasoning Provider 未返回结果');
      }
      return clone(supplied);
    });
    try {
      return finalizeResult(measured.value, context.brandUnderstanding, measured.runtimeTrace);
    } catch (error) {
      throw attachRuntimeTrace(error, failRuntimeTrace(measured.runtimeTrace, error));
    }
  }

  const supplied = await resolveResult(context, options);
  if (!supplied) {
    const error = new IndustryBenchmarkProviderError(
      'REASONING_RESULT_MISSING',
      '缺少 Industry Benchmark Provider 结果；请配置 reasoning adapter 或 reasoningProviderResults.industryBenchmark'
    );
    const span = startRuntimeStage('industryBenchmark', { label: 'Industry Benchmark', provider: 'provider-contract' });
    throw attachRuntimeTrace(error, span.fail(error));
  }
  try {
    validateRuntimeTrace(supplied.runtimeTrace, {
      stage: 'industryBenchmark',
      path: 'industryBenchmark.runtimeTrace'
    });
  } catch (error) {
    const span = startRuntimeStage('industryBenchmark', { label: 'Industry Benchmark', provider: 'provider-contract' });
    throw attachRuntimeTrace(error, span.fail(error));
  }
  try {
    return finalizeResult(supplied, context.brandUnderstanding, supplied.runtimeTrace);
  } catch (error) {
    throw attachRuntimeTrace(error, failRuntimeTrace(supplied.runtimeTrace, error));
  }
}
