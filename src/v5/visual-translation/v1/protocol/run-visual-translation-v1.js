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
import { compileVisualDirectionsReport, measureVisualReportComposition } from '../report/compile-visual-directions-report.js';
import { buildVisualTranslationCheckpoint, canResumeVisualTranslationCheckpoint } from '../runtime/visual-translation-checkpoint-store.js';
import { STAGE_PROFILES, VISUAL_TRANSLATION_V1 } from './stage-registry.js';

function abortError() { return new DOMException('用户主动取消', 'AbortError'); }

export async function runVisualTranslationV1(input) {
  const analysisRunId = input.analysisRunId || crypto.randomUUID();
  const startedAt = Date.now();
  const metrics = [];
  const outputs = {};
  const checkpoints = input.checkpoints || {};
  const assertRuntime = () => {
    if (input.abortSignal?.aborted) throw abortError();
    if (Date.now() - startedAt >= VISUAL_TRANSLATION_V1.pipelineBudgetMs) throw Object.assign(new Error('Visual Translation V1 已达到 18 分钟预算'), { code: 'PIPELINE_TIME_BUDGET_EXCEEDED' });
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
          attempt,
          receivedAt: new Date().toISOString(),
          provider: response.provider || input.provider,
          modelId: response.model || input.modelId,
          finishReason: response.finishReason || null,
          usage: response.usage || null,
          text: response.text
        });
        const output = validator(parseStructuredResponse(response.text));
        metrics.push({ stageId, kind: 'model', attempt, durationMs: Date.now() - started, resumed: false, usage: response.usage || null, modelId: response.model || input.modelId, provider: response.provider || input.provider, finishReason: response.finishReason || null, thinkingEnabled: profile.thinking });
        return output;
      } catch (error) {
        if (error.code === 'OUTPUT_TRUNCATED' || error.name === 'AbortError') throw error;
        if (attempt < 2 && response?.text && (error.code === 'FAILED_SCHEMA' || error instanceof SyntaxError)) {
          metrics.push({ stageId, kind: 'model-retry', attempt, durationMs: Date.now() - started, resumed: false, usage: response.usage || null, modelId: response.model || input.modelId, provider: response.provider || input.provider, validationError: error.message });
          requestMessages = [
            ...messages,
            { role: 'assistant', content: response.text },
            { role: 'user', content: `上一次 JSON 未通过协议校验：${error.message}\n请修正后重新输出完整 JSON，不要解释。所有 shortestQuote 必须从对应 Chunk 的 text 中逐字复制连续子串。` }
          ];
          continue;
        }
        throw Object.assign(new Error(`${stageId}：${error.message}`), { code: error.code || 'FAILED_SCHEMA', stageId, cause: error });
      }
    }
    throw new Error(`${stageId}：模型修复重试未产生有效输出`);
  };

  const prepared = await local('00-document-preparation', () => prepareDocumentSet(input));
  outputs['00-document-preparation'] = prepared;
  await save('00-document-preparation', prepared, { upstreamHash: prepared.documentSetHash, promptVersion: 'document-preparation-v1.1', schemaVersion: 'prepared-document-set-v1', outputFile: 'prepared-document-set-v3.json' });

  const evidenceExpected = { stageId: '01-visual-evidence', documentSetHash: prepared.documentSetHash, upstreamHash: prepared.documentSetHash, promptVersion: VISUAL_EVIDENCE_PROMPT_VERSION, schemaVersion: 'visual-evidence-map-v1' };
  let evidenceMap = resume('01-visual-evidence', evidenceExpected, (value) => validateVisualEvidenceMap(value, prepared));
  if (!evidenceMap) {
    evidenceMap = await model('01-visual-evidence', buildVisualEvidencePrompt(prepared, input.lockedFacts, input.lockedAssets), (value) => validateVisualEvidenceMap(value, prepared));
    await save('01-visual-evidence', evidenceMap, { ...evidenceExpected, profile: { ...STAGE_PROFILES['01-visual-evidence'], provider: input.provider, modelId: input.modelId }, outputFile: 'visual-evidence-map-v1.json' });
  }

  const signalUpstream = valueHash(evidenceMap);
  const signalExpected = { stageId: '02-visual-signal-opportunity', documentSetHash: prepared.documentSetHash, upstreamHash: signalUpstream, promptVersion: VISUAL_SIGNAL_OPPORTUNITY_PROMPT_VERSION, schemaVersion: 'visual-signal-opportunity-v1' };
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
  const directionsExpected = { stageId: '04-three-creative-directions', documentSetHash: prepared.documentSetHash, upstreamHash: directionsUpstream, promptVersion: VISUAL_DIRECTIONS_PROMPT_VERSION, schemaVersion: 'visual-creative-directions-v1' };
  let directions = resume('04-three-creative-directions', directionsExpected, (value) => validateVisualCreativeDirections(value, { evidenceMap, signalMap, opportunityMap }));
  if (!directions) {
    directions = await model('04-three-creative-directions', buildVisualDirectionsPrompt({ evidenceMap, signalMap, opportunityMap }), (value) => validateVisualCreativeDirections(value, { evidenceMap, signalMap, opportunityMap }));
    await save('04-three-creative-directions', directions, { ...directionsExpected, profile: { ...STAGE_PROFILES['04-three-creative-directions'], provider: input.provider, modelId: input.modelId }, outputFile: 'visual-creative-directions-v1.json' });
  }

  const recommendation = await local('05-direction-recommendation', () => buildDirectionRecommendation(directions.directions, signalMap));
  await save('05-direction-recommendation', recommendation, { upstreamHash: valueHash(directions), promptVersion: 'local-direction-recommendation-v1.0', schemaVersion: 'direction-recommendation-v1', outputFile: 'direction-recommendation-v1.json' });

  const partial = { analysisRunId, prepared, evidenceMap, signalMap, opportunityMap, directions, recommendation, metrics, outputs };
  const view = buildVisualDirectionsViewModel(partial);
  const reportMarkdown = await local('10-local-report-compiler', () => compileVisualDirectionsReport(view));
  const composition = measureVisualReportComposition(reportMarkdown);
  if (composition.visualRatio < 0.65) throw Object.assign(new Error(`视觉方向报告内容占比不足：${(composition.visualRatio * 100).toFixed(1)}%`), { code: 'REPORT_VISUAL_RATIO_LOW', composition });
  await save('10-local-report-compiler', reportMarkdown, { upstreamHash: valueHash({ directions, recommendation }), promptVersion: VISUAL_TRANSLATION_V1.directionsReportVersion, schemaVersion: VISUAL_TRANSLATION_V1.directionsReportVersion, outputFile: 'visual-directions-report-v1.md' });
  await input.onDirectionsComplete?.({ ...partial, reportMarkdown, composition });
  return Object.freeze({ ...partial, reportMarkdown, composition, modelCallCount: metrics.filter((item) => item.kind === 'model' || item.kind === 'model-retry').length, status: 'completed-directions' });
}
