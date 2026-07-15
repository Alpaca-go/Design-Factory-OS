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

export const BRAND_UNDERSTANDING_PROVIDER_ID = 'brand-understanding-provider-v4';

export class BrandUnderstandingProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BrandUnderstandingProviderError';
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
    throw new BrandUnderstandingProviderError('RESULT_INVALID', `${path} 必须是非空字符串`);
  }
}

function requireStringArray(value, path, options = {}) {
  if (!Array.isArray(value) || (options.nonEmpty && value.length === 0)) {
    throw new BrandUnderstandingProviderError('RESULT_INVALID', `${path} 必须是${options.nonEmpty ? '非空' : ''}数组`);
  }
  value.forEach((item, index) => requireString(item, `${path}[${index}]`));
}

function validateRun(result) {
  requireString(result.runId, 'brandUnderstanding.runId');
  requireString(result.provider, 'brandUnderstanding.provider');
  requireString(result.model, 'brandUnderstanding.model');
  requireString(result.completedAt, 'brandUnderstanding.completedAt');
}

function validateResult(result, inventory) {
  validateRun(result);
  requireString(result.brandName, 'brandUnderstanding.brandName');
  requireString(result.industry, 'brandUnderstanding.industry');
  requireString(result.category, 'brandUnderstanding.category');
  requireString(result.projectType, 'brandUnderstanding.projectType');
  requireString(result.originalIntent?.statement, 'brandUnderstanding.originalIntent.statement');
  requireStringArray(result.logos, 'brandUnderstanding.logos', { nonEmpty: true });
  requireStringArray(result.colors, 'brandUnderstanding.colors', { nonEmpty: true });
  requireStringArray(result.typography, 'brandUnderstanding.typography', { nonEmpty: true });
  requireStringArray(result.packaging, 'brandUnderstanding.packaging');
  requireString(result.personality?.statement, 'brandUnderstanding.personality.statement');
  requireStringArray(result.personality?.desired, 'brandUnderstanding.personality.desired', { nonEmpty: true });
  requireStringArray(result.personality?.avoid, 'brandUnderstanding.personality.avoid', { nonEmpty: true });
  requireString(result.currentVisualAssessment?.summary, 'brandUnderstanding.currentVisualAssessment.summary');
  if (!Array.isArray(result.evidenceIndex) || result.evidenceIndex.length === 0) {
    throw new BrandUnderstandingProviderError('RESULT_INVALID', 'brandUnderstanding.evidenceIndex 必须包含可追溯证据');
  }
  if (result.visualInspection?.verified !== true) {
    throw new BrandUnderstandingProviderError('VISUAL_INSPECTION_REQUIRED', 'Brand Understanding 必须完成全部图片视觉核验');
  }
  requireStringArray(result.visualInspection.inspectedImages, 'brandUnderstanding.visualInspection.inspectedImages');
  const expected = inventory.items.filter((item) => item.isImage).map((item) => item.path);
  const inspected = new Set(result.visualInspection.inspectedImages);
  const missing = expected.filter((item) => !inspected.has(item));
  if (missing.length) {
    throw new BrandUnderstandingProviderError(
      'VISUAL_INSPECTION_INCOMPLETE',
      `Brand Understanding 未覆盖全部图片：${missing.join('、')}`
    );
  }
}

async function resolveResult(context, options) {
  if (typeof options.reasoner === 'function') return options.reasoner(context);
  return context.config?.reasoningProviderResults?.brandUnderstanding;
}

function finalizeResult(supplied, inventory, runtimeTrace) {
  const result = clone(supplied);
  delete result.runtimeTrace;
  validateResult(result, inventory);
  result.resultDigest = crypto.createHash('sha256')
    .update(canonicalStringify({ ...result, resultDigest: undefined }))
    .digest('hex');
  attachResultRuntimeTrace(result, runtimeTrace);
  return deepFreeze(result);
}

/**
 * Execute exactly one Brand Understanding reasoning run. The provider owns no
 * downstream Brief or Compiler behavior; it only returns the approved Result
 * contract supplied by the configured reasoning adapter.
 */
export async function runBrandUnderstandingProvider(context, options = {}) {
  if (!context?.inventory || !context?.projectBrief || !context?.config) {
    throw new BrandUnderstandingProviderError('INPUT_INVALID', 'Brand Understanding 缺少 inventory、Project Brief 或项目配置');
  }
  if (typeof options.reasoner === 'function') {
    const measured = await measureRuntimeStage('brandUnderstanding', {
      label: 'Brand Understanding',
      provider: options.provider || 'ai',
      inputCount: context.inventory.imageCount,
      resultDetails: (result) => ({
        outputCount: 1,
        metrics: {
          aiCalls: 1,
          fileReads: context.inventory.imageCount,
          retries: result.retries || 0
        }
      })
    }, async () => {
      const supplied = await resolveResult(context, options);
      if (!supplied) {
        throw new BrandUnderstandingProviderError('REASONING_RESULT_MISSING', 'Brand Understanding Reasoning Provider 未返回结果');
      }
      return clone(supplied);
    });
    try {
      return finalizeResult(measured.value, context.inventory, measured.runtimeTrace);
    } catch (error) {
      throw attachRuntimeTrace(error, failRuntimeTrace(measured.runtimeTrace, error));
    }
  }

  const supplied = await resolveResult(context, options);
  if (!supplied) {
    const error = new BrandUnderstandingProviderError(
      'REASONING_RESULT_MISSING',
      '缺少 Brand Understanding Provider 结果；请配置 reasoning adapter 或 reasoningProviderResults.brandUnderstanding'
    );
    const span = startRuntimeStage('brandUnderstanding', { label: 'Brand Understanding', provider: 'provider-contract' });
    throw attachRuntimeTrace(error, span.fail(error));
  }
  try {
    validateRuntimeTrace(supplied.runtimeTrace, {
      stage: 'brandUnderstanding',
      path: 'brandUnderstanding.runtimeTrace'
    });
  } catch (error) {
    const span = startRuntimeStage('brandUnderstanding', { label: 'Brand Understanding', provider: 'provider-contract' });
    throw attachRuntimeTrace(error, span.fail(error));
  }
  try {
    return finalizeResult(supplied, context.inventory, supplied.runtimeTrace);
  } catch (error) {
    throw attachRuntimeTrace(error, failRuntimeTrace(supplied.runtimeTrace, error));
  }
}
