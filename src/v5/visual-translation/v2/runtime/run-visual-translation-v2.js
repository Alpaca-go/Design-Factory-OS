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

import { buildExecutionDirectionV2Prompt, VISUAL_DIRECTIONS_PROMPT_V2_VERSION } from '../prompts/direction-generation-prompt-v2.js';
import { validateExecutionDirectionV2 } from '../schemas/direction-contract-v2.js';
import { compileExecutionDirectionV2 } from './compile-execution-direction-v2.js';
import { compileExecutionDirectionsReportV2 } from '../report/compile-execution-directions-report-v2.js';

const RETRYABLE_VALIDATION_CODES = new Set([
  'FAILED_SCHEMA', 'DIRECTIONS_NOT_DISTINCT', 'B2B_BOUNDARY_VIOLATION',
  'INDUSTRY_TEMPLATE_RISK', 'RESTRICTED_ASSET_EXECUTION', 'REPORT_LANGUAGE_POLLUTION',
  'PEOPLE_POLICY_MAPPING_CONFLICT', 'DIFFERENCE_MATRIX_SHARED_TRAIT_CONFLICT'
]);

const DEFAULT_SELECTED_TOUCHPOINTS = Object.freeze([
  'poster', 'capability_deck', 'digital_hero', 'packaging_front', 'exhibition_backdrop'
]);

const VISUAL_TRANSLATION_V2 = Object.freeze({
  protocolVersion: 'visual-translation-v2-execution',
  directionsReportVersion: 'visual-directions-report-v2-experimental',
  pipelineBudgetMs: 18 * 60 * 1000
});

function abortError() { return new DOMException('User cancelled the analysis', 'AbortError'); }

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

export async function runVisualTranslationV2(input) {
  const analysisRunId = input.analysisRunId || crypto.randomUUID();
  const startedAt = Date.now();
  const metrics = [];
  const outputs = {};
  const checkpoints = input.checkpoints || {};
  const assertRuntime = () => {
    if (input.abortSignal?.aborted) throw abortError();
    if (Date.now() - startedAt >= VISUAL_TRANSLATION_V2.pipelineBudgetMs) throw Object.assign(new Error('Visual Translation V2 exceeded its 18-minute budget'), { code: 'PIPELINE_TIME_BUDGET_EXCEEDED' });
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
      for (let attempt = 1; attempt <= 2; attempt += 1) {
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
          if (attempt < 2 && response?.text && (RETRYABLE_VALIDATION_CODES.has(error.code) || error instanceof SyntaxError)) {
            validationError = error.message;
            recordDiagnostics(response, maxOutputTokens, attemptLabel, retryCount, error.message);
            metrics.push({ stageId, kind: 'model-retry', attempt, durationMs: Date.now() - started, resumed: false, usage: response.usage || null, modelId: response.model || input.modelId, provider: response.provider || input.provider, validationError: error.message });
            requestMessages = [
              ...messages,
              { role: 'assistant', content: response.text },
              { role: 'user', content: `The previous JSON failed protocol validation: ${error.message}\nCorrect only the invalid fields.\nReturn the complete corrected JSON only.` }
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

  // ── 00 / 01 / 02: FROZEN v1 upstream (do not modify v1) ──────────────────
  const prepared = await local('00-document-preparation', () => prepareDocumentSet(input));
  outputs['00-document-preparation'] = prepared;
  await save('00-document-preparation', prepared, { upstreamHash: prepared.documentSetHash, promptVersion: 'document-preparation-v1.1', schemaVersion: 'prepared-document-set-v1', outputFile: 'prepared-document-set-v3.json' });

  const evidenceExpected = { stageId: '01-visual-evidence', documentSetHash: prepared.documentSetHash, upstreamHash: prepared.documentSetHash, promptVersion: VISUAL_EVIDENCE_PROMPT_VERSION, schemaVersion: 'visual-evidence-map-v1.4' };
  let evidenceMap = resume('01-visual-evidence', evidenceExpected, (value) => validateVisualEvidenceMap(value, prepared));
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
  const { signalMap, opportunityMap } = signalOpportunity;

  // ── 04: EXECUTION-ORIENTED v2 direction generation (replaces v1) ────────
  const v2Context = buildV2Context(evidenceMap);
  const directionsUpstream = valueHash({ evidenceMap, signalMap, opportunityMap });
  const directionsExpected = {
    stageId: '04-three-creative-directions',
    documentSetHash: prepared.documentSetHash,
    upstreamHash: directionsUpstream,
    promptVersion: VISUAL_DIRECTIONS_PROMPT_V2_VERSION,
    schemaVersion: 'visual-direction-v2-execution'
  };
  const contractContext = {
    reportLanguage: evidenceMap.reportLanguage,
    evidenceIds: new Set(evidenceMap.evidence.map((item) => item.evidenceId)),
    allowedAssetIds: new Set(v2Context.assetBoundary.allowed_assets),
    restrictedAssetIds: new Set(v2Context.assetBoundary.restricted_assets)
  };
  let rawDirections = resume('04-three-creative-directions', directionsExpected, (value) => Array.isArray(value) ? value : (value.rawDirections || []));
  if (!rawDirections || !rawDirections.length) {
    rawDirections = await model('04-three-creative-directions', buildExecutionDirectionV2Prompt(v2Context), (value) => {
      const set = value?.visualDirectionV2Set || value;
      const list = Array.isArray(set) ? set : (set?.directions || []);
      if (!Array.isArray(list) || list.length < 1) throw Object.assign(new Error('v2 方向集合为空或结构不符'), { code: 'FAILED_SCHEMA' });
      list.forEach((raw) => validateExecutionDirectionV2(raw, contractContext));
      return list;
    }, {
      profile: getStageProfile('04-execution-oriented-directions-v2'),
      profileId: '04-execution-oriented-directions-v2',
      modelCapabilities: getModelCapabilities(input.provider, input.modelId)
    });
    await save('04-three-creative-directions', rawDirections, { ...directionsExpected, profile: { ...getStageProfile('04-execution-oriented-directions-v2'), provider: input.provider, modelId: input.modelId }, outputFile: 'visual-direction-v2-set.json' });
  }

  // ── 04b: Compile v2 directions (readiness + regression guards) ───────────
  const compiled = await local('04b-compile-execution-directions', () => compileExecutionDirectionV2({
    brandFacts: v2Context.brandFacts,
    evidenceIndex: v2Context.evidenceIndex,
    audienceBoundary: v2Context.audienceBoundary,
    assetBoundary: v2Context.assetBoundary,
    selectedTouchpoints: v2Context.selectedTouchpoints,
    rawDirections
  }));

  // ── 10: EXPERIMENTAL v2 report (independent of v1 Decision Report) ───────
  const reportMarkdown = await local('10-local-report-compiler', () => compileExecutionDirectionsReportV2({ projectId: input.projectId, compiled }));
  const composition = measureExecutionReportComposition(reportMarkdown);
  await save('10-local-report-compiler', reportMarkdown, { upstreamHash: valueHash({ directions: rawDirections, compiled }), promptVersion: VISUAL_TRANSLATION_V2.directionsReportVersion, schemaVersion: VISUAL_TRANSLATION_V2.directionsReportVersion, outputFile: 'visual-directions-report-v2-experimental.md' });

  const partial = { analysisRunId, prepared, evidenceMap, signalMap, opportunityMap, rawDirections, compiled, metrics, outputs };
  return Object.freeze({
    ...partial,
    reportMarkdown,
    composition,
    modelCallCount: metrics.filter((item) => item.kind === 'model' || item.kind === 'model-retry').length,
    status: 'completed-directions',
    protocolVersion: VISUAL_TRANSLATION_V2.protocolVersion,
    reportBasename: 'visual-directions-report-v2-experimental.md'
  });
}
