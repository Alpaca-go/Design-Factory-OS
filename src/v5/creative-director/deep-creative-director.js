import { ReasoningSessionGuard } from './session-guard.js';
import { buildDeepCreativeDirectorPrompt } from './prompt-builder.js';
import { performance } from 'node:perf_hooks';

export const DEEP_CREATIVE_DIRECTOR_PROVIDER_ID = 'deep-creative-director-provider-v5';

export class DeepCreativeDirectorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DeepCreativeDirectorError';
    this.code = code;
  }
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DeepCreativeDirectorError('RESULT_INVALID', `${field} 必须是非空字符串`);
  }
  return value.trim();
}

function validateResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DeepCreativeDirectorError('RESULT_INVALID', 'Deep Creative Director 必须返回结果对象');
  }
  return {
    runId: requiredString(value.runId, 'deepCreativeDirector.runId'),
    provider: requiredString(value.provider, 'deepCreativeDirector.provider'),
    model: requiredString(value.model, 'deepCreativeDirector.model'),
    completedAt: requiredString(value.completedAt, 'deepCreativeDirector.completedAt'),
    reportMarkdown: requiredString(value.reportMarkdown, 'deepCreativeDirector.reportMarkdown'),
    benchmarkSources: Array.isArray(value.benchmarkSources) ? structuredClone(value.benchmarkSources) : [],
    inspectedAssetIds: Array.isArray(value.inspectedAssetIds) ? [...value.inspectedAssetIds] : []
  };
}

/** Execute the only full creative reasoning session permitted for a v5 project run. */
export async function runDeepCreativeDirector(context, options = {}) {
  if (!context?.inventory || !context?.config) {
    throw new DeepCreativeDirectorError('INPUT_INVALID', 'Deep Creative Director 缺少 Asset Inventory 或 v5 配置');
  }
  const guard = options.sessionGuard || new ReasoningSessionGuard();
  const prompt = options.prompt || await buildDeepCreativeDirectorPrompt(context);
  let supplied;
  let executionSource;
  const modelStarted = performance.now();
  if (options.cachedResult) {
    executionSource = 'reasoning-cache';
    supplied = options.cachedResult;
  } else if (typeof options.reasoner === 'function') {
    executionSource = 'reasoner';
    const abortController = new AbortController();
    const maximumDurationMs = Number(options.maximumDurationMs || context.config.performance.maximumMinutes * 60_000);
    const timeout = setTimeout(() => abortController.abort(), maximumDurationMs);
    try {
      supplied = await Promise.race([
        options.reasoner(Object.freeze({
          ...context,
          prompt,
          signal: abortController.signal,
          maximumDurationMs,
          deadlineAt: new Date(Date.now() + maximumDurationMs).toISOString()
        })),
        new Promise((_, reject) => abortController.signal.addEventListener('abort', () => reject(
          new DeepCreativeDirectorError('TIME_BUDGET_EXCEEDED', `Deep Creative Director 超过 ${context.config.performance.maximumMinutes} 分钟上限`)
        ), { once: true }))
      ]);
    } finally {
      clearTimeout(timeout);
    }
  } else {
    executionSource = 'configured-result';
    supplied = context.config.deepCreativeDirectorResult;
  }
  const actualModelTimeMs = executionSource === 'reasoner' ? performance.now() - modelStarted : 0;
  if (!supplied) {
    throw new DeepCreativeDirectorError(
      'REASONING_RESULT_MISSING',
      '缺少 Deep Creative Director 结果；请配置单一 reasoning adapter 或 deepCreativeDirectorResult'
    );
  }
  const result = validateResult(structuredClone(supplied));
  const session = executionSource === 'reasoning-cache' ? guard.reuse(result.runId) : guard.begin(result.runId);
  return Object.freeze({ ...result, executionSource, session, prompt, actualModelTimeMs });
}
