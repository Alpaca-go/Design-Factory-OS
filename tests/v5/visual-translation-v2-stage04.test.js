// Stage 04 v2 output-truncation fix — unit + integration tests
// (doc: v2 Stage 04 输出截断修复, §9). Fully offline and deterministic.
//
// The integration tests drive the real `runVisualTranslationV2` runner but
// bypass the heavy 01/02 model calls by pre-seeding valid checkpoints, then
// exercise ONLY stage 04 with a mock reasoner that can simulate truncation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getStageProfile, STAGE_PROFILES } from '../../src/v5/visual-translation/v1/protocol/stage-registry.js';
import { resolveMaxOutputTokens, planTruncationRetry, getModelCapabilities } from '../../src/v5/adapters/model-capabilities.js';
import { estimateStage04V2OutputBudget, outputUtilization } from '../../src/v5/visual-translation/v2/runtime/output-budget.js';
import { prepareDocumentSet } from '../../src/v5/shared/analysis/document-preparation.js';
import { valueHash } from '../../src/v5/shared/analysis/checkpoint-store.js';
import { validateVisualEvidenceMap } from '../../src/v5/visual-translation/v1/schemas/visual-evidence-map-v1.js';
import { validateVisualStrategySignalMap } from '../../src/v5/visual-translation/v1/schemas/visual-strategy-signal-map-v1.js';
import { validateVisualOpportunityMap } from '../../src/v5/visual-translation/v1/schemas/visual-opportunity-map-v1.js';
import { buildVisualTranslationCheckpoint } from '../../src/v5/visual-translation/v1/runtime/visual-translation-checkpoint-store.js';
import { VISUAL_EVIDENCE_PROMPT_VERSION } from '../../src/v5/visual-translation/v1/prompts/visual-evidence-prompt-v1.js';
import { VISUAL_SIGNAL_OPPORTUNITY_PROMPT_VERSION } from '../../src/v5/visual-translation/v1/prompts/visual-signal-opportunity-prompt-v1.js';
import { runVisualTranslationV2 } from '../../src/v5/visual-translation/v2/runtime/run-visual-translation-v2.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const V2_FIX = join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions.json');

// ---- P0 §3.1/§3.2: Stage profiles ----
test('v2 Stage 04 profile exists with 20000/2500/420000 and v1 profile is unchanged', () => {
  const v2 = getStageProfile('04-execution-oriented-directions-v2');
  assert.equal(v2.thinking, true);
  assert.equal(v2.thinkingBudget, 2500);
  assert.equal(v2.maxOutputTokens, 20000);
  assert.equal(v2.requestTimeoutMs, 420000);
  assert.equal(v2.truncationRetry.enabled, true);

  const v1 = getStageProfile('04-three-creative-directions');
  assert.equal(v1.thinking, true);
  assert.equal(v1.thinkingBudget, 5000);
  assert.equal(v1.maxOutputTokens, 8000);
  assert.equal(v1.requestTimeoutMs, 300000);
  // v1 object identity preserved (frozen, not mutated).
  assert.equal(STAGE_PROFILES['04-three-creative-directions'], v1);
});

// ---- §3.4: output-limit validation ----
test('resolveMaxOutputTokens rejects requests above the provider cap but allows unknown models', () => {
  const cap = { maxOutputTokens: 32768 };
  assert.equal(resolveMaxOutputTokens({ requestedMaxOutputTokens: 20000, modelCapabilities: cap }), 20000);
  assert.throws(
    () => resolveMaxOutputTokens({ requestedMaxOutputTokens: 40000, modelCapabilities: cap, context: { stageId: '04-execution-oriented-directions-v2', modelId: 'qwen3.6-plus' } }),
    (e) => e.code === 'MODEL_OUTPUT_LIMIT_EXCEEDED'
  );
  // Unknown / unconfirmed model → no cap, returns requested as-is.
  assert.equal(resolveMaxOutputTokens({ requestedMaxOutputTokens: 20000, modelCapabilities: null }), 20000);
});

// ---- §4: escalation decision ----
test('planTruncationRetry escalates ×1.5 and reports when no retry is possible', () => {
  const ok = planTruncationRetry({ requestedMaxOutputTokens: 20000, providerMaxOutputTokens: 32768, multiplier: 1.5 });
  assert.equal(ok.escalated, 30000);
  assert.equal(ok.canRetry, true);
  // Provider cap too small to escalate.
  const stuck = planTruncationRetry({ requestedMaxOutputTokens: 20000, providerMaxOutputTokens: 20000 });
  assert.equal(stuck.canRetry, false);
});

// ---- §7: budget estimate ----
test('estimateStage04V2OutputBudget matches the documented formula and utilization is computed', () => {
  const budget = estimateStage04V2OutputBudget({ directionCount: 3, reusableAssetsPerDirection: 4, compositionTemplatesPerDirection: 2, executionExamplesPerDirection: 3 });
  // (800 + 3*(1500 + 4*150 + 2*220 + 3*220)) * 1.35 = (800 + 3*3200)*1.35 = 10400*1.35 = 14040 → ceil 14041
  assert.equal(budget, Math.ceil((800 + 3 * (1500 + 4 * 150 + 2 * 220 + 3 * 220)) * 1.35));
  assert.equal(estimateStage04V2OutputBudget(), Math.ceil((800 + 3 * (1500 + 4 * 150 + 2 * 220 + 3 * 220)) * 1.35));
  assert.ok(estimateStage04V2OutputBudget({ directionCount: 3, reusableAssetsPerDirection: 5 }) > budget);
  assert.equal(outputUtilization({ completionTokens: 17000, requestedMaxOutputTokens: 20000 }), 0.85);
  assert.equal(outputUtilization({ completionTokens: 1000, requestedMaxOutputTokens: 20000 }) < 0.85, true);
});

// ---- Integration harness: build a valid 00/01/02 context, bypass 01/02 via checkpoints ----
function buildPipelineContext() {
  const corpus = {
    documents: [{
      id: 'DOC1',
      filename: '九州美学品牌策略.md',
      title: '九州美学品牌策略',
      rawText: '九州美学专注冷链物流，提供温控仓储与配送服务，具备 GSP 资质。'
    }]
  };
  const prepared = prepareDocumentSet({ corpus });
  const chunk = prepared.chunks[0];
  const quote = '冷链物流';

  const audienceBoundary = {
    businessModel: 'b2b',
    businessModelEvidenceIds: ['VE001'],
    primaryAudience: [{ label: '采购决策者', evidenceIds: ['VE001'] }],
    excludedAudience: [{ label: '普通消费者', reason: 'B2B 不面向消费者', evidenceIds: ['VE001'] }],
    consumerVisualPolicy: 'auxiliary_only',
    consumerVisualPolicyEvidenceIds: ['VE001']
  };

  const rawEvidence = {
    visualEvidenceMap: {
      evidence: [
        { sourceId: chunk.sourceId, chunkId: chunk.chunkId, type: 'visual-asset', statement: chunk.text, status: 'confirmed', shortestQuote: quote, visualImpact: '展示冷链资质能力' },
        { sourceId: chunk.sourceId, chunkId: chunk.chunkId, type: 'capability', statement: chunk.text, status: 'confirmed', shortestQuote: quote, visualImpact: '突出温控仓储' },
        { sourceId: chunk.sourceId, chunkId: chunk.chunkId, type: 'capability', statement: chunk.text, status: 'confirmed', shortestQuote: quote, visualImpact: '体现配送服务' },
        { sourceId: chunk.sourceId, chunkId: chunk.chunkId, type: 'capability', statement: chunk.text, status: 'confirmed', shortestQuote: quote, visualImpact: '说明行业标准' },
        { sourceId: chunk.sourceId, chunkId: chunk.chunkId, type: 'capability', statement: chunk.text, status: 'confirmed', shortestQuote: quote, visualImpact: '强调专业可信' }
      ],
      identity: { projectName: '九州美学', brandName: '九州美学', status: 'confirmed', evidenceIds: ['VE001', 'VE002', 'VE003', 'VE004', 'VE005'] },
      audienceBoundary,
      suggestedAssets: [{
        assetType: 'certification_badge', name: 'GSP 资质徽标', evidenceIds: ['VE001'],
        providedInSource: true, authorizedForGeneration: true, authorizationEvidenceIds: ['VE001'],
        status: 'existing', execution_scope: 'current_direction', reason: '资质可复用'
      }],
      conflicts: [], missingInformation: [], lockedAssets: []
    }
  };
  const evidenceMap = validateVisualEvidenceMap(rawEvidence, prepared);

  const rawSignal = {
    visualStrategySignalMap: {
      audienceBoundary,
      signals: [
        { type: 'audience-boundary', statement: '面向 B2B 采购决策者', evidenceIds: ['VE001'], reason_basis: 'direct_evidence', evidence_confidence: 1, importance: 'primary', visualPotential: 'high' },
        { type: 'capability', statement: '冷链温控能力可视化', evidenceIds: ['VE002'], reason_basis: 'direct_evidence', evidence_confidence: 1, importance: 'primary', visualPotential: 'high' },
        { type: 'relationship', statement: '与客户建立信任', evidenceIds: ['VE003'], reason_basis: 'direct_evidence', evidence_confidence: 1, importance: 'secondary', visualPotential: 'medium' },
        { type: 'emotion', statement: '专业可信感', evidenceIds: ['VE004'], reason_basis: 'inference', evidence_confidence: 0.65, importance: 'supporting', visualPotential: 'medium' },
        { type: 'culture', statement: '行业积淀', evidenceIds: ['VE005'], reason_basis: 'inference', evidence_confidence: 0.65, importance: 'supporting', visualPotential: 'low' }
      ]
    }
  };
  const signalMap = validateVisualStrategySignalMap(rawSignal, evidenceMap);

  const rawOpportunity = {
    visualOpportunityMap: {
      audienceBoundary,
      visualizableFacts: [{ statement: '温控仓储可视图', rationale: '展示核心能力', evidenceIds: ['VE002'], reason_basis: 'direct_evidence', evidence_confidence: 1, brandability: 'high' }],
      metaphors: [{ statement: '物流网络如脉络', rationale: '连接感', evidenceIds: ['VE003'], reason_basis: 'inference', evidence_confidence: 0.65, brandability: 'medium' }],
      aestheticTensions: [{ statement: '冷峻与温度', rationale: '专业而亲切', evidenceIds: ['VE004'], reason_basis: 'inference', evidence_confidence: 0.65, brandability: 'medium' }],
      categoryCliches: [{ pattern: '宏大建筑', risk: '偏离品牌', allowedWhen: '无', prohibitedWhen: '作为主体' }]
    }
  };
  const opportunityMap = validateVisualOpportunityMap(rawOpportunity, evidenceMap);

  const projectId = 'test-project';
  const analysisRunId = 'test-run-01';
  const provider = 'test';
  const modelId = 'qwen3.6-plus';
  const evidenceCheckpoint = buildVisualTranslationCheckpoint({
    projectId, analysisRunId, stageId: '01-visual-evidence',
    documentSetHash: prepared.documentSetHash, upstreamHash: prepared.documentSetHash,
    promptVersion: VISUAL_EVIDENCE_PROMPT_VERSION, schemaVersion: 'visual-evidence-map-v1.4',
    profile: { ...getStageProfile('01-visual-evidence'), provider, modelId },
    outputFile: 'visual-evidence-map-v1.json', output: evidenceMap
  });
  const signalCheckpoint = buildVisualTranslationCheckpoint({
    projectId, analysisRunId, stageId: '02-visual-signal-opportunity',
    documentSetHash: prepared.documentSetHash, upstreamHash: valueHash(evidenceMap),
    promptVersion: VISUAL_SIGNAL_OPPORTUNITY_PROMPT_VERSION, schemaVersion: 'visual-signal-opportunity-v1.2',
    profile: { ...getStageProfile('02-visual-signal-opportunity'), provider, modelId },
    outputFile: 'visual-signal-opportunity-v1.json', output: { signalMap, opportunityMap }
  });
  const checkpoints = {
    '01-visual-evidence': { checkpoint: evidenceCheckpoint, output: evidenceMap },
    '02-visual-signal-opportunity': { checkpoint: signalCheckpoint, output: { signalMap, opportunityMap } }
  };
  return { corpus, prepared, evidenceMap, signalMap, opportunityMap, checkpoints, projectId, analysisRunId, provider, modelId };
}

function validV2DirectionsPayload() {
  const dirs = JSON.parse(readFileSync(V2_FIX, 'utf8'));
  // Neutralise external references so they validate against the crafted evidence map.
  const cleaned = dirs.map((raw) => {
    const copy = structuredClone(raw);
    delete copy.evidence_ids;
    delete copy.asset_references;
    return copy;
  });
  return JSON.stringify({ visualDirectionV2Set: { directions: cleaned } });
}

function makeMockReasoner({ failureMode = 'none' } = {}) {
  let stage04Calls = 0;
  const truncatedNow = () => failureMode === 'always' || (failureMode === 'first' && stage04Calls === 1);
  return {
    calls: () => stage04Calls,
    reasoner: async (messages, context) => {
      const isV2Dir = messages[0]?.content?.includes('04-execution-oriented-directions-v2');
      if (!isV2Dir) throw new Error(`unexpected model call: ${String(messages[0]?.content || '').slice(0, 50)}`);
      stage04Calls += 1;
      if (truncatedNow()) {
        // The real reasoner maps a `length` finish_reason to OUTPUT_TRUNCATED.
        throw Object.assign(new Error('模型输出达到长度上限，结构化 JSON 被截断'), {
          code: 'OUTPUT_TRUNCATED',
          name: 'OpenAICompatibleTextReasonerError',
          finishReason: 'length'
        });
      }
      return {
        text: validV2DirectionsPayload(),
        finishReason: 'stop',
        usage: { inputTokens: 120, outputTokens: 5200, totalTokens: 5320 },
        model: 'qwen3.6-plus', provider: 'test'
      };
    }
  };
}

async function runStage04({ failureMode = 'none' } = {}) {
  const ctx = buildPipelineContext();
  const mock = makeMockReasoner({ failureMode });
  const result = await runVisualTranslationV2({
    projectId: ctx.projectId,
    analysisRunId: ctx.analysisRunId,
    corpus: ctx.corpus,
    lockedFacts: [],
    lockedAssets: [],
    provider: ctx.provider,
    modelId: ctx.modelId,
    reasoner: mock.reasoner,
    checkpoints: ctx.checkpoints,
    abortSignal: undefined,
    onProgress: () => {},
    onModelResponse: () => {},
    onCheckpoint: () => {}
  });
  return { result, mock, ctx };
}

test('v2 runner selects the 20k Stage 04 profile and completes without truncation', async () => {
  const { result, mock } = await runStage04({ failureMode: 'none' });
  assert.equal(result.protocolVersion, 'visual-translation-v2-execution');
  assert.equal(result.rawDirections.length, 3);
  assert.equal(mock.calls(), 1);
  const diag = result.metrics.find((m) => m.kind === 'token-diagnostic' && m.attemptLabel === 'initial');
  assert.ok(diag, 'expected an initial token-diagnostic');
  assert.equal(diag.profileId, '04-execution-oriented-directions-v2');
  assert.equal(diag.requestedMaxOutputTokens, 20000);
  assert.equal(diag.providerMaxOutputTokens, 32768);
  assert.ok(diag.completionTokens > 0);
});

test('v2 runner recovers from one truncation by escalating the output budget once', async () => {
  const { result, mock } = await runStage04({ failureMode: 'first' });
  assert.equal(mock.calls(), 2, 'should retry once after truncation');
  const escalated = result.metrics.find((m) => m.kind === 'token-diagnostic' && m.attemptLabel === 'escalated');
  assert.ok(escalated, 'expected an escalated token-diagnostic');
  assert.equal(escalated.requestedMaxOutputTokens, 30000);
  assert.equal(result.rawDirections.length, 3);
});

test('v2 runner throws OUTPUT_TRUNCATED_AFTER_RETRY when truncation persists after escalation', async () => {
  await assert.rejects(
    () => runStage04({ failureMode: 'always' }).then((r) => r.result),
    (e) => e.code === 'OUTPUT_TRUNCATED_AFTER_RETRY'
  );
});

test('getModelCapabilities returns the assumed qwen3.6-plus ceiling used for the cap check', () => {
  const cap = getModelCapabilities('dashscope', 'qwen3.6-plus');
  assert.ok(cap && cap.maxOutputTokens === 32768);
  assert.equal(getModelCapabilities('openai', 'gpt-4o'), null);
});
