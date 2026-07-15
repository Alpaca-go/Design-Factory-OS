import crypto from 'node:crypto';
import {
  assertCreativeDecisionState,
  canonicalStringify,
  finalizeCreativeDecisionState
} from './creative-decision-state.js';
import {
  attachRuntimeTrace,
  failRuntimeTrace,
  measureRuntimeStage,
  startRuntimeStage,
  stripRuntimeTraceMetadata,
  validateRuntimeTrace
} from './runtime-trace.js';

export const CREATIVE_DECISION_IR_BUILDER_ID = 'creative-decision-ir-builder-v4';

export class CreativeDecisionIrBuilderError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'CreativeDecisionIrBuilderError';
    this.code = code;
  }
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CreativeDecisionIrBuilderError('RESULT_INVALID', `${path} 必须是非空字符串`);
  }
}

function decisionRun(result) {
  requireString(result.runId, 'creativeDecision.runId');
  requireString(result.provider, 'creativeDecision.provider');
  requireString(result.model, 'creativeDecision.model');
  requireString(result.completedAt, 'creativeDecision.completedAt');
  return {
    runId: result.runId,
    provider: result.provider,
    model: result.model,
    completedAt: result.completedAt
  };
}

function reasoningRun(result) {
  return {
    runId: result.runId,
    provider: result.provider,
    model: result.model,
    completedAt: result.completedAt
  };
}

function mergeEvidence(...collections) {
  const byId = new Map();
  for (const collection of collections) {
    for (const item of collection || []) {
      requireString(item?.evidenceId, 'evidenceIndex[].evidenceId');
      const existing = byId.get(item.evidenceId);
      if (existing && canonicalStringify(existing) !== canonicalStringify(item)) {
        throw new CreativeDecisionIrBuilderError('EVIDENCE_CONFLICT', `Evidence ${item.evidenceId} 存在冲突定义`);
      }
      byId.set(item.evidenceId, structuredClone(item));
    }
  }
  return [...byId.values()].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

function mergeSourceTimestamps(...collections) {
  const bySource = new Map();
  for (const collection of collections) {
    for (const item of collection || []) {
      requireString(item?.sourceId, 'sourceTimestamps[].sourceId');
      requireString(item?.observedAt, 'sourceTimestamps[].observedAt');
      const key = `${item.sourceId}\u0000${item.observedAt}`;
      bySource.set(key, structuredClone(item));
    }
  }
  return [...bySource.values()].sort((left, right) => (
    left.sourceId.localeCompare(right.sourceId) || left.observedAt.localeCompare(right.observedAt)
  ));
}

function assetManifest(inventory) {
  return inventory.items.map((item) => ({
    path: item.path,
    bytes: item.bytes,
    extension: item.extension,
    isImage: item.isImage,
    detail: item.detail
  }));
}

async function resolveDecision(context, options) {
  if (typeof options.reasoner === 'function') return options.reasoner(context);
  return context.config?.reasoningProviderResults?.creativeDecision;
}

/**
 * Build the only approved Creative Decision State. All business decisions are
 * supplied by the single Creative Decision reasoning result; this builder only
 * attaches provenance, lifecycle metadata and deterministic State contracts.
 */
export async function buildCreativeDecisionIR(context, options = {}) {
  const {
    inventory, projectBrief, config, brandUnderstanding, industryBenchmark,
    currentState = null
  } = context || {};
  if (!inventory || !projectBrief || !config || !brandUnderstanding || !industryBenchmark) {
    throw new CreativeDecisionIrBuilderError(
      'INPUT_INVALID',
      'Creative Decision IR Builder 缺少 Inventory、Project Brief、项目配置或上游 Provider Result'
    );
  }
  const decision = structuredClone(await resolveDecision(context, options));
  if (!decision) {
    throw new CreativeDecisionIrBuilderError(
      'REASONING_RESULT_MISSING',
      '缺少 Creative Decision 结果；请配置 reasoning adapter 或 reasoningProviderResults.creativeDecision'
    );
  }
  const creativeDecisionRun = decisionRun(decision);
  requireString(config.projectId, 'projectId');
  requireString(config.projectVersion, 'projectVersion');
  for (const group of ['brand', 'strategy', 'constraints', 'decisionRecord', 'governance']) {
    if (!decision[group] || typeof decision[group] !== 'object') {
      throw new CreativeDecisionIrBuilderError('RESULT_INVALID', `creativeDecision.${group} 必须是对象`);
    }
  }

  const evidenceIndex = mergeEvidence(
    brandUnderstanding.evidenceIndex,
    industryBenchmark.evidenceIndex,
    decision.evidenceIndex
  );
  const sourceTimestamps = mergeSourceTimestamps(
    brandUnderstanding.sourceTimestamps,
    industryBenchmark.sourceTimestamps,
    decision.sourceTimestamps
  );
  const approvedAt = decision.meta?.approvedAt
    || decision.governance?.approvals?.creativeDecision?.approvedAt;
  requireString(approvedAt, 'creativeDecision.meta.approvedAt');

  const input = {
    meta: {
      decisionId: decision.meta?.decisionId,
      projectId: config.projectId,
      projectVersion: config.projectVersion,
      status: 'approved',
      createdAt: decision.meta?.createdAt || creativeDecisionRun.completedAt,
      approvedAt,
      ...(currentState && currentState.meta.decisionId !== decision.meta?.decisionId
        ? { supersedesDecisionId: currentState.meta.decisionId }
        : decision.meta?.supersedesDecisionId
          ? { supersedesDecisionId: decision.meta.supersedesDecisionId }
          : {})
    },
    provenance: {
      inputDigests: {
        assetManifest: digest(assetManifest(inventory)),
        projectContract: projectBrief.sha256,
        projectConfig: digest(config),
        brandUnderstanding: brandUnderstanding.resultDigest,
        industryBenchmark: industryBenchmark.resultDigest
      },
      reasoningRuns: {
        brandUnderstanding: reasoningRun(brandUnderstanding),
        industryBenchmark: reasoningRun(industryBenchmark),
        creativeDecision: creativeDecisionRun
      },
      reasoningContractDigest: digest({
        principle: 'Think Once. Compile Many.',
        reasoningStages: ['brandUnderstanding', 'industryBenchmark', 'creativeDecision'],
        stateContract: '4.0.0'
      }),
      sourceTimestamps,
      evidenceIndex,
      dataPolicyRef: decision.dataPolicyRef || 'policy.project-private'
    },
    brand: decision.brand,
    strategy: decision.strategy,
    constraints: decision.constraints,
    creativeBrief: decision.creativeBrief || {},
    decisionRecord: decision.decisionRecord,
    governance: decision.governance,
    extensions: decision.extensions || {}
  };

  try {
    const state = finalizeCreativeDecisionState(input);
    assertCreativeDecisionState(state, { requireApproved: true });
    return state;
  } catch (error) {
    throw new CreativeDecisionIrBuilderError(
      'STATE_INVALID',
      'Creative Decision 结果无法建立合法 Active State',
      { cause: error }
    );
  }
}

/**
 * Execute the Creative Decision Provider with Provider-owned Runtime Trace.
 * Telemetry is stripped before State construction so timing never changes the
 * Creative Decision State or any Compiler input.
 */
export async function buildCreativeDecisionIRWithTrace(context, options = {}) {
  const cleanContext = {
    ...context,
    config: stripRuntimeTraceMetadata(context?.config)
  };

  if (typeof options.reasoner === 'function') {
    const measured = await measureRuntimeStage('creativeDecision', {
      label: 'Creative Decision',
      provider: options.provider || 'ai',
      inputCount: 2,
      resultDetails: () => ({ outputCount: 1, metrics: { aiCalls: 1, retries: 0 } })
    }, async () => {
      const decision = structuredClone(await options.reasoner(context));
      if (!decision) {
        throw new CreativeDecisionIrBuilderError('REASONING_RESULT_MISSING', 'Creative Decision Provider 未返回结果');
      }
      delete decision.runtimeTrace;
      return buildCreativeDecisionIR(cleanContext, { reasoner: async () => decision });
    });
    return { state: measured.value, runtimeTrace: measured.runtimeTrace };
  }

  const supplied = context?.config?.reasoningProviderResults?.creativeDecision;
  if (!supplied) {
    const error = new CreativeDecisionIrBuilderError(
      'REASONING_RESULT_MISSING',
      '缺少 Creative Decision 结果；请配置 reasoning adapter 或 reasoningProviderResults.creativeDecision'
    );
    const span = startRuntimeStage('creativeDecision', { label: 'Creative Decision', provider: 'provider-contract' });
    throw attachRuntimeTrace(error, span.fail(error));
  }
  try {
    validateRuntimeTrace(supplied.runtimeTrace, {
      stage: 'creativeDecision',
      path: 'creativeDecision.runtimeTrace'
    });
  } catch (error) {
    const span = startRuntimeStage('creativeDecision', { label: 'Creative Decision', provider: 'provider-contract' });
    throw attachRuntimeTrace(error, span.fail(error));
  }
  try {
    const state = await buildCreativeDecisionIR(cleanContext);
    return { state, runtimeTrace: structuredClone(supplied.runtimeTrace) };
  } catch (error) {
    throw attachRuntimeTrace(error, failRuntimeTrace(supplied.runtimeTrace, error));
  }
}
