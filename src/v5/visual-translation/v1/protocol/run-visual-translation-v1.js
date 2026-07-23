import crypto from 'node:crypto';
import { prepareDocumentSet } from '../../../shared/analysis/document-preparation.js';
import { parseStructuredResponse } from '../../../shared/analysis/response-parser.js';
import { valueHash } from '../../../shared/analysis/checkpoint-store.js';
import { buildVisualEvidencePrompt, VISUAL_EVIDENCE_PROMPT_VERSION } from '../prompts/visual-evidence-prompt-v1.js';
import { buildVisualSignalOpportunityPrompt, VISUAL_SIGNAL_OPPORTUNITY_PROMPT_VERSION } from '../prompts/visual-signal-opportunity-prompt-v1.js';
import { buildVisualDirectionsPrompt, VISUAL_DIRECTIONS_PROMPT_VERSION } from '../prompts/visual-directions-prompt-v1.js';
import { validateVisualEvidenceMap } from '../schemas/visual-evidence-map-v1.js';
import { validateVisualStrategySignalMap } from '../schemas/visual-strategy-signal-map-v1.js';
import { validateVisualOpportunityMap } from '../schemas/visual-opportunity-map-v1.js';
import { validateVisualCreativeDirections } from '../schemas/visual-creative-directions-v1.js';
import { buildDirectionRecommendation } from '../schemas/direction-recommendation-v1.js';
import { buildVisualDirectionsViewModel } from '../report/build-visual-directions-view-model.js';
import { compileVisualDirectionsReport, measureVisualReportComposition, sanitizeDecisionReport, validateDecisionReportRender } from '../report/compile-visual-directions-report.js';
import { measurePrimaryLanguage } from '../schemas/report-language-v1.js';
import { buildVisualTranslationCheckpoint, canResumeVisualTranslationCheckpoint } from '../runtime/visual-translation-checkpoint-store.js';
import { STAGE_PROFILES, VISUAL_TRANSLATION_V1 } from './stage-registry.js';

const RETRYABLE_VALIDATION_CODES = new Set([
  'FAILED_SCHEMA', 'DIRECTIONS_NOT_DISTINCT', 'B2B_BOUNDARY_VIOLATION',
  'INDUSTRY_TEMPLATE_RISK', 'RESTRICTED_ASSET_EXECUTION', 'REPORT_LANGUAGE_POLLUTION',
  'PEOPLE_POLICY_MAPPING_CONFLICT', 'DIFFERENCE_MATRIX_SHARED_TRAIT_CONFLICT'
]);

function abortError() { return new DOMException('User cancelled the analysis', 'AbortError'); }

export async function runVisualTranslationV1(input) {
  const analysisRunId = input.analysisRunId || crypto.randomUUID();
  const startedAt = Date.now();
  const metrics = [];
  const outputs = {};
  const checkpoints = input.checkpoints || {};
  const assertRuntime = () => {
    if (input.abortSignal?.aborted) throw abortError();
    if (Date.now() - startedAt >= VISUAL_TRANSLATION_V1.pipelineBudgetMs) throw Object.assign(new Error('Visual Translation V1 exceeded its 18-minute budget'), { code: 'PIPELINE_TIME_BUDGET_EXCEEDED' });
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
  const model = async (stageId, messages, validator) => {
    assertRuntime(); input.onProgress?.(stageId); const profile = STAGE_PROFILES[stageId]; const started = Date.now();
    let requestMessages = messages;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let response;
      try {
        response = await input.reasoner(requestMessages, { signal: input.abortSignal, enableThinking: profile.thinking, thinkingBudget: profile.thinkingBudget, maxOutputTokens: profile.maxOutputTokens, requestTimeoutMs: profile.requestTimeoutMs });
        await input.onModelResponse?.(stageId, {
          attempt, receivedAt: new Date().toISOString(), provider: response.provider || input.provider,
          modelId: response.model || input.modelId, finishReason: response.finishReason || null,
          usage: response.usage || null, text: response.text
        });
        const output = validator(parseStructuredResponse(response.text));
        metrics.push({ stageId, kind: 'model', attempt, durationMs: Date.now() - started, resumed: false, usage: response.usage || null, modelId: response.model || input.modelId, provider: response.provider || input.provider, finishReason: response.finishReason || null, thinkingEnabled: profile.thinking });
        return output;
      } catch (error) {
        if (error.code === 'OUTPUT_TRUNCATED' || error.name === 'AbortError') throw error;
        if (attempt < 2 && response?.text && (RETRYABLE_VALIDATION_CODES.has(error.code) || error instanceof SyntaxError)) {
          metrics.push({ stageId, kind: 'model-retry', attempt, durationMs: Date.now() - started, resumed: false, usage: response.usage || null, modelId: response.model || input.modelId, provider: response.provider || input.provider, validationError: error.message });
          const repairInstruction = stageId === '04-three-creative-directions' && error.repairDirectionIds?.length
            ? `Only rewrite these similar or invalid directions: ${error.repairDirectionIds.join(', ')}. Preserve every other direction unchanged. Do not rerun Evidence, Signals or Opportunities.`
            : error.code === 'RESTRICTED_ASSET_EXECUTION' && error.invalidAssetIds?.length
              ? `Remove these invalid asset IDs from executableAssetIds: ${error.invalidAssetIds.join(', ')}. Only use asset IDs that are explicitly listed as executable in the Evidence context. If no executable assets are available, leave executableAssetIds empty.`
              : 'Correct only the invalid fields.';
          requestMessages = [
            ...messages,
            { role: 'assistant', content: response.text },
            { role: 'user', content: `The previous JSON failed protocol validation: ${error.message}\n${repairInstruction}\nReturn the complete corrected JSON only. Evidence shortestQuote values must remain verbatim source substrings.` }
          ];
          continue;
        }
        throw Object.assign(new Error(`${stageId}: ${error.message}`), { code: error.code || 'FAILED_SCHEMA', stageId, cause: error });
      }
    }
    throw new Error(`${stageId}: bounded schema repair did not produce valid output`);
  };

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

  const directionsUpstream = valueHash({ evidenceMap, signalMap, opportunityMap });
  const directionsExpected = { stageId: '04-three-creative-directions', documentSetHash: prepared.documentSetHash, upstreamHash: directionsUpstream, promptVersion: VISUAL_DIRECTIONS_PROMPT_VERSION, schemaVersion: 'visual-creative-directions-v1.3' };
  let directions = resume('04-three-creative-directions', directionsExpected, (value) => validateVisualCreativeDirections(value, { evidenceMap, signalMap, opportunityMap, differenceEvaluator: input.differenceEvaluator }));
  if (!directions) {
    directions = await model('04-three-creative-directions', buildVisualDirectionsPrompt({ evidenceMap, signalMap, opportunityMap }), (value) => validateVisualCreativeDirections(value, { evidenceMap, signalMap, opportunityMap, differenceEvaluator: input.differenceEvaluator }));
    await save('04-three-creative-directions', directions, { ...directionsExpected, profile: { ...STAGE_PROFILES['04-three-creative-directions'], provider: input.provider, modelId: input.modelId }, outputFile: 'visual-creative-directions-v1.json' });
  }

  const recommendation = await local('05-direction-recommendation', () => buildDirectionRecommendation(directions.directions, signalMap, evidenceMap.audienceBoundary, evidenceMap.reportLanguage));
  await save('05-direction-recommendation', recommendation, { upstreamHash: valueHash(directions), promptVersion: 'local-direction-recommendation-v1.2', schemaVersion: 'direction-recommendation-v1.2', outputFile: 'direction-recommendation-v1.json' });

  const partial = { analysisRunId, prepared, evidenceMap, signalMap, opportunityMap, directions, recommendation, metrics, outputs };
  const view = buildVisualDirectionsViewModel(partial);
  const reportMarkdownRaw = await local('10-local-report-compiler', () => compileVisualDirectionsReport(view, { mode: input.reportMode || 'decision' }));
  const reportMarkdown = sanitizeDecisionReport(reportMarkdownRaw);
  validateDecisionReportRender(reportMarkdown);
  const composition = measureVisualReportComposition(reportMarkdown);
  const languageMetadata = measurePrimaryLanguage(reportMarkdown, evidenceMap.reportLanguage);
  if (composition.visualRatio < 0.65) throw Object.assign(new Error(`Visual content ratio is too low: ${(composition.visualRatio * 100).toFixed(1)}%`), { code: 'REPORT_VISUAL_RATIO_LOW', composition });
  if (languageMetadata.language_status !== 'pass') throw Object.assign(new Error(`Primary report language ratio is below 90%: ${languageMetadata.primary_language_ratio}`), { code: 'REPORT_LANGUAGE_POLLUTION', languageMetadata });
  await save('10-local-report-compiler', reportMarkdown, { upstreamHash: valueHash({ directions, recommendation }), promptVersion: VISUAL_TRANSLATION_V1.directionsReportVersion, schemaVersion: VISUAL_TRANSLATION_V1.directionsReportVersion, outputFile: 'visual-directions-report-v1.md' });
  await input.onDirectionsComplete?.({ ...partial, reportMarkdown, composition, languageMetadata });
  return Object.freeze({ ...partial, reportMarkdown, composition, languageMetadata, modelCallCount: metrics.filter((item) => item.kind === 'model' || item.kind === 'model-retry').length, status: 'completed-directions' });
}
