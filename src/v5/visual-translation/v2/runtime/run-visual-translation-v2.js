// Execution-oriented Visual Translation v2 runner.
//
// Experimental branch `experiment/execution-oriented-directions-v2`. It reuses
// the FROZEN v1 upstream pipeline stages (00-document-preparation,
// 01-visual-evidence, 02-visual-signal-opportunity) verbatim and replaces only
// the direction-generation stage (04) and the report compiler (10) with the
// execution-oriented v2 contract. It does NOT modify v1.
//
// Return shape is intentionally aligned with `runVisualTranslationV1` so the
// desktop `visual-translation-service` can swap runners by mode without changes
// to its post-processing: { reportMarkdown, metrics, composition, modelCallCount,
// status, protocolVersion, reportBasename }.

import crypto from 'node:crypto';
import { prepareDocumentSet } from '../../../shared/analysis/document-preparation.js';
import { parseStructuredResponse } from '../../../shared/analysis/response-parser.js';
import { valueHash } from '../../../shared/analysis/checkpoint-store.js';

import { buildVisualEvidencePrompt, VISUAL_EVIDENCE_PROMPT_VERSION } from '../../v1/prompts/visual-evidence-prompt-v1.js';
import { buildVisualSignalOpportunityPrompt, VISUAL_SIGNAL_OPPORTUNITY_PROMPT_VERSION } from '../../v1/prompts/visual-signal-opportunity-prompt-v1.js';
import { validateVisualEvidenceMap } from '../../v1/schemas/visual-evidence-map-v1.js';
import { validateVisualStrategySignalMap } from '../../v1/schemas/visual-strategy-signal-map-v1.js';
import { validateVisualOpportunityMap } from '../../v1/schemas/visual-opportunity-map-v1.js';
import { buildVisualTranslationCheckpoint, canResumeVisualTranslationCheckpoint } from '../../v1/runtime/visual-translation-checkpoint-store.js';
import { STAGE_PROFILES, VISUAL_TRANSLATION_V1, getStageProfile } from '../../v1/protocol/stage-registry.js';
import { getModelCapabilities, resolveMaxOutputTokens, planTruncationRetry } from '../../../adapters/model-capabilities.js';
import { outputUtilization } from './output-budget.js';
import { conservativelyNormalizeDirectionSet, runStableStep4 } from './run-step4-stable.js';
import { VISUAL_TRANSLATION_V2_RUNTIME_CONFIG } from '../config/visual-translation-v2-runtime-config.js';

import { buildExecutionDirectionV2Prompt, VISUAL_DIRECTIONS_PROMPT_V2_VERSION } from '../prompts/direction-generation-prompt-v2.js';
import { validateExecutionDirectionV2Set } from '../schemas/direction-contract-v2.js';
import { compileExecutionDirectionV2 } from './compile-execution-direction-v2.js';
import { compileExecutionDirectionsAuditV2, compileExecutionDirectionsReportV2 } from '../report/visual-directions-report-compiler.js';
import { normalizeAnalysisPipelineMode, isVisualFactFirstMode } from '../config/analysis-pipeline-mode.js';
import { runVisualFactFirstUpstream } from '../visual-fact-first/run-upstream.js';
import { VISUAL_FACT_FIRST_REQUIRED_ARTIFACTS } from '../visual-fact-first/pipeline-completeness.js';
import { evaluateModelCriticAdvisory, validateLightweightDirections } from './lightweight-validator.js';

const RETRYABLE_VALIDATION_CODES = new Set([
  'FAILED_SCHEMA', 'DIRECTIONS_NOT_DISTINCT', 'B2B_BOUNDARY_VIOLATION',
  'INDUSTRY_TEMPLATE_RISK', 'RESTRICTED_ASSET_EXECUTION', 'REPORT_LANGUAGE_POLLUTION',
  'PEOPLE_POLICY_MAPPING_CONFLICT', 'DIFFERENCE_MATRIX_SHARED_TRAIT_CONFLICT'
]);

const DEFAULT_SELECTED_TOUCHPOINTS = Object.freeze([
  'poster', 'capability_deck', 'digital_hero', 'packaging_front', 'exhibition_backdrop'
]);

const STEP4_REPAIR_CHECKPOINT_STAGE = '04-step4-repair-pending';
const STEP4_REPAIR_CHECKPOINT_SCHEMA = 'visual-direction-v2-step4-repair-pending-r1';
const STEP4_REPAIR_COMPATIBLE_PROMPT_VERSIONS = new Set([
  VISUAL_DIRECTIONS_PROMPT_V2_VERSION,
  'visual-direction-v2-execution-step4-r4',
  'visual-direction-v2-execution-step4-r3'
]);
const V2_STAGE_SEQUENCE = Object.freeze({
  '00-document-preparation': 0,
  '01-visual-evidence': 10,
  '01-visual-relevant-facts': 11,
  '01-visual-brief': 12,
  '01b-visual-brief-review': 13,
  '01b-visual-facts-review': 14,
  '02-visual-signal-opportunity': 20,
  '02-visual-asset-evidence': 21,
  '02b-visual-asset-evidence-review': 22,
  '03a-benchmark-query-compiler': 30,
  '03b-benchmark-retrieval': 31,
  '03c-visual-opportunity-synthesis': 32,
  '03d-visual-opportunity-review': 33,
  '04-step4-input-context': 34,
  '04-three-creative-directions': 40,
  '10-local-report-compiler': 100,
  '10b-local-audit-compiler': 101
});

const VISUAL_TRANSLATION_V2 = Object.freeze({
  protocolVersion: 'visual-translation-v2-execution',
  directionsReportVersion: 'visual-directions-report-v2.1.5-experimental',
  pipelineBudgetMs: VISUAL_TRANSLATION_V2_RUNTIME_CONFIG.pipelineTimeoutMs
});

function abortError() { return new DOMException('User cancelled the analysis', 'AbortError'); }

function attachOpportunityTraceability(directions, visualOpportunitySynthesis) {
  const opportunities = visualOpportunitySynthesis?.differentiation_opportunities || [];
  const knownOpportunityIds = new Set(opportunities.map((item) => item.opportunity_id));
  const familyMap = new Map((visualOpportunitySynthesis?.recommended_direction_families || [])
    .map((item) => [item.family, item.opportunity_id]));
  return (directions || []).map((direction, index) => {
    const root = direction?.visualDirectionV2 || direction;
    if (Array.isArray(root.source_opportunity_ids) && root.source_opportunity_ids.length
      && (!knownOpportunityIds.size || root.source_opportunity_ids.every((id) => knownOpportunityIds.has(id)))) return direction;
    const opportunityId = familyMap.get(root.direction_family) || opportunities[index]?.opportunity_id;
    const enriched = { ...root, source_opportunity_ids: opportunityId ? [opportunityId] : [] };
    return direction?.visualDirectionV2 ? { ...direction, visualDirectionV2: enriched } : enriched;
  });
}

// The v2 experimental report has a different section layout than v1, so the v1
// `measureVisualReportComposition` (tuned for v1 headers) is not meaningful. We
// estimate a rough visual ratio from line content so the desktop record keeps a
// compatible `composition` shape without implying a v1-style measurement.
function measureExecutionReportComposition(markdown) {
  const lines = String(markdown || '').split(/\n+/u);
  if (!lines.length) return { baseCharacters: 0, visualCharacters: 0, visualRatio: 0 };
  const visualHits = lines.filter((line) => /^\s*[-*]\s|执行就绪|可复用视觉资产|行业识别层|构图模板|摄影|素材|资产|负向约束/.test(line)).length;
  const visualRatio = Math.min(1, visualHits / lines.length);
  return { baseCharacters: markdown.length, visualCharacters: visualHits, visualRatio };
}

function buildV2Context(evidenceMap) {
  const suggestedAssets = evidenceMap.suggestedAssets || [];
  const allowedAssets = suggestedAssets.filter((asset) => asset.executable).map((asset) => asset.assetId);
  const restrictedAssets = suggestedAssets.filter((asset) => asset.status === 'restricted').map((asset) => asset.assetId);
  return {
    evidenceIndex: evidenceMap.evidence,
    audienceBoundary: evidenceMap.audienceBoundary,
    assetBoundary: { allowed_assets: allowedAssets, restricted_assets: restrictedAssets },
    selectedTouchpoints: DEFAULT_SELECTED_TOUCHPOINTS,
    brandFacts: { reportLanguage: evidenceMap.reportLanguage, identity: evidenceMap.identity }
  };
}

function countFactLeaves(value) {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countFactLeaves(item), 0);
  if (value && typeof value === 'object') return Object.values(value).reduce((total, item) => total + countFactLeaves(item), 0);
  return value === null || value === undefined || value === '' ? 0 : 1;
}

export async function runVisualTranslationV2(input) {
  const analysisRunId = input.analysisRunId || crypto.randomUUID();
  const startedAt = Date.now();
  const metrics = [];
  const outputs = {};
  const checkpoints = input.checkpoints || {};
  const analysisPipelineMode = normalizeAnalysisPipelineMode(input.analysisPipelineMode);
  const retrievalFirstActive = isVisualFactFirstMode(analysisPipelineMode);
  const assertRuntime = () => {
    if (input.abortSignal?.aborted) throw abortError();
    if (Date.now() - startedAt >= VISUAL_TRANSLATION_V2.pipelineBudgetMs) throw Object.assign(new Error('Visual Translation V2 exceeded its 22-minute budget'), { code: 'PIPELINE_TIME_BUDGET_EXCEEDED' });
  };
  const local = async (stageId, action) => {
    assertRuntime(); input.onProgress?.(stageId); const started = Date.now();
    const output = await action();
    metrics.push({ stageId, kind: 'local', durationMs: Date.now() - started, resumed: false });
    return output;
  };
  const save = async (stageId, output, metadata) => {
    outputs[stageId] = output;
    const checkpoint = buildVisualTranslationCheckpoint({
      projectId: input.projectId, analysisRunId, stageId,
      stageSequence: V2_STAGE_SEQUENCE[stageId],
      documentSetHash: outputs['00-document-preparation'].documentSetHash,
      upstreamHash: metadata.upstreamHash, promptVersion: metadata.promptVersion,
      schemaVersion: metadata.schemaVersion, profile: metadata.profile,
      outputFile: metadata.outputFile, output
    });
    await input.onCheckpoint?.(stageId, { checkpoint, output });
    return output;
  };
  const resume = (stageId, expected, validator) => {
    const saved = checkpoints[stageId];
    if (!saved || !canResumeVisualTranslationCheckpoint(saved.checkpoint, expected, saved.output)) return null;
    const output = validator(structuredClone(saved.output));
    outputs[stageId] = output;
    metrics.push({ stageId, kind: 'checkpoint', durationMs: 0, resumed: true });
    return output;
  };
  const model = async (stageId, messages, validator, options = {}) => {
    assertRuntime();
    input.onProgress?.(stageId);
    const started = Date.now();
    const profile = options.profile || STAGE_PROFILES[stageId];
    const capabilities = options.modelCapabilities || null;
    const providerCap = capabilities?.maxOutputTokens ?? null;
    // §3.4 request-time output limit check (no-op for unconfirmed/unknown models).
    let requestedMaxOutputTokens = profile.maxOutputTokens;
    try {
      requestedMaxOutputTokens = resolveMaxOutputTokens({
        requestedMaxOutputTokens: profile.maxOutputTokens,
        modelCapabilities: capabilities,
        context: { stageId, modelId: input.modelId }
      });
    } catch (error) {
      throw Object.assign(new Error(`${stageId}: ${error.message}`), { code: error.code || 'MODEL_OUTPUT_LIMIT_EXCEEDED', stageId, cause: error });
    }

    const recordDiagnostics = (response, maxOutputTokens, attemptLabel, retryCount, validationError) => {
      const usage = response?.usage || null;
      const completionTokens = usage?.outputTokens ?? null;
      const utilization = completionTokens != null ? outputUtilization({ completionTokens, requestedMaxOutputTokens: maxOutputTokens }) : null;
      const nearLimit = utilization != null && utilization >= 0.85;
      const diagnostic = {
        stageId,
        profileId: options.profileId || stageId,
        modelId: response?.model || input.modelId,
        thinkingEnabled: profile.thinking,
        thinkingBudget: profile.thinkingBudget,
        requestedMaxOutputTokens: maxOutputTokens,
        providerMaxOutputTokens: capabilities?.maxOutputTokens ?? null,
        promptTokens: usage?.inputTokens ?? null,
        completionTokens,
        finishReason: response?.finishReason || null,
        outputCharacters: response?.text?.length ?? null,
        schemaValidated: !validationError,
        retryCount: retryCount || 0,
        attemptLabel,
        validationError: validationError || null,
        outputUtilization: utilization != null ? Number(utilization.toFixed(4)) : null
      };
      metrics.push({ stageId, kind: 'token-diagnostic', durationMs: 0, resumed: false, ...diagnostic });
      if (nearLimit) {
        metrics.push({ stageId, kind: 'token-warning', durationMs: 0, resumed: false, code: 'OUTPUT_TOKEN_BUDGET_NEAR_LIMIT', outputUtilization: diagnostic.outputUtilization, requestedMaxOutputTokens: maxOutputTokens, completionTokens });
      }
    };

    const runGeneration = async (maxOutputTokens, attemptLabel, retryCount = 0) => {
      let requestMessages = messages;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        let response;
        let validationError = null;
        try {
          response = await input.reasoner(requestMessages, {
            signal: input.abortSignal,
            enableThinking: profile.thinking,
            thinkingBudget: profile.thinkingBudget,
            maxOutputTokens,
            requestTimeoutMs: profile.requestTimeoutMs
          });
          await input.onModelResponse?.(stageId, {
            attempt, receivedAt: new Date().toISOString(), provider: response.provider || input.provider,
            modelId: response.model || input.modelId, finishReason: response.finishReason || null,
            usage: response.usage || null, text: response.text
          });
          const output = validator(parseStructuredResponse(response.text));
          recordDiagnostics(response, maxOutputTokens, attemptLabel, retryCount, null);
          metrics.push({ stageId, kind: 'model', attempt, durationMs: Date.now() - started, resumed: false, usage: response.usage || null, modelId: response.model || input.modelId, provider: response.provider || input.provider, finishReason: response.finishReason || null, thinkingEnabled: profile.thinking });
          return output;
        } catch (error) {
          if (error.code === 'OUTPUT_TRUNCATED' || error.name === 'AbortError') throw error;
          const maxRetryAttempt = error?.code === 'REPORT_LANGUAGE_POLLUTION' ? 3 : 2;
          if (attempt < maxRetryAttempt && response?.text && (RETRYABLE_VALIDATION_CODES.has(error.code) || error instanceof SyntaxError)) {
            validationError = error.message;
            recordDiagnostics(response, maxOutputTokens, attemptLabel, retryCount, error.message);
            metrics.push({ stageId, kind: 'model-retry', attempt, durationMs: Date.now() - started, resumed: false, usage: response.usage || null, modelId: response.model || input.modelId, provider: response.provider || input.provider, validationError: error.message });
            let retryContent = `The previous JSON failed protocol validation: ${error.message}\nCorrect only the invalid fields.\nReturn the complete corrected JSON only.`;
            if (error.code === 'REPORT_LANGUAGE_POLLUTION') {
              retryContent += '\n\n重要：所有叙述性文本必须使用中文，不得使用英文。';
            }
            requestMessages = [
              ...messages,
              { role: 'assistant', content: response.text },
              { role: 'user', content: retryContent }
            ];
            continue;
          }
          throw Object.assign(new Error(`${stageId}: ${error.message}`), { code: error.code || 'FAILED_SCHEMA', stageId, cause: error });
        }
      }
      throw new Error(`${stageId}: bounded schema repair did not produce valid output`);
    };

    // §4 truncation recovery: one escalation of the output budget, then give up.
    try {
      return await runGeneration(requestedMaxOutputTokens, 'initial', 0);
    } catch (error) {
      if (error.code !== 'OUTPUT_TRUNCATED' || !profile.truncationRetry?.enabled) throw error;
      const { escalated, canRetry } = planTruncationRetry({
        requestedMaxOutputTokens,
        providerMaxOutputTokens: providerCap,
        multiplier: profile.truncationRetry.multiplier
      });
      if (!canRetry) throw error;
      try {
        return await runGeneration(escalated, 'escalated', 1);
      } catch (err2) {
        if (err2.code === 'OUTPUT_TRUNCATED') {
          throw Object.assign(new Error(`${stageId}: 升级输出预算后仍被截断`), {
            code: 'OUTPUT_TRUNCATED_AFTER_RETRY',
            stageId,
            modelId: input.modelId,
            requestedMaxOutputTokens: requestedMaxOutputTokens,
            escalatedMaxOutputTokens: escalated,
            providerMaxOutputTokens: providerCap,
            finishReason: err2.finishReason ?? null
          });
        }
        throw err2;
      }
    }
  };

  // ── 00: shared document preparation ───────────────────────────────────────
  const prepared = await local('00-document-preparation', () => prepareDocumentSet(input));
  outputs['00-document-preparation'] = prepared;
  await save('00-document-preparation', prepared, { upstreamHash: prepared.documentSetHash, promptVersion: 'document-preparation-v1.1', schemaVersion: 'prepared-document-set-v1', outputFile: 'prepared-document-set-v3.json' });

  let evidenceMap;
  let signalMap;
  let opportunityMap;
  let v2Context;
  let visualFactFirst = null;
  if (retrievalFirstActive) {
    visualFactFirst = await runVisualFactFirstUpstream({
      input, prepared, model, local, save, resume, selectedTouchpoints: input.selectedTouchpoints
    });
    ({ evidenceMap, signalMap, opportunityMap, step4Context: v2Context } = visualFactFirst);
  } else {
    // Frozen legacy upstream remains byte-for-byte compatible with v2.1.5.
    const evidenceExpected = { stageId: '01-visual-evidence', documentSetHash: prepared.documentSetHash, upstreamHash: prepared.documentSetHash, promptVersion: VISUAL_EVIDENCE_PROMPT_VERSION, schemaVersion: 'visual-evidence-map-v1.4' };
    evidenceMap = resume('01-visual-evidence', evidenceExpected, (value) => validateVisualEvidenceMap(value, prepared));
    if (!evidenceMap) {
      evidenceMap = await model('01-visual-evidence', buildVisualEvidencePrompt(prepared, input.lockedFacts, input.lockedAssets), (value) => validateVisualEvidenceMap(value, prepared));
      await save('01-visual-evidence', evidenceMap, { ...evidenceExpected, profile: { ...STAGE_PROFILES['01-visual-evidence'], provider: input.provider, modelId: input.modelId }, outputFile: 'visual-evidence-map-v1.json' });
    }

    const signalUpstream = valueHash(evidenceMap);
    const signalExpected = { stageId: '02-visual-signal-opportunity', documentSetHash: prepared.documentSetHash, upstreamHash: signalUpstream, promptVersion: VISUAL_SIGNAL_OPPORTUNITY_PROMPT_VERSION, schemaVersion: 'visual-signal-opportunity-v1.2' };
    let signalOpportunity = resume('02-visual-signal-opportunity', signalExpected, (value) => ({
      signalMap: validateVisualStrategySignalMap(value.signalMap, evidenceMap),
      opportunityMap: validateVisualOpportunityMap(value.opportunityMap, evidenceMap)
    }));
    if (!signalOpportunity) {
      signalOpportunity = await model('02-visual-signal-opportunity', buildVisualSignalOpportunityPrompt(evidenceMap), (value) => ({
        signalMap: validateVisualStrategySignalMap(value.visualStrategySignalMap, evidenceMap),
        opportunityMap: validateVisualOpportunityMap(value.visualOpportunityMap, evidenceMap)
      }));
      await save('02-visual-signal-opportunity', signalOpportunity, { ...signalExpected, profile: { ...STAGE_PROFILES['02-visual-signal-opportunity'], provider: input.provider, modelId: input.modelId }, outputFile: 'visual-signal-opportunity-v1.json' });
    }
    ({ signalMap, opportunityMap } = signalOpportunity);
    v2Context = buildV2Context(evidenceMap);
  }

  // ── 04: EXECUTION-ORIENTED v2 direction generation (replaces v1) ────────
  const directionsUpstream = valueHash({ analysisPipelineMode, evidenceMap, signalMap, opportunityMap });
  const directionsExpected = {
    stageId: '04-three-creative-directions',
    documentSetHash: prepared.documentSetHash,
    upstreamHash: directionsUpstream,
    promptVersion: VISUAL_DIRECTIONS_PROMPT_V2_VERSION,
    schemaVersion: 'visual-direction-v2-execution-step4-r3'
  };
  const contractContext = {
    reportLanguage: evidenceMap.reportLanguage,
    evidenceIds: new Set(evidenceMap.evidence.map((item) => item.evidenceId)),
    allowedAssetIds: new Set(v2Context.assetBoundary.allowed_assets),
    restrictedAssetIds: new Set(v2Context.assetBoundary.restricted_assets)
  };
  const step4Profile = getStageProfile('04-execution-oriented-directions-v2');
  const repairCheckpointExpected = {
    stageId: STEP4_REPAIR_CHECKPOINT_STAGE,
    documentSetHash: prepared.documentSetHash,
    upstreamHash: directionsUpstream,
    promptVersion: VISUAL_DIRECTIONS_PROMPT_V2_VERSION,
    schemaVersion: STEP4_REPAIR_CHECKPOINT_SCHEMA
  };
  const savedRepairCheckpoint = checkpoints[STEP4_REPAIR_CHECKPOINT_STAGE];
  const savedRepairPromptVersion = savedRepairCheckpoint?.checkpoint?.promptVersion;
  const compatibleRepairCheckpointExpected = STEP4_REPAIR_COMPATIBLE_PROMPT_VERSIONS.has(savedRepairPromptVersion)
    ? { ...repairCheckpointExpected, promptVersion: savedRepairPromptVersion }
    : repairCheckpointExpected;
  const repairCheckpoint = savedRepairCheckpoint
    && canResumeVisualTranslationCheckpoint(
      savedRepairCheckpoint.checkpoint,
      compatibleRepairCheckpointExpected,
      savedRepairCheckpoint.output
    )
    && savedRepairCheckpoint.output?.kind === 'step4_repair_pending'
    && savedRepairCheckpoint.output?.originalJson
    ? structuredClone(savedRepairCheckpoint.output)
    : null;
  let rawDirections = resume('04-three-creative-directions', directionsExpected, (value) => {
    const list = Array.isArray(value) ? value : (value.rawDirections || []);
    const normalized = conservativelyNormalizeDirectionSet({ visualDirectionV2Set: { directions: list } });
    return validateExecutionDirectionV2Set(attachOpportunityTraceability(normalized.visualDirectionV2Set.directions, visualFactFirst?.visualOpportunitySynthesis), contractContext);
  });
  if (!rawDirections || !rawDirections.length) {
    assertRuntime();
    input.onProgress?.('04-three-creative-directions');
    const profile = step4Profile;
    const maxOutputTokens = resolveMaxOutputTokens({
      requestedMaxOutputTokens: profile.maxOutputTokens,
      modelCapabilities: getModelCapabilities(input.provider, input.modelId),
      context: { stageId: '04-three-creative-directions', modelId: input.modelId }
    });
    const step4 = await runStableStep4({
      projectId: input.projectId,
      runId: input.step4RunId || analysisRunId,
      abortSignal: input.abortSignal,
      reasoner: input.reasoner,
      messages: buildExecutionDirectionV2Prompt(v2Context),
      repairCheckpoint,
      profile,
      maxOutputTokens,
      onEvent(event) {
        metrics.push({ stageId: '04-three-creative-directions', kind: 'step4-event', durationMs: event.elapsed_ms, resumed: false, ...event });
        input.onStep4Event?.(event);
      },
      onStatus: input.onStep4Status,
      async onRepairPending(state) {
        const checkpoint = buildVisualTranslationCheckpoint({
          projectId: input.projectId,
          analysisRunId,
          stageId: STEP4_REPAIR_CHECKPOINT_STAGE,
          documentSetHash: prepared.documentSetHash,
          upstreamHash: directionsUpstream,
          promptVersion: VISUAL_DIRECTIONS_PROMPT_V2_VERSION,
          schemaVersion: STEP4_REPAIR_CHECKPOINT_SCHEMA,
          profile: { ...step4Profile, provider: input.provider, modelId: input.modelId },
          outputFile: 'step4-repair-pending.json',
          output: state
        });
        await input.onCheckpoint?.(STEP4_REPAIR_CHECKPOINT_STAGE, { checkpoint, output: state });
      },
      async onModelResponse(attempt, response) {
        await input.onModelResponse?.('04-three-creative-directions', {
          attempt, receivedAt: new Date().toISOString(), provider: response.provider || input.provider,
          modelId: response.model || input.modelId, finishReason: response.finishReason || null,
          usage: response.usage || null, text: response.text
        });
        metrics.push({ stageId: '04-three-creative-directions', kind: attempt === 1 ? 'model' : 'model-repair', attempt, durationMs: 0, resumed: false, usage: response.usage || null, modelId: response.model || input.modelId, provider: response.provider || input.provider, finishReason: response.finishReason || null, thinkingEnabled: profile.thinking });
      },
      validate(list) {
        return validateExecutionDirectionV2Set(attachOpportunityTraceability(list, visualFactFirst?.visualOpportunitySynthesis), contractContext);
      }
    });
    rawDirections = step4.directions;
    await save('04-three-creative-directions', rawDirections, { ...directionsExpected, profile: { ...getStageProfile('04-execution-oriented-directions-v2'), provider: input.provider, modelId: input.modelId }, outputFile: retrievalFirstActive ? '06-Visual-Directions.json' : 'visual-direction-v2-set.json' });
  }
  await input.onCheckpointRemoved?.(STEP4_REPAIR_CHECKPOINT_STAGE);

  // ── 04b: Compile v2 directions (readiness + regression guards) ───────────
  const compiledBase = await local('04b-compile-execution-directions', () => compileExecutionDirectionV2({
    brandFacts: v2Context.brandFacts,
    evidenceIndex: v2Context.evidenceIndex,
    audienceBoundary: v2Context.audienceBoundary,
    assetBoundary: v2Context.assetBoundary,
    selectedTouchpoints: v2Context.selectedTouchpoints,
    rawDirections
  }));

  const lightweightValidation = retrievalFirstActive
    ? validateLightweightDirections({ compiled: compiledBase, pipelineCompleteness: visualFactFirst?.pipelineCompleteness, benchmarkRetrieval: visualFactFirst?.benchmarkRetrieval })
    : null;
  const modelCritic = retrievalFirstActive ? evaluateModelCriticAdvisory(compiledBase, {
    benchmarkRetrieval: visualFactFirst?.benchmarkRetrieval,
    visualAssetEvidence: visualFactFirst?.visualAssetEvidence
  }) : null;
  const compiled = lightweightValidation ? {
    ...compiledBase,
    legacy_gate_status: compiledBase.overall_status,
    overall_status: lightweightValidation.status,
    execution_permission_status: lightweightValidation.status === 'blocked' ? 'blocked' : lightweightValidation.status === 'ready' ? 'allowed' : 'conditional',
    blocking_reasons: [...lightweightValidation.hard_blocks, ...lightweightValidation.rewrite_required, ...lightweightValidation.warnings],
    lightweight_validation: lightweightValidation,
    model_critic: modelCritic
  } : compiledBase;
  // ── 10: compile the formal visual-direction report ───────────────────────
  const reportMarkdown = await local('10-local-report-compiler', () => compileExecutionDirectionsReportV2({
    projectId: input.projectId, compiled, analysisPipelineMode,
    pipelineCompleteness: visualFactFirst?.pipelineCompleteness,
    visualFactFirst
  }));
  const composition = measureExecutionReportComposition(reportMarkdown);
  await save('10-local-report-compiler', reportMarkdown, { upstreamHash: valueHash({ directions: rawDirections, compiled }), promptVersion: VISUAL_TRANSLATION_V2.directionsReportVersion, schemaVersion: VISUAL_TRANSLATION_V2.directionsReportVersion, outputFile: retrievalFirstActive ? '06-Visual-Directions-Report.md' : 'visual-directions-report-v2-experimental.md' });
  const auditMarkdown = retrievalFirstActive
    ? await local('10b-local-audit-compiler', () => compileExecutionDirectionsAuditV2({
      projectId: input.projectId, compiled, analysisPipelineMode,
      pipelineCompleteness: visualFactFirst?.pipelineCompleteness,
      visualFactFirst
    }))
    : null;
  if (auditMarkdown) {
    await save('10b-local-audit-compiler', auditMarkdown, {
      upstreamHash: valueHash({ directions: rawDirections, compiled }),
      promptVersion: VISUAL_TRANSLATION_V2.directionsReportVersion,
      schemaVersion: VISUAL_TRANSLATION_V2.directionsReportVersion,
      outputFile: '06-Visual-Directions-Audit.md'
    });
  }

  const stageDuration = (stageId) => metrics.filter((item) => item.stageId === stageId).reduce((total, item) => total + Number(item.durationMs || 0), 0);
  const stageTokens = (stageId, key) => metrics.filter((item) => item.stageId === stageId && item.usage).reduce((total, item) => total + Number(item.usage?.[key] || 0), 0);
  const vffFactRecords = Object.values(visualFactFirst?.visualFacts.fact_records || {});
  const pipelineObservability = Object.freeze({
    pipeline_mode: analysisPipelineMode,
    pipeline_completeness: visualFactFirst?.pipelineCompleteness || 'complete',
    artifact_manifest: visualFactFirst ? VISUAL_FACT_FIRST_REQUIRED_ARTIFACTS : [],
    source_document_chars: prepared.sourceDocuments.reduce((total, item) => total + item.characterCount, 0),
    extracted_fact_count: visualFactFirst ? countFactLeaves(visualFactFirst.visualFacts) : evidenceMap.evidence.length,
    unresolved_fact_count: visualFactFirst?.visualFacts.confidence.unresolved_fields.length || evidenceMap.missingInformation.length,
    fact_evidence_coverage: visualFactFirst && vffFactRecords.length
      ? Number((vffFactRecords.filter((item) => item.evidence_ids.length > 0).length / vffFactRecords.length).toFixed(4))
      : null,
    fact_extraction_ms: visualFactFirst ? stageDuration('01-visual-relevant-facts') : stageDuration('01-visual-evidence'),
    fact_input_tokens: visualFactFirst ? stageTokens('01-visual-relevant-facts', 'inputTokens') : stageTokens('01-visual-evidence', 'inputTokens'),
    fact_output_tokens: visualFactFirst ? stageTokens('01-visual-relevant-facts', 'outputTokens') : stageTokens('01-visual-evidence', 'outputTokens'),
    benchmark_query_count: visualFactFirst?.benchmarkRetrieval.query_count || 0,
    benchmark_result_count: visualFactFirst?.benchmarkRetrieval.result_count || 0,
    benchmark_relevant_count: visualFactFirst?.benchmarkRetrieval.relevant_count || 0,
    benchmark_minimum_requirements_met: visualFactFirst?.benchmarkRetrieval.minimum_case_requirements_met || false,
    benchmark_ms: stageDuration('03b-benchmark-retrieval'),
    opportunity_count: visualFactFirst?.visualOpportunitySynthesis.differentiation_opportunities.length || 0,
    opportunity_traceability_rate: visualFactFirst && rawDirections.length
      ? Number((rawDirections.filter((direction) => direction.source_opportunity_ids?.length).length / rawDirections.length).toFixed(4))
      : null,
    opportunity_ms: visualFactFirst ? stageDuration('03c-visual-opportunity-synthesis') : stageDuration('02-visual-signal-opportunity'),
    step4_input_chars: JSON.stringify(v2Context).length,
    step4_input_tokens: stageTokens('04-three-creative-directions', 'inputTokens'),
    step4_output_tokens: stageTokens('04-three-creative-directions', 'outputTokens'),
    total_runtime_ms: Date.now() - startedAt,
    final_status: compiled.overall_status
  });
  metrics.push({ stageId: 'pipeline-observability', kind: 'summary', durationMs: 0, resumed: false, ...pipelineObservability });
  const partial = { analysisRunId, analysisPipelineMode, prepared, evidenceMap, signalMap, opportunityMap, visualFactFirst, rawDirections, compiled, pipelineObservability, metrics, outputs };
  return Object.freeze({
    ...partial,
    reportMarkdown,
    auditMarkdown,
    composition,
    modelCallCount: metrics.filter((item) => item.kind === 'model' || item.kind === 'model-retry' || item.kind === 'model-repair').length,
    status: 'completed-directions',
    protocolVersion: VISUAL_TRANSLATION_V2.protocolVersion,
    reportBasename: retrievalFirstActive ? '06-Visual-Directions-Report.md' : 'visual-directions-report-v2-experimental.md'
  });
}
