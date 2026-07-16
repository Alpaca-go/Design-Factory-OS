import crypto from 'node:crypto';
import { parseBrandDnaResponse } from './response-parser.js';
import { validateBrandDna } from './schema.js';
import {
  BRAND_DNA_PROTOCOL,
  BRAND_DNA_QUALITY_GATE,
  REASONING_QUALITY_TIERS
} from './protocol-config.js';
import { buildEvidenceExtractionPrompt } from './prompts/evidence-extractor.js';
import {
  buildFactNormalizationPrompt,
  buildFactReconciliationPrompt
} from './prompts/fact-normalizer.js';
import { buildStrategicModelPrompt } from './prompts/strategy-reconstructor.js';
import { buildStrategicCriticPrompt } from './prompts/strategic-critic.js';
import { buildDnaSynthesisPrompt } from './prompts/dna-synthesizer.js';
import { buildCreativeThesisPrompt } from './prompts/creative-thesis-selector.js';
import { buildVisualTranslationPrompt } from './prompts/visual-translator.js';
import { buildImageTaskPrompt } from './prompts/image-spec-compiler.js';
import {
  buildAuditPrompt,
  buildTargetedRepairPrompt
} from './prompts/quality-auditor.js';
import { DEFAULT_INDUSTRY_RULES } from './prompts/industry-rules/default.js';
import {
  StructuredValidationError,
  validateImageTasksV2,
  validationErrorPaths
} from './validation/image-task-validator.js';
import {
  normalizeStructuredStageOutput,
  normalizeVisualTranslationOutput
} from './normalization/normalize-image-task-output.js';
import {
  applyStructuredRepairPatch,
  buildStructuredPatchPrompt,
  jsonPathToPointer,
  validateStructuredRepairPatch
} from './repair/structured-patch-repair.js';
import {
  applyTargetedRepairPatch,
  validateTargetedRepairPatch
} from './repair/targeted-repair-patch.js';
import {
  assertPipelineBudget,
  BRAND_DNA_PIPELINE_BUDGET_MS,
  BrandDnaTimeoutError,
  remainingPipelineBudget,
  stageProfile
} from './runtime/stage-budget.js';
import { stableJsonHash } from './runtime/checkpoint-store.js';
import { shouldReuseCheckpoint } from './runtime/resume-planner.js';
import {
  combineAbortSignals,
  createTimeoutSignal
} from '../shared/abort/combine-abort-signals.js';
import {
  GPT_IMAGE_TASK_V2_JSON_SCHEMA,
  STRUCTURED_PATCH_JSON_SCHEMA
} from './schemas/gpt-image-task-v2.js';

export class BrandDnaQualityGateError extends Error {
  constructor(audit) {
    super(`品牌 DNA 质量闸门未通过：${(audit.hardFailures || []).join('；') || `总分 ${audit.totalScore}`}`);
    this.name = 'BrandDnaQualityGateError';
    this.code = 'FAILED_QUALITY_GATE';
    this.audit = audit;
  }
}

export class BrandDnaSchemaError extends Error {
  constructor(stage, error, code = 'FAILED_SCHEMA') {
    super(`${stage} 结构化输出校验失败：${error.message}`);
    this.name = 'BrandDnaSchemaError';
    this.code = code;
    this.stage = stage;
    this.cause = error;
    this.jsonPaths = validationErrorPaths(error);
  }
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`;
}

function splitContent(content, maximum = 12_000) {
  if (content.length <= maximum) return [content];
  const paragraphs = content.split(/\n{2,}/);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maximum) {
      chunks.push(current);
      current = '';
    }
    if (paragraph.length <= maximum) {
      current += `${current ? '\n\n' : ''}${paragraph}`;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = '';
    }
    for (let offset = 0; offset < paragraph.length; offset += maximum) {
      chunks.push(paragraph.slice(offset, offset + maximum));
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function buildDocumentChunks(corpus) {
  const chunks = [];
  for (const document of corpus.documents || []) {
    const sections = document.sections?.length ? document.sections : [{ content: document.rawText }];
    sections.forEach((section, sectionIndex) => {
      const sectionContent = String(section.content || '').trim();
      if (!sectionContent) return;
      splitContent(sectionContent).forEach((content, partIndex) => {
        const sourceId = document.id;
        chunks.push({
          sourceId,
          chunkId: stableId('chunk', `${sourceId}:${sectionIndex}:${partIndex}:${section.heading || ''}:${content}`),
          filename: document.filename,
          documentTitle: document.title || document.filename,
          sectionPath: [
            ...(section.heading ? [section.heading] : [`段落 ${sectionIndex + 1}`]),
            ...(partIndex ? [`分段 ${partIndex + 1}`] : [])
          ],
          page: section.page,
          content,
          sourceType: /\|.+\|/.test(content) ? 'table' : 'paragraph',
          confidence: 1
        });
      });
    });
  }
  if (!chunks.length) throw new Error('文档准备阶段未生成有效语义片段');
  return chunks;
}

function partition(items, maximumItems, maximumCharacters = Infinity) {
  const batches = [];
  let current = [];
  let characters = 0;
  for (const item of items) {
    const size = JSON.stringify(item).length;
    if (current.length && (current.length >= maximumItems || characters + size > maximumCharacters)) {
      batches.push(current);
      current = [];
      characters = 0;
    }
    current.push(item);
    characters += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

function assertArray(value, label, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) {
    throw new StructuredValidationError(`${label} 必须至少包含 ${minimum} 项`, label);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new StructuredValidationError(`${label} 不能为空`, label);
  }
  return value.trim();
}

function assertStringArray(value, label, minimum = 0) {
  const items = assertArray(value, label, minimum);
  items.forEach((item, index) => assertString(item, `${label}[${index}]`));
  return items;
}

function uniqueIds(items, label) {
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const path = `${label}[${index}].id`;
    const id = assertString(item?.id, path);
    if (ids.has(id)) {
      throw new StructuredValidationError(`${path} 与其他项目重复：${id}`, path);
    }
    ids.add(id);
  }
  return ids;
}

function validateEvidence(output, chunks) {
  const items = assertArray(output?.atomicEvidence, 'atomicEvidence', 1);
  uniqueIds(items, 'atomicEvidence');
  const chunkIds = new Set(chunks.map((chunk) => chunk.chunkId));
  for (const [index, item] of items.entries()) {
    const base = `atomicEvidence[${index}]`;
    assertString(item.claim, `${base}.claim`);
    const refs = assertArray(item.sourceRefs, `${base}.sourceRefs`, 1);
    const invalidRef = refs.findIndex((ref) => !chunkIds.has(ref?.chunkId));
    if (invalidRef >= 0) {
      const path = `${base}.sourceRefs[${invalidRef}].chunkId`;
      throw new StructuredValidationError(`${path} 引用了不存在的 chunkId`, path);
    }
  }
  return items;
}

function canonicalizeEvidence(items, offset) {
  return items.map((item, index) => ({
    ...item,
    id: `evidence-${String(offset + index + 1).padStart(4, '0')}`
  }));
}

function validateFacts(output, evidenceIds) {
  const items = assertArray(output?.normalizedFacts, 'normalizedFacts', 1);
  uniqueIds(items, 'normalizedFacts');
  for (const [index, item] of items.entries()) {
    const base = `normalizedFacts[${index}]`;
    assertString(item.statement, `${base}.statement`);
    const refs = assertStringArray(
      item.evidenceIds,
      `${base}.evidenceIds`,
      item.status === 'missing' ? 0 : 1
    );
    if (refs.some((id) => !evidenceIds.has(id))) {
      const path = `${base}.evidenceIds`;
      throw new StructuredValidationError(`${path} 引用了不存在的 evidenceId`, path);
    }
    assertString(item.reasoningSummary, `${base}.reasoningSummary`);
  }
  return items;
}

function canonicalizeFacts(items) {
  return items.map((item, index) => ({ ...item, id: `fact-${String(index + 1).padStart(4, '0')}` }));
}

function validateStrategicModel(output, evidenceIds) {
  const value = output?.strategicModel;
  if (!value || typeof value !== 'object') throw new Error('strategicModel 缺失');
  assertString(value.positioning?.statement, 'strategicModel.positioning.statement');
  assertArray(value.primaryAudience, 'strategicModel.primaryAudience', 1);
  assertArray(value.jobsToBeDone, 'strategicModel.jobsToBeDone', 1);
  assertArray(value.differentiators, 'strategicModel.differentiators', 1);
  const verify = (item, path) => {
    if (!item || typeof item !== 'object') return;
    const ids = assertStringArray(
      item.evidenceIds,
      `${path}.evidenceIds`,
      item.status === 'missing' ? 0 : 1
    );
    if (item.status !== 'missing' && (!ids.length || ids.some((id) => !evidenceIds.has(id)))) {
      const evidencePath = `${path}.evidenceIds`;
      throw new StructuredValidationError(`${evidencePath} 包含无效 evidenceId`, evidencePath);
    }
  };
  Object.entries(value).forEach(([key, item]) => {
    if (Array.isArray(item)) {
      item.forEach((entry, index) => verify(entry, `strategicModel.${key}[${index}]`));
    } else {
      verify(item, `strategicModel.${key}`);
    }
  });
  return value;
}

function validateIssues(output, evidenceIds) {
  const items = assertArray(output?.strategicIssues, 'strategicIssues', 1);
  uniqueIds(items, 'strategicIssues');
  const problems = [];
  for (const [index, item] of items.entries()) {
    const base = `strategicIssues[${index}]`;
    assertString(item.issue, `${base}.issue`);
    assertString(item.consequence, `${base}.consequence`);
    assertString(item.recommendation, `${base}.recommendation`);
    if (item.recommendationStatus !== 'suggested') {
      const path = `${base}.recommendationStatus`;
      problems.push({
        path,
        message: `${path} 必须标记为 suggested`
      });
    }
    const ids = item.evidenceIds;
    if (
      !Array.isArray(ids)
      || ids.length < 1
      || ids.some((id) => typeof id !== 'string' || !id.trim() || !evidenceIds.has(id))
    ) {
      const path = `${base}.evidenceIds`;
      problems.push({
        path,
        message: `${path} 包含无效 evidenceId`
      });
    }
  }
  if (problems.length) {
    throw new StructuredValidationError(
      problems.map(({ message }) => message).join('；'),
      problems.map(({ path }) => path)
    );
  }
  return items;
}

function validateDnaStage(output) {
  if (!output?.brandDna || typeof output.brandDna !== 'object') throw new Error('brandDna 缺失');
  assertArray(output.brandDna.genes, 'brandDna.genes', 5);
  assertString(output.brandDna.oneSentenceDna, 'brandDna.oneSentenceDna');
  return output.brandDna;
}

function validateThesis(output, geneIds) {
  const value = output?.creativeThesisDecision;
  if (!value || typeof value !== 'object') throw new Error('creativeThesisDecision 缺失');
  assertString(value.selected?.statement, 'creativeThesisDecision.selected.statement');
  const basis = assertStringArray(value.selected?.dnaBasis, 'creativeThesisDecision.selected.dnaBasis', 1);
  if (basis.some((id) => !geneIds.has(id))) {
    const path = 'creativeThesisDecision.selected.dnaBasis';
    throw new StructuredValidationError(`${path} 引用了不存在的 DNA 基因`, path);
  }
  assertArray(value.rejectedCandidateSummaries, 'creativeThesisDecision.rejectedCandidateSummaries', 2);
  if (!Number.isFinite(value.decisionScore)) throw new Error('creativeThesisDecision.decisionScore 缺失');
  return value;
}

function validateVisual(output, geneIds) {
  const normalized = normalizeVisualTranslationOutput({ output }).output;
  const translation = normalized?.visualTranslation;
  const system = normalized?.imageSystem;
  if (!translation?.creativeTranslation || !Array.isArray(translation.mappings)) throw new Error('visualTranslation 缺失');
  assertArray(translation.mappings, 'visualTranslation.mappings', 5);
  const invalidMapping = translation.mappings.findIndex((mapping) => !geneIds.has(mapping?.dnaGeneId));
  if (invalidMapping >= 0) {
    const path = `visualTranslation.mappings[${invalidMapping}].dnaGeneId`;
    throw new StructuredValidationError(`${path} 引用了不存在的 DNA 基因`, path);
  }
  if (!system || typeof system !== 'object') throw new Error('imageSystem 缺失');
  for (const key of [
    'systemId',
    'brandDnaSummary',
    'creativeThesis',
    'anchorVisual',
    'compositionSystem',
    'lightingSystem',
    'imageLanguage',
    'textPolicy',
    'logoPolicy'
  ]) {
    assertString(system[key], `imageSystem.${key}`);
  }
  for (const key of [
    'visualPersonality',
    'materialSystem',
    'consistencyRules',
    'lockedFacts',
    'creativeFreedom',
    'globalProhibitions'
  ]) {
    assertStringArray(system[key], `imageSystem.${key}`, 1);
  }
  assertStringArray(system.knownAssets, 'imageSystem.knownAssets');
  const colors = assertArray(system.colorSystem, 'imageSystem.colorSystem', 1);
  colors.forEach((color, index) => {
    for (const key of ['role', 'direction', 'usage']) {
      assertString(color?.[key], `imageSystem.colorSystem[${index}].${key}`);
    }
  });
  return { translation, system };
}

function validateTasks(output, imageSystem, geneIds) {
  return validateImageTasksV2(output, imageSystem, geneIds);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

function validateAudit(output) {
  const audit = output?.qualityAudit;
  if (!audit || typeof audit !== 'object') throw new Error('qualityAudit 缺失');
  if (!Number.isFinite(audit.totalScore)) throw new Error('qualityAudit.totalScore 缺失');
  if (!audit.dimensionScores || typeof audit.dimensionScores !== 'object') throw new Error('qualityAudit.dimensionScores 缺失');
  for (const key of [
    'projectIdentityAndBoundaries',
    'evidence',
    'strategy',
    'brandDna',
    'diagnosis',
    'creativeThesis',
    'visualSpecificity',
    'imageExecution',
    'crossFieldTechnical'
  ]) {
    if (!Number.isFinite(audit.dimensionScores[key])) throw new Error(`qualityAudit.dimensionScores.${key} 缺失`);
  }
  audit.hardFailures = Array.isArray(audit.hardFailures) ? audit.hardFailures.map(String) : [];
  audit.repairInstructions = Array.isArray(audit.repairInstructions) ? audit.repairInstructions.map(String) : [];
  return audit;
}

export function usageStageForProtocolStage(stageName, schemaRepair = false) {
  if (schemaRepair || stageName === 'targeted-repair') return 'brand-dna.repair';
  return ({
    'atomic-evidence': 'brand-dna.evidence-extraction',
    'normalized-facts': 'brand-dna.fact-normalization',
    'fact-reconciliation': 'brand-dna.fact-normalization',
    'strategic-model': 'brand-dna.strategy-reconstruction',
    'strategic-critic': 'brand-dna.strategic-critique',
    'dna-synthesis': 'brand-dna.dna-synthesis',
    'creative-thesis-decision': 'brand-dna.creative-thesis',
    'visual-causal-translation': 'brand-dna.visual-translation',
    'gpt-image-task-compiler': 'brand-dna.image-spec-compilation',
    'quality-auditor': 'brand-dna.quality-audit',
    'quality-auditor-recheck': 'brand-dna.quality-audit'
  })[stageName] || `brand-dna.${stageName}`;
}

async function runStructuredStage(reasoner, prompt, validator, signal, trace, stageName, options = {}) {
  const stageCallStartedAt = new Date().toISOString();
  const stageCallStartedMs = performance.now();
  const profile = stageProfile(stageName, options.stageProfiles);
  const structuredOutputMode = options.structuredOutputMode === 'json-schema' && options.jsonSchema
    ? 'json-schema'
    : 'json-object';
  const stageTimeout = createTimeoutSignal(
    Math.max(1, Math.min(
      options.remainingStageMs || profile.stageBudgetMs,
      options.remainingPipelineMs || profile.stageBudgetMs
    )),
    new BrandDnaTimeoutError('STAGE_TIMEOUT', stageName, `${stageName} 已超过阶段时间预算。`)
  );
  const combined = combineAbortSignals([signal, stageTimeout.signal]);
  const commonContext = {
    signal: combined.signal,
    structuredOutputMode,
    jsonSchema: options.jsonSchema,
    thinkingEnabled: profile.thinking.enabled,
    thinkingBudgetTokens: profile.thinking.budgetTokens,
    maxOutputTokens: profile.maxOutputTokens,
    requestTimeoutMs: Math.min(profile.requestTimeoutMs, options.remainingPipelineMs || profile.requestTimeoutMs)
  };
  const usageRecordIds = [];
  let response;
  let parsed;
  let normalized;
  let warnings = [];

  try {
    response = await reasoner(prompt, {
      ...commonContext,
      pipelineStage: usageStageForProtocolStage(stageName),
      attemptNumber: 1,
      parentCallId: null
    });
    if (response.usageCallId) usageRecordIds.push(response.usageCallId);
    try {
      parsed = parseBrandDnaResponse(response.text);
    } catch (parseError) {
      trace.push({
        stage: stageName,
        attemptNumber: 1,
        startedAt: stageCallStartedAt,
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - stageCallStartedMs),
        finishReason: response.finishReason || 'unknown',
        parseStatus: 'failed',
        schemaValidationStatus: 'failed',
        schemaErrorPaths: [],
        checkpointStatus: 'not-saved'
      });
      throw new BrandDnaSchemaError(stageName, parseError, 'FAILED_JSON_PARSE');
    }

    try {
      const normalization = normalizeStructuredStageOutput({
        stageId: stageName,
        output: parsed,
        upstreamContext: options.upstreamContext
      });
      normalized = normalization.output;
      warnings = normalization.warnings;
      const value = validator(normalized);
      trace.push({
        stage: stageName,
        attemptNumber: 1,
        startedAt: stageCallStartedAt,
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - stageCallStartedMs),
        finishReason: response.finishReason || 'unknown',
        parseStatus: 'passed',
        schemaValidationStatus: 'passed',
        normalizationWarningCount: warnings.length,
        schemaErrorPaths: [],
        checkpointStatus: 'not-saved',
        structuredOutputMode: commonContext.structuredOutputMode,
        thinkingEnabled: commonContext.thinkingEnabled,
        thinkingBudgetTokens: commonContext.thinkingBudgetTokens,
        maxOutputTokens: commonContext.maxOutputTokens
      });
      return { value, response, retryCount: 0, warnings, usageRecordIds };
    } catch (firstError) {
      const errorPaths = validationErrorPaths(firstError);
      const allowedPointers = [...new Set(errorPaths.map(jsonPathToPointer).filter(Boolean))];
      if (!allowedPointers.length) throw new BrandDnaSchemaError(stageName, firstError);
      trace.push({
        stage: stageName,
        attemptNumber: 1,
        startedAt: stageCallStartedAt,
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - stageCallStartedMs),
        finishReason: response.finishReason || 'unknown',
        parseStatus: 'passed',
        normalizationWarningCount: warnings.length,
        schemaValidationStatus: 'failed',
        schemaErrorPaths: errorPaths,
        checkpointStatus: 'not-saved',
        structuredOutputMode: commonContext.structuredOutputMode,
        thinkingEnabled: commonContext.thinkingEnabled,
        thinkingBudgetTokens: commonContext.thinkingBudgetTokens,
        maxOutputTokens: commonContext.maxOutputTokens
      });

      if (options.allowStructuredPatchRepair === false) {
        throw new BrandDnaSchemaError(stageName, firstError);
      }

      const patchProfile = stageProfile('structured-patch-repair', options.stageProfiles);
      const patchResponse = await reasoner(buildStructuredPatchPrompt({
        stageId: stageName,
        output: normalized,
        error: firstError,
        allowedPointers,
        referenceContext: options.repairReferenceContext || {},
        upstreamRules: options.upstreamContext?.imageSystem?.consistencyRules || []
      }), {
        signal: combined.signal,
        pipelineStage: usageStageForProtocolStage(stageName, true),
        attemptNumber: 2,
        parentCallId: response.usageCallId || null,
        structuredOutputMode: options.structuredOutputMode || 'json-object',
        jsonSchema: options.structuredOutputMode === 'json-schema'
          ? STRUCTURED_PATCH_JSON_SCHEMA
          : undefined,
        thinkingEnabled: false,
        thinkingBudgetTokens: null,
        maxOutputTokens: patchProfile.maxOutputTokens,
        requestTimeoutMs: patchProfile.requestTimeoutMs
      });
      if (patchResponse.usageCallId) usageRecordIds.push(patchResponse.usageCallId);
      let patch;
      try {
        patch = parseBrandDnaResponse(patchResponse.text);
      } catch (patchParseError) {
        throw new BrandDnaSchemaError(stageName, patchParseError, 'FAILED_SCHEMA_AFTER_PATCH');
      }
      validateStructuredRepairPatch(patch, stageName, allowedPointers);
      const patched = applyStructuredRepairPatch(normalized, patch, allowedPointers);
      const afterPatch = normalizeStructuredStageOutput({
        stageId: stageName,
        output: patched,
        upstreamContext: options.upstreamContext
      });
      const value = validator(afterPatch.output);
      warnings = [...warnings, ...afterPatch.warnings];
      trace.push({
        stage: stageName,
        schemaRepair: true,
        attemptNumber: 2,
        runId: patchResponse.runId,
        startedAt: stageCallStartedAt,
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - stageCallStartedMs),
        finishReason: patchResponse.finishReason || 'unknown',
        parseStatus: 'passed',
        schemaValidationStatus: 'passed',
        normalizationWarningCount: warnings.length,
        schemaErrorPaths: errorPaths,
        checkpointStatus: 'not-saved',
        structuredOutputMode: commonContext.structuredOutputMode,
        thinkingEnabled: false,
        maxOutputTokens: patchProfile.maxOutputTokens
      });
      return {
        value,
        response: patchResponse,
        initialResponse: response,
        retryCount: 1,
        warnings,
        usageRecordIds
      };
    }
  } catch (error) {
    if (combined.signal?.aborted && combined.signal.reason?.code) throw combined.signal.reason;
    if (error instanceof BrandDnaSchemaError || [
      'OUTPUT_TRUNCATED',
      'REQUEST_TIMEOUT',
      'STAGE_TIMEOUT',
      'PIPELINE_TIME_BUDGET_EXCEEDED',
      'API_ERROR',
      'REQUEST_FAILED',
      'EMPTY_RESPONSE',
      'RESPONSE_INVALID'
    ].includes(error?.code) || error?.name === 'AbortError') {
      if (!error.stage) error.stage = stageName;
      throw error;
    }
    if (error?.code === 'PATCH_PATH_NOT_ALLOWED') throw error;
    throw new BrandDnaSchemaError(stageName, error, 'FAILED_SCHEMA_AFTER_PATCH');
  } finally {
    stageTimeout.dispose();
    combined.dispose();
  }
}

function evidenceReferences(atomicEvidence, chunks) {
  const chunksById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  return new Map(atomicEvidence.map((evidence) => [
    evidence.id,
    evidence.sourceRefs.map((ref) => {
      const chunk = chunksById.get(ref.chunkId);
      return {
        documentId: ref.sourceId,
        filename: chunk?.filename || chunk?.documentTitle || ref.sourceId,
        section: chunk?.sectionPath?.join(' / '),
        page: chunk?.page,
        excerpt: ref.excerpt
      };
    })
  ]));
}

function hydrateEvidence(value, references) {
  if (Array.isArray(value)) {
    value.forEach((item) => hydrateEvidence(item, references));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.evidenceIds) && (!Array.isArray(value.evidence) || !value.evidence.length)) {
    value.evidence = value.evidenceIds.flatMap((id) => references.get(id) || []);
  }
  Object.values(value).forEach((item) => hydrateEvidence(item, references));
}

function assemblePackage(parts, atomicEvidence, chunks) {
  const brandDna = structuredClone(parts.brandDna);
  brandDna.creativeTranslation = {
    ...parts.visualTranslation.creativeTranslation,
    creativeThesis: parts.creativeThesisDecision.selected.statement,
    mappings: parts.visualTranslation.mappings,
    generationPlan: parts.imageTasks
  };
  brandDna.imageSystem = parts.imageSystem;
  hydrateEvidence(brandDna, evidenceReferences(atomicEvidence, chunks));
  const knownEvidenceIds = atomicEvidence.map((item) => item.id);
  return {
    brandDna: validateBrandDna(brandDna, { requireEvidenceIds: true, knownEvidenceIds }),
    creativeThesisDecision: parts.creativeThesisDecision,
    visualTranslation: parts.visualTranslation,
    imageSystem: parts.imageSystem,
    imageTasks: parts.imageTasks
  };
}

function imageCompilerContext({
  brandDna,
  creativeThesisDecision,
  visualTranslation,
  imageSystem
}) {
  return {
    brandDna: {
      projectName: brandDna.projectName,
      brandName: brandDna.brandName,
      category: brandDna.category,
      oneSentenceDna: brandDna.oneSentenceDna,
      genes: brandDna.genes,
      boundaries: brandDna.boundaries
    },
    creativeThesisDecision: {
      selected: creativeThesisDecision.selected,
      decisionScore: creativeThesisDecision.decisionScore
    },
    visualTranslation,
    imageSystem
  };
}

export function validateImageTaskStandard(imageSystem, imageTasks) {
  const failures = [];
  if (!imageSystem?.systemId) failures.push('没有全局视觉系统 ID');
  if (!imageSystem?.anchorVisual) failures.push('没有全局视觉锚点');
  if (!imageSystem?.lockedFacts?.length) failures.push('没有 Locked Facts');
  if (!imageSystem?.globalProhibitions?.length) failures.push('没有 Negative Constraints');
  if (!imageSystem?.logoPolicy) failures.push('没有 Logo Policy');
  if (!imageSystem?.textPolicy) failures.push('没有 Text Policy');
  if (!imageSystem?.consistencyRules?.length) failures.push('没有跨图片一致性规则');
  if (new Set(imageTasks.map((task) => task.role)).size === 1) failures.push('所有图片职责相同');
  for (const [index, task] of imageTasks.entries()) {
    if (!task.subject) failures.push(`${task.id} 无法判断图片主体`);
    if (!task.composition || !task.lighting) failures.push(`${task.id} 无法判断构图和光线`);
    if (!task.logoPolicy || !task.textPolicy) failures.push(`${task.id} 缺少 Logo 或文字政策`);
    if (!task.consistencyWithGlobalSystem?.length) failures.push(`${task.id} 未说明与全局视觉锚点的一致性`);
    if (index === 0 && task.consistencyWithPreviousTasks?.length) failures.push(`${task.id} 不得引用不存在的前序任务`);
    if (index > 0 && !task.consistencyWithPreviousTasks?.length) failures.push(`${task.id} 未说明与前序任务的一致性`);
    if (String(task.finalPrompt || '').length < 120) failures.push(`${task.id} finalPrompt 上下文不足`);
    if (/重新设计.{0,8}logo|重绘.{0,8}logo/i.test(task.finalPrompt || '')) failures.push(`${task.id} 要求重新设计已有 Logo`);
  }
  return failures;
}

export function applyQualityGate(audit, localHardFailures = []) {
  const dimensions = audit.dimensionScores || {};
  const hardFailures = [...new Set([...(audit.hardFailures || []), ...localHardFailures])];
  const passed = Boolean(
    audit.passed
    && audit.totalScore >= BRAND_DNA_QUALITY_GATE.minTotalScore
    && Number(dimensions.projectIdentityAndBoundaries) >= BRAND_DNA_QUALITY_GATE.minProjectIdentityAndBoundariesScore
    && Number(dimensions.evidence) >= BRAND_DNA_QUALITY_GATE.minEvidenceScore
    && Number(dimensions.strategy) >= BRAND_DNA_QUALITY_GATE.minStrategyScore
    && Number(dimensions.imageExecution) >= BRAND_DNA_QUALITY_GATE.minImageExecutionScore
    && Number(dimensions.crossFieldTechnical) >= BRAND_DNA_QUALITY_GATE.minCrossFieldTechnicalScore
    && hardFailures.length === 0
  );
  return { ...audit, passed, hardFailures };
}

export async function runBrandDnaDeepProtocol(input) {
  const qualityTier = REASONING_QUALITY_TIERS.includes(input.qualityTier)
    ? input.qualityTier
    : 'experimental';
  if (qualityTier === 'unsupported') {
    throw Object.assign(new Error('当前模型被标记为不支持 Brand DNA Deep Analysis'), {
      code: 'UNSUPPORTED_MODEL_TIER'
    });
  }
  const chunks = buildDocumentChunks(input.corpus);
  const trace = [];
  const pipelineStartedAtMs = Date.now();
  const pipelineBudgetMs = Number.isFinite(input.pipelineBudgetMs)
    ? input.pipelineBudgetMs
    : BRAND_DNA_PIPELINE_BUDGET_MS;
  const checkpointStore = input.checkpointStore || null;
  const reuseCheckpoints = checkpointStore && shouldReuseCheckpoint(input.resumeMode);
  const completedStageIds = [];
  const reusableCheckpointIds = [];
  const normalizationWarnings = [];
  const stageUsageRecordIds = [];
  const stageStartedAt = new Map();
  let structuredUpstreamContext = {};
  let completedStageCount = 0;
  let upstreamOutputHash = stableJsonHash({
    sourceDocumentHash: checkpointStore?.hashes?.sourceDocumentHash || null,
    sourceManifestHash: checkpointStore?.hashes?.sourceManifestHash || null
  });
  let schemaRetryCount = 0;

  const emitStageProgress = (stageId, stageSequence, status, extra = {}) => {
    input.onStageProgress?.({
      stageId,
      stageSequence,
      completedStageCount,
      totalStageCount: 10,
      status,
      ...extra
    });
  };

  const run = async (
    stageName,
    prompt,
    validator,
    repairReferenceContext = {},
    structuredStageOptions = {}
  ) => {
    if (input.abortSignal?.aborted) throw new DOMException('用户主动取消', 'AbortError');
    assertPipelineBudget(pipelineStartedAtMs, pipelineBudgetMs);
    const profile = stageProfile(stageName, input.stageProfiles);
    const stageStart = stageStartedAt.get(stageName) || Date.now();
    stageStartedAt.set(stageName, stageStart);
    const remainingStageMs = profile.stageBudgetMs - (Date.now() - stageStart);
    if (remainingStageMs <= 0) {
      throw new BrandDnaTimeoutError('STAGE_TIMEOUT', stageName, `${stageName} 已超过阶段时间预算。`);
    }
    const result = await runStructuredStage(
      input.reasoner,
      prompt,
      validator,
      input.abortSignal,
      trace,
      stageName,
      {
        stageProfiles: input.stageProfiles,
        structuredOutputMode: input.structuredOutputMode,
        jsonSchema: stageName === 'gpt-image-task-compiler'
          ? GPT_IMAGE_TASK_V2_JSON_SCHEMA
          : undefined,
        upstreamContext: structuredUpstreamContext,
        repairReferenceContext,
        allowStructuredPatchRepair: structuredStageOptions.allowStructuredPatchRepair,
        remainingStageMs,
        remainingPipelineMs: remainingPipelineBudget(pipelineStartedAtMs, pipelineBudgetMs)
      }
    );
    schemaRetryCount += result.retryCount;
    normalizationWarnings.push(...result.warnings);
    stageUsageRecordIds.push(...result.usageRecordIds);
    trace.push({
      stage: stageName,
      runId: result.response.runId,
      provider: result.response.provider,
      model: result.response.model,
      finishReason: result.response.finishReason || 'unknown',
      usageCallId: result.response.usageCallId || null
    });
    return result.value;
  };

  const checkpointed = async ({
    stageId,
    stageSequence,
    validator,
    execute,
    schemaVersion = BRAND_DNA_PROTOCOL.brandDnaSchemaVersion
  }) => {
    const promptVersion = `${BRAND_DNA_PROTOCOL.promptVersion}:${stageId}`;
    emitStageProgress(stageId, stageSequence, 'running', {
      currentStageStartedAt: new Date().toISOString()
    });

    if (reuseCheckpoints) {
      const reused = await checkpointStore.loadStage({
        stageId,
        stageSequence,
        upstreamOutputHash,
        promptVersion,
        schemaVersion,
        validator
      });
      if (reused) {
        completedStageCount += 1;
        completedStageIds.push(stageId);
        reusableCheckpointIds.push(stageId);
        trace.push({ stage: stageId, checkpointStatus: 'reused' });
        upstreamOutputHash = stableJsonHash({
          upstreamOutputHash,
          stageId,
          value: reused.output
        });
        emitStageProgress(stageId, stageSequence, 'reused', {
          completedStageCount,
          reusableCheckpointIds: [...reusableCheckpointIds]
        });
        return reused.value;
      }
    }

    const callStartIndex = stageUsageRecordIds.length;
    const warningStartIndex = normalizationWarnings.length;
    const startedAt = new Date().toISOString();
    const value = await execute();
    const validated = validator(value);
    const completedAt = new Date().toISOString();
    if (checkpointStore) {
      await checkpointStore.saveStage({
        stageId,
        stageSequence,
        upstreamOutputHash,
        promptVersion,
        schemaVersion,
        stageProfile: stageProfile(stageId, input.stageProfiles),
        output: validated,
        normalizationWarnings: normalizationWarnings.slice(warningStartIndex),
        usageRecordIds: stageUsageRecordIds.slice(callStartIndex),
        startedAt,
        completedAt
      });
      trace.push({
        stage: stageId,
        checkpointStatus: 'saved',
        normalizationWarningCount: normalizationWarnings.length - warningStartIndex
      });
    }
    completedStageCount += 1;
    completedStageIds.push(stageId);
    upstreamOutputHash = stableJsonHash({ upstreamOutputHash, stageId, value: validated });
    emitStageProgress(stageId, stageSequence, 'completed', { completedStageCount });
    return validated;
  };

  input.onProtocolProgress?.('extracting-project-facts', '正在分段提取原子证据');
  let atomicEvidence = await checkpointed({
    stageId: 'atomic-evidence',
    stageSequence: 1,
    validator(value) {
      validateEvidence({ atomicEvidence: value }, chunks);
      return value;
    },
    async execute() {
      const collected = [];
      const batches = partition(chunks, 20, 50_000);
      const extractedBatches = await mapWithConcurrency(
        batches,
        Number.isInteger(input.evidenceConcurrency) ? input.evidenceConcurrency : 2,
        (batch) => run(
          'atomic-evidence',
          buildEvidenceExtractionPrompt(batch),
          (output) => validateEvidence(output, batch)
        )
      );
      for (const extracted of extractedBatches) {
        collected.push(...canonicalizeEvidence(extracted, collected.length));
      }
      return collected;
    }
  });
  const evidenceIds = new Set(atomicEvidence.map((item) => item.id));
  const approvedEvidence = atomicEvidence.map((item) => ({
    id: item.id,
    claim: item.claim,
    category: item.category,
    status: item.status
  }));

  let normalizedFacts = await checkpointed({
    stageId: 'normalized-facts',
    stageSequence: 2,
    validator(value) {
      validateFacts({ normalizedFacts: value }, evidenceIds);
      return value;
    },
    async execute() {
      let collected = [];
      const evidenceBatches = partition(atomicEvidence, 80, 70_000);
      for (const batch of evidenceBatches) {
        collected.push(...await run(
          'normalized-facts',
          buildFactNormalizationPrompt(batch),
          (output) => validateFacts(output, evidenceIds),
          { approvedEvidence }
        ));
      }
      if (evidenceBatches.length > 1) {
        collected = await run(
          'fact-reconciliation',
          buildFactReconciliationPrompt(collected),
          (output) => validateFacts(output, evidenceIds),
          { approvedEvidence }
        );
      }
      return canonicalizeFacts(collected);
    }
  });

  input.onProtocolProgress?.('building-brand-dna', '正在重建品牌战略模型');
  const strategicModel = await checkpointed({
    stageId: 'strategic-model',
    stageSequence: 3,
    validator(value) {
      return validateStrategicModel({ strategicModel: value }, evidenceIds);
    },
    execute: () => run(
      'strategic-model',
      buildStrategicModelPrompt(normalizedFacts, atomicEvidence, DEFAULT_INDUSTRY_RULES),
      (output) => validateStrategicModel(output, evidenceIds),
      { approvedEvidence }
    )
  });
  input.onProtocolProgress?.('diagnosing-strategy', '正在执行批判性战略诊断');
  const strategicIssues = await checkpointed({
    stageId: 'strategic-critic',
    stageSequence: 4,
    validator(value) {
      return validateIssues({ strategicIssues: value }, evidenceIds);
    },
    execute: () => run(
      'strategic-critic',
      buildStrategicCriticPrompt(strategicModel, normalizedFacts, DEFAULT_INDUSTRY_RULES),
      (output) => validateIssues(output, evidenceIds),
      { approvedEvidence }
    )
  });

  input.onProtocolProgress?.('building-brand-dna', '正在合成七类品牌 DNA');
  let brandDna = await checkpointed({
    stageId: 'dna-synthesis',
    stageSequence: 5,
    validator(value) {
      return validateDnaStage({ brandDna: value });
    },
    execute: () => run(
      'dna-synthesis',
      buildDnaSynthesisPrompt({ atomicEvidence, normalizedFacts, strategicModel, strategicIssues }),
      validateDnaStage
    )
  });
  let geneIds = new Set(brandDna.genes.map((gene) => gene.id));
  if (geneIds.has('') || geneIds.size !== brandDna.genes.length) throw new BrandDnaSchemaError('dna-synthesis', new Error('DNA 基因 ID 缺失或重复'));

  input.onProtocolProgress?.('translating-creative-direction', '正在比较候选并选择唯一创意命题');
  let creativeThesisDecision = await checkpointed({
    stageId: 'creative-thesis-decision',
    stageSequence: 6,
    validator(value) {
      return validateThesis({ creativeThesisDecision: value }, geneIds);
    },
    execute: () => run(
      'creative-thesis-decision',
      buildCreativeThesisPrompt(brandDna, strategicIssues),
      (output) => validateThesis(output, geneIds)
    )
  });
  const visual = await checkpointed({
    stageId: 'visual-causal-translation',
    stageSequence: 7,
    validator(value) {
      return validateVisual({
        visualTranslation: value.translation,
        imageSystem: value.system
      }, geneIds);
    },
    execute: () => run(
      'visual-causal-translation',
      buildVisualTranslationPrompt(brandDna, creativeThesisDecision),
      (output) => validateVisual(output, geneIds)
    )
  });
  let visualTranslation = visual.translation;
  let imageSystem = visual.system;

  input.onProtocolProgress?.('planning-generation-tasks', '正在编译 GPT Image Task Standard');
  structuredUpstreamContext = { imageSystem };
  let imageTasks = await checkpointed({
    stageId: 'gpt-image-task-compiler',
    stageSequence: 8,
    schemaVersion: BRAND_DNA_PROTOCOL.imageTaskSchemaVersion,
    validator(value) {
      return validateTasks({ imageTasks: value }, imageSystem, geneIds);
    },
    execute: () => run(
      'gpt-image-task-compiler',
      buildImageTaskPrompt(imageCompilerContext({
        brandDna,
        creativeThesisDecision,
        visualTranslation,
        imageSystem
      }), DEFAULT_INDUSTRY_RULES),
      (output) => validateTasks(output, imageSystem, geneIds)
    )
  });

  let packageToAudit = assemblePackage(
    { brandDna, creativeThesisDecision, visualTranslation, imageSystem, imageTasks },
    atomicEvidence,
    chunks
  );
  input.onProtocolProgress?.('validating-output', '正在执行独立质量审计与评分');
  let qualityAudit = await checkpointed({
    stageId: 'quality-auditor',
    stageSequence: 9,
    validator(value) {
      return validateAudit({ qualityAudit: value });
    },
    execute: () => run('quality-auditor', buildAuditPrompt(packageToAudit), validateAudit)
  });
  qualityAudit = applyQualityGate(qualityAudit, validateImageTaskStandard(imageSystem, imageTasks));
  let qualityRepairCount = 0;

  if (!qualityAudit.passed) {
    qualityRepairCount = 1;
    const editablePackage = {
      brandDna,
      creativeThesisDecision,
      visualTranslation,
      imageSystem,
      imageTasks
    };
    const repaired = await run(
      'targeted-repair',
      buildTargetedRepairPrompt(editablePackage, qualityAudit),
      (patch) => {
        validateTargetedRepairPatch(patch, editablePackage);
        const output = applyTargetedRepairPatch(editablePackage, patch);
        validateDnaStage({ brandDna: output.brandDna });
        const repairedGeneIds = new Set(output.brandDna.genes?.map((gene) => gene.id));
        validateThesis({ creativeThesisDecision: output.creativeThesisDecision }, repairedGeneIds);
        const repairedVisual = validateVisual({
          visualTranslation: output.visualTranslation,
          imageSystem: output.imageSystem
        }, repairedGeneIds);
        validateTasks({ imageTasks: output.imageTasks }, output.imageSystem, repairedGeneIds);
        return {
          ...output,
          visualTranslation: repairedVisual.translation,
          imageSystem: repairedVisual.system
        };
      },
      {},
      { allowStructuredPatchRepair: false }
    );
    brandDna = repaired.brandDna;
    geneIds = new Set(brandDna.genes.map((gene) => gene.id));
    creativeThesisDecision = repaired.creativeThesisDecision;
    visualTranslation = repaired.visualTranslation;
    imageSystem = repaired.imageSystem;
    imageTasks = repaired.imageTasks;
    packageToAudit = assemblePackage(
      { brandDna, creativeThesisDecision, visualTranslation, imageSystem, imageTasks },
      atomicEvidence,
      chunks
    );
    qualityAudit = await run('quality-auditor-recheck', buildAuditPrompt(packageToAudit), validateAudit);
    qualityAudit = applyQualityGate(qualityAudit, validateImageTaskStandard(imageSystem, imageTasks));
  }

  if (!qualityAudit.passed) throw new BrandDnaQualityGateError(qualityAudit);
  return {
    ...packageToAudit,
    qualityAudit,
    qualityTier,
    deepBenchmarkPassed: qualityTier === 'benchmark',
    metadata: {
      ...BRAND_DNA_PROTOCOL,
      qualityTier,
      qualityScore: qualityAudit.totalScore,
      provider: trace.find((entry) => entry.provider)?.provider || null,
      modelId: [...trace].reverse().find((entry) => entry.model)?.model || null,
      thinkingMode: 'stage-profiled',
      structuredOutputMode: input.structuredOutputMode || 'json-object',
      generatedAt: new Date().toISOString()
    },
    intermediates: {
      atomicEvidence,
      normalizedFacts,
      strategicModel,
      strategicIssues,
      creativeThesisDecision,
      visualTranslation,
      imageSystem,
      imageTasks,
      qualityAudit,
      trace
    },
    schemaRetryCount,
    qualityRepairCount,
    normalizationWarnings,
    completedStageIds,
    reusableCheckpointIds,
    checkpointUpstreamOutputHash: upstreamOutputHash,
    provider: trace.find((entry) => entry.provider)?.provider,
    modelId: [...trace].reverse().find((entry) => entry.model)?.model
  };
}
