import crypto from 'node:crypto';
import { parseBrandDnaResponse } from '../../response-parser.js';
import { prepareDocumentSet } from '../preparation/prepare-document-set.js';
import { buildEvidenceMapPrompt, EVIDENCE_MAP_PROMPT_VERSION } from '../evidence/evidence-map-prompt.js';
import { validateEvidenceMap } from '../evidence/validate-evidence-map.js';
import { mergeEvidenceBatches } from '../evidence/merge-evidence-batches.js';
import { buildBrandCreativeDecisionPrompt, BRAND_CREATIVE_DECISION_PROMPT_VERSION } from '../decision/brand-creative-decision-prompt.js';
import { validateBrandCreativeDecision } from '../decision/validate-decision.js';
import { runCoreQualityGate } from '../quality/run-core-quality-gate.js';
import { applyRestrictedPatch, buildRestrictedPatchPrompt, validateRestrictedPatch } from '../repair/restricted-patch.js';
import { compileV3CoreReport } from '../report/compile-core-report.js';
import { BRAND_DNA_V3, STAGE_SEQUENCE } from './stage-definitions.js';
import { V3_STAGE_PROFILES } from './stage-profiles.js';
import { buildCheckpoint, canResumeCheckpoint, valueHash } from '../runtime/checkpoint-store.js';

function abortError() { return new DOMException('用户主动取消', 'AbortError'); }

function stageError(code, stageId, error) {
  return Object.assign(new Error(`${stageId}：${error.message}`), { code, stageId, cause: error, path: error.path });
}

export async function runBrandDnaV3Core(input) {
  const analysisRunId = input.analysisRunId || crypto.randomUUID();
  const pipelineStarted = Date.now();
  const metrics = [];
  const outputs = {};
  const checkpoints = input.checkpoints || {};
  const assertBudget = () => {
    if (input.abortSignal?.aborted) throw abortError();
    if (Date.now() - pipelineStarted >= BRAND_DNA_V3.pipelineBudgetMs) throw Object.assign(new Error('Brand DNA v3 已达到 20 分钟总预算'), { code: 'PIPELINE_TIME_BUDGET_EXCEEDED' });
  };
  const local = async (stageId, action) => {
    assertBudget();
    const started = Date.now();
    input.onProgress?.(stageId);
    const output = await action();
    metrics.push({ stageId, kind: 'local', durationMs: Date.now() - started, resumed: false });
    return output;
  };
  const model = async (stageId, messages, validator, profileKey = stageId) => {
    assertBudget();
    const profile = V3_STAGE_PROFILES[profileKey];
    const started = Date.now();
    input.onProgress?.(stageId);
    let response;
    try {
      response = await input.reasoner(messages, { signal: input.abortSignal, enableThinking: profile.thinking, thinkingBudget: profile.thinkingBudget, maxOutputTokens: profile.maxOutputTokens, requestTimeoutMs: profile.requestTimeoutMs });
      const output = validator(parseBrandDnaResponse(response.text));
      metrics.push({ stageId, kind: 'model', durationMs: Date.now() - started, resumed: false, attemptNumber: 1, finishReason: response.finishReason || null, usage: response.usage || null, thinkingEnabled: profile.thinking, modelId: response.model, provider: response.provider });
      return output;
    } catch (error) {
      if (error.code === 'OUTPUT_TRUNCATED') throw error;
      throw stageError(error.code || 'FAILED_SCHEMA', stageId, error);
    }
  };
  const save = async (stageId, output, metadata) => {
    outputs[stageId] = output;
    const checkpoint = buildCheckpoint({ projectId: input.projectId, analysisRunId, stageId, documentSetHash: outputs['00-document-preparation'].documentSetHash, upstreamHash: metadata.upstreamHash, promptVersion: metadata.promptVersion, schemaVersion: metadata.schemaVersion, profile: metadata.profile, outputFile: metadata.outputFile, output, usageRecordIds: [] });
    await input.onCheckpoint?.(stageId, { checkpoint, output });
    return output;
  };
  const resume = (stageId, expected, validator) => {
    const saved = checkpoints[stageId];
    if (!saved || !canResumeCheckpoint(saved.checkpoint, expected, saved.output)) return null;
    const output = validator(structuredClone(saved.output));
    outputs[stageId] = output;
    metrics.push({ stageId, kind: 'checkpoint', durationMs: 0, resumed: true });
    return output;
  };

  const prepared = await local('00-document-preparation', () => prepareDocumentSet(input));
  outputs['00-document-preparation'] = prepared;
  await save('00-document-preparation', prepared, { upstreamHash: prepared.documentSetHash, promptVersion: 'document-preparation-v3.1', schemaVersion: 'prepared-document-set-v3', outputFile: 'document-set.json' });

  const evidenceExpected = { stageId: '01-evidence-map', documentSetHash: prepared.documentSetHash, upstreamHash: prepared.documentSetHash, promptVersion: EVIDENCE_MAP_PROMPT_VERSION, schemaVersion: 'evidence-map-v3' };
  let evidenceMap = resume('01-evidence-map', evidenceExpected, (value) => validateEvidenceMap(value, prepared));
  if (!evidenceMap) {
    const totalCharacters = prepared.chunks.reduce((sum, item) => sum + item.text.length, 0);
    const groups = totalCharacters <= 30000 && prepared.chunks.length <= 20
      ? [prepared.chunks]
      : Array.from({ length: Math.ceil(prepared.chunks.length / 12) }, (_, index) => prepared.chunks.slice(index * 12, index * 12 + 12));
    const batchMaps = [];
    for (let offset = 0; offset < groups.length; offset += 2) {
      batchMaps.push(...await Promise.all(groups.slice(offset, offset + 2).map((chunks) => {
        const batchPrepared = { ...prepared, chunks };
        return model('01-evidence-map', buildEvidenceMapPrompt(batchPrepared), (value) => validateEvidenceMap(value, batchPrepared));
      })));
    }
    evidenceMap = mergeEvidenceBatches(batchMaps);
    await save('01-evidence-map', evidenceMap, { upstreamHash: evidenceExpected.upstreamHash, promptVersion: evidenceExpected.promptVersion, schemaVersion: evidenceExpected.schemaVersion, profile: { ...V3_STAGE_PROFILES['01-evidence-map'], provider: input.provider, modelId: input.modelId }, outputFile: 'evidence-map.json' });
  }

  const decisionExpected = { stageId: '02-brand-creative-decision', documentSetHash: prepared.documentSetHash, upstreamHash: valueHash(evidenceMap), promptVersion: BRAND_CREATIVE_DECISION_PROMPT_VERSION, schemaVersion: 'brand-dna-decision-schema-v3' };
  let decision = resume('02-brand-creative-decision', decisionExpected, (value) => validateBrandCreativeDecision(value, evidenceMap));
  if (!decision) {
    decision = await model('02-brand-creative-decision', buildBrandCreativeDecisionPrompt({ prepared, evidenceMap, lockedFacts: input.lockedFacts }), (value) => validateBrandCreativeDecision(value, evidenceMap));
    await save('02-brand-creative-decision', decision, { upstreamHash: decisionExpected.upstreamHash, promptVersion: decisionExpected.promptVersion, schemaVersion: decisionExpected.schemaVersion, profile: { ...V3_STAGE_PROFILES['02-brand-creative-decision'], provider: input.provider, modelId: input.modelId }, outputFile: 'brand-creative-decision.json' });
  }

  let qualityGate = await local('03-core-quality-gate', () => runCoreQualityGate(decision, evidenceMap));
  if (!qualityGate.passed && qualityGate.requiresPatch && input.enableModelPatch !== false) {
    const request = buildRestrictedPatchPrompt(decision, qualityGate.issues);
    const patch = await model('decision-patch', request.messages, (value) => validateRestrictedPatch(value, request.paths), 'decision-patch');
    decision = validateBrandCreativeDecision(applyRestrictedPatch(decision, patch), evidenceMap);
    qualityGate = runCoreQualityGate(decision, evidenceMap, { patchUsed: true });
    if (qualityGate.passed) {
      await save('02-brand-creative-decision', decision, { upstreamHash: decisionExpected.upstreamHash, promptVersion: decisionExpected.promptVersion, schemaVersion: decisionExpected.schemaVersion, profile: { ...V3_STAGE_PROFILES['02-brand-creative-decision'], provider: input.provider, modelId: input.modelId }, outputFile: 'brand-creative-decision.json' });
    }
  }
  if (!qualityGate.passed) throw Object.assign(new Error(`核心质量门未通过：${qualityGate.issues.map((item) => `${item.path} ${item.message}`).join('；')}`), { code: 'CORE_QUALITY_GATE_FAILED', stageId: '03-core-quality-gate', issues: qualityGate.issues });
  await save('03-core-quality-gate', qualityGate, { upstreamHash: valueHash(decision), promptVersion: 'core-quality-gate-v3.1', schemaVersion: 'core-quality-gate-v3', outputFile: 'core-quality-gate.json' });
  const reportMarkdown = await local('04-core-report', () => compileV3CoreReport({ decision, evidenceMap, prepared, qualityGate, metrics }));
  await save('04-core-report', reportMarkdown, { upstreamHash: valueHash({ decision, evidenceMap, qualityGate }), promptVersion: BRAND_DNA_V3.coreReportVersion, schemaVersion: BRAND_DNA_V3.coreReportVersion, outputFile: 'brand-dna-core-report-v3.md' });
  await input.onCoreComplete?.({ decision, evidenceMap, prepared, qualityGate, reportMarkdown, metrics, checkpoints: outputs });
  return { analysisRunId, prepared, evidenceMap, decision, qualityGate, reportMarkdown, metrics, outputs, modelCallCount: metrics.filter((item) => item.kind === 'model').length };
}
