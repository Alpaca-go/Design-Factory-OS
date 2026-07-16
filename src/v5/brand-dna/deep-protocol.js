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

export class BrandDnaQualityGateError extends Error {
  constructor(audit) {
    super(`品牌 DNA 质量闸门未通过：${(audit.hardFailures || []).join('；') || `总分 ${audit.totalScore}`}`);
    this.name = 'BrandDnaQualityGateError';
    this.code = 'FAILED_QUALITY_GATE';
    this.audit = audit;
  }
}

export class BrandDnaSchemaError extends Error {
  constructor(stage, error) {
    super(`${stage} 结构化输出校验失败：${error.message}`);
    this.name = 'BrandDnaSchemaError';
    this.code = 'FAILED_SCHEMA';
    this.stage = stage;
    this.cause = error;
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
  if (!Array.isArray(value) || value.length < minimum) throw new Error(`${label} 必须至少包含 ${minimum} 项`);
  return value;
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空`);
  return value.trim();
}

function uniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    const id = assertString(item?.id, `${label}.id`);
    if (ids.has(id)) throw new Error(`${label} 包含重复 ID：${id}`);
    ids.add(id);
  }
  return ids;
}

function validateEvidence(output, chunks) {
  const items = assertArray(output?.atomicEvidence, 'atomicEvidence', 1);
  uniqueIds(items, 'atomicEvidence');
  const chunkIds = new Set(chunks.map((chunk) => chunk.chunkId));
  for (const item of items) {
    assertString(item.claim, 'atomicEvidence.claim');
    const refs = assertArray(item.sourceRefs, 'atomicEvidence.sourceRefs', 1);
    if (refs.some((ref) => !chunkIds.has(ref.chunkId))) throw new Error('atomicEvidence 引用了不存在的 chunkId');
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
  for (const item of items) {
    assertString(item.statement, 'normalizedFacts.statement');
    const refs = assertArray(item.evidenceIds, 'normalizedFacts.evidenceIds', item.status === 'missing' ? 0 : 1);
    if (refs.some((id) => !evidenceIds.has(id))) throw new Error('normalizedFacts 引用了不存在的 evidenceId');
    assertString(item.reasoningSummary, 'normalizedFacts.reasoningSummary');
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
  const verify = (item) => {
    if (!item || typeof item !== 'object') return;
    const ids = Array.isArray(item.evidenceIds) ? item.evidenceIds : [];
    if (item.status !== 'missing' && (!ids.length || ids.some((id) => !evidenceIds.has(id)))) {
      throw new Error('strategicModel 包含无效 evidenceIds');
    }
  };
  Object.values(value).forEach((item) => Array.isArray(item) ? item.forEach(verify) : verify(item));
  return value;
}

function validateIssues(output, evidenceIds) {
  const items = assertArray(output?.strategicIssues, 'strategicIssues', 1);
  uniqueIds(items, 'strategicIssues');
  for (const item of items) {
    assertString(item.issue, 'strategicIssues.issue');
    assertString(item.consequence, 'strategicIssues.consequence');
    assertString(item.recommendation, 'strategicIssues.recommendation');
    if (item.recommendationStatus !== 'suggested') throw new Error('战略诊断建议必须标记为 suggested');
    if ((item.evidenceIds || []).some((id) => !evidenceIds.has(id))) throw new Error('strategicIssues 包含无效 evidenceIds');
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
  const basis = assertArray(value.selected?.dnaBasis, 'creativeThesisDecision.selected.dnaBasis', 1);
  if (basis.some((id) => !geneIds.has(id))) throw new Error('创意命题引用了不存在的 DNA 基因');
  assertArray(value.rejectedCandidateSummaries, 'creativeThesisDecision.rejectedCandidateSummaries', 2);
  if (!Number.isFinite(value.decisionScore)) throw new Error('creativeThesisDecision.decisionScore 缺失');
  return value;
}

function validateVisual(output, geneIds) {
  const translation = output?.visualTranslation;
  const system = output?.imageSystem;
  if (!translation?.creativeTranslation || !Array.isArray(translation.mappings)) throw new Error('visualTranslation 缺失');
  assertArray(translation.mappings, 'visualTranslation.mappings', 5);
  if (translation.mappings.some((mapping) => !geneIds.has(mapping.dnaGeneId))) {
    throw new Error('visualTranslation 引用了不存在的 DNA 基因');
  }
  if (!system || typeof system !== 'object') throw new Error('imageSystem 缺失');
  return { translation, system };
}

function validateTasks(output, imageSystem, geneIds) {
  const tasks = assertArray(output?.imageTasks, 'imageTasks', 4);
  if (tasks.length > 8) throw new Error('imageTasks 不得超过 8 项');
  uniqueIds(tasks, 'imageTasks');
  if (tasks[0]?.role !== 'anchor-image') throw new Error('第一张图片任务必须是 anchor-image');
  for (const [index, task] of tasks.entries()) {
    for (const key of [
      'objective', 'viewerTakeaway', 'subject', 'environment', 'composition',
      'focalHierarchy', 'colorDirection', 'materialAndTexture', 'lighting',
      'textPolicy', 'logoPolicy', 'aspectRatio', 'finalPrompt'
    ]) assertString(task[key], `imageTasks[${index}].${key}`);
    if (task.systemId !== imageSystem.systemId) throw new Error('图片任务没有引用统一的 systemId');
    const basis = assertArray(task.brandDnaBasis, `imageTasks[${index}].brandDnaBasis`, 1);
    if (basis.some((id) => !geneIds.has(id))) throw new Error('图片任务引用了不存在的 DNA 基因');
    assertArray(task.prohibitedElements, `imageTasks[${index}].prohibitedElements`, 1);
    assertArray(task.consistencyWithPreviousTasks, `imageTasks[${index}].consistencyWithPreviousTasks`, 1);
  }
  return tasks;
}

function validateAudit(output) {
  const audit = output?.qualityAudit;
  if (!audit || typeof audit !== 'object') throw new Error('qualityAudit 缺失');
  if (!Number.isFinite(audit.totalScore)) throw new Error('qualityAudit.totalScore 缺失');
  if (!audit.dimensionScores || typeof audit.dimensionScores !== 'object') throw new Error('qualityAudit.dimensionScores 缺失');
  for (const key of ['evidence', 'strategy', 'imageExecution']) {
    if (!Number.isFinite(audit.dimensionScores[key])) throw new Error(`qualityAudit.dimensionScores.${key} 缺失`);
  }
  audit.hardFailures = Array.isArray(audit.hardFailures) ? audit.hardFailures.map(String) : [];
  audit.repairInstructions = Array.isArray(audit.repairInstructions) ? audit.repairInstructions.map(String) : [];
  return audit;
}

function stageRepairMessages(prompt, invalidOutput, error) {
  return [
    prompt[0],
    {
      role: 'user',
      content: `${prompt[1].content}

上一次输出未通过本阶段 Schema 校验：${error.message}
无效输出：${String(invalidOutput).slice(0, 40_000)}

请只返回修复后的完整 JSON。`
    }
  ];
}

async function runStructuredStage(reasoner, prompt, validator, signal, trace, stageName) {
  let response = await reasoner(prompt, { signal });
  try {
    const parsed = parseBrandDnaResponse(response.text);
    return { value: validator(parsed), response, retryCount: 0 };
  } catch (firstError) {
    try {
      response = await reasoner(stageRepairMessages(prompt, response.text, firstError), { signal });
      const parsed = parseBrandDnaResponse(response.text);
      const value = validator(parsed);
      trace.push({ stage: stageName, schemaRepair: true, runId: response.runId });
      return { value, response, retryCount: 1 };
    } catch (secondError) {
      throw new BrandDnaSchemaError(stageName, secondError);
    }
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
  for (const task of imageTasks) {
    if (!task.subject) failures.push(`${task.id} 无法判断图片主体`);
    if (!task.composition || !task.lighting) failures.push(`${task.id} 无法判断构图和光线`);
    if (!task.logoPolicy || !task.textPolicy) failures.push(`${task.id} 缺少 Logo 或文字政策`);
    if (!task.consistencyWithPreviousTasks?.length) failures.push(`${task.id} 未说明与全局视觉锚点的一致性`);
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
    && Number(dimensions.evidence) >= BRAND_DNA_QUALITY_GATE.minEvidenceScore
    && Number(dimensions.strategy) >= BRAND_DNA_QUALITY_GATE.minStrategyScore
    && Number(dimensions.imageExecution) >= BRAND_DNA_QUALITY_GATE.minImageExecutionScore
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
  let schemaRetryCount = 0;
  const run = async (stageName, prompt, validator) => {
    if (input.abortSignal?.aborted) throw new DOMException('用户主动取消', 'AbortError');
    const result = await runStructuredStage(input.reasoner, prompt, validator, input.abortSignal, trace, stageName);
    schemaRetryCount += result.retryCount;
    trace.push({
      stage: stageName,
      runId: result.response.runId,
      provider: result.response.provider,
      model: result.response.model
    });
    return result.value;
  };

  input.onProtocolProgress?.('extracting-project-facts', '正在分段提取原子证据');
  let atomicEvidence = [];
  for (const batch of partition(chunks, 20, 50_000)) {
    const extracted = await run(
      'atomic-evidence',
      buildEvidenceExtractionPrompt(batch),
      (output) => validateEvidence(output, batch)
    );
    atomicEvidence.push(...canonicalizeEvidence(extracted, atomicEvidence.length));
  }
  const evidenceIds = new Set(atomicEvidence.map((item) => item.id));

  let normalizedFacts = [];
  const evidenceBatches = partition(atomicEvidence, 80, 70_000);
  for (const batch of evidenceBatches) {
    normalizedFacts.push(...await run(
      'normalized-facts',
      buildFactNormalizationPrompt(batch),
      (output) => validateFacts(output, evidenceIds)
    ));
  }
  if (evidenceBatches.length > 1) {
    normalizedFacts = await run(
      'fact-reconciliation',
      buildFactReconciliationPrompt(normalizedFacts),
      (output) => validateFacts(output, evidenceIds)
    );
  }
  normalizedFacts = canonicalizeFacts(normalizedFacts);

  input.onProtocolProgress?.('building-brand-dna', '正在重建品牌战略模型');
  const strategicModel = await run(
    'strategic-model',
    buildStrategicModelPrompt(normalizedFacts, atomicEvidence, DEFAULT_INDUSTRY_RULES),
    (output) => validateStrategicModel(output, evidenceIds)
  );
  input.onProtocolProgress?.('diagnosing-strategy', '正在执行批判性战略诊断');
  const strategicIssues = await run(
    'strategic-critic',
    buildStrategicCriticPrompt(strategicModel, normalizedFacts, DEFAULT_INDUSTRY_RULES),
    (output) => validateIssues(output, evidenceIds)
  );

  input.onProtocolProgress?.('building-brand-dna', '正在合成七类品牌 DNA');
  let brandDna = await run(
    'dna-synthesis',
    buildDnaSynthesisPrompt({ atomicEvidence, normalizedFacts, strategicModel, strategicIssues }),
    validateDnaStage
  );
  let geneIds = new Set(brandDna.genes.map((gene) => gene.id));
  if (geneIds.has('') || geneIds.size !== brandDna.genes.length) throw new BrandDnaSchemaError('dna-synthesis', new Error('DNA 基因 ID 缺失或重复'));

  input.onProtocolProgress?.('translating-creative-direction', '正在比较候选并选择唯一创意命题');
  let creativeThesisDecision = await run(
    'creative-thesis-decision',
    buildCreativeThesisPrompt(brandDna, strategicIssues),
    (output) => validateThesis(output, geneIds)
  );
  const visual = await run(
    'visual-causal-translation',
    buildVisualTranslationPrompt(brandDna, creativeThesisDecision),
    (output) => validateVisual(output, geneIds)
  );
  let visualTranslation = visual.translation;
  let imageSystem = visual.system;

  input.onProtocolProgress?.('planning-generation-tasks', '正在编译 GPT Image Task Standard');
  let imageTasks = await run(
    'gpt-image-task-compiler',
    buildImageTaskPrompt({ brandDna, creativeThesisDecision, visualTranslation, imageSystem }, DEFAULT_INDUSTRY_RULES),
    (output) => validateTasks(output, imageSystem, geneIds)
  );

  let packageToAudit = assemblePackage(
    { brandDna, creativeThesisDecision, visualTranslation, imageSystem, imageTasks },
    atomicEvidence,
    chunks
  );
  input.onProtocolProgress?.('validating-output', '正在执行独立质量审计与评分');
  let qualityAudit = await run('quality-auditor', buildAuditPrompt(packageToAudit), validateAudit);
  qualityAudit = applyQualityGate(qualityAudit, validateImageTaskStandard(imageSystem, imageTasks));
  let qualityRepairCount = 0;

  if (!qualityAudit.passed) {
    qualityRepairCount = 1;
    const repaired = await run(
      'targeted-repair',
      buildTargetedRepairPrompt(packageToAudit, qualityAudit),
      (output) => {
        if (!output?.brandDna || !output?.creativeThesisDecision || !output?.visualTranslation || !output?.imageSystem) {
          throw new Error('定向修复输出不完整');
        }
        const repairedGeneIds = new Set(output.brandDna.genes?.map((gene) => gene.id));
        validateThesis({ creativeThesisDecision: output.creativeThesisDecision }, repairedGeneIds);
        validateVisual({
          visualTranslation: output.visualTranslation,
          imageSystem: output.imageSystem
        }, repairedGeneIds);
        validateTasks({ imageTasks: output.imageTasks }, output.imageSystem, repairedGeneIds);
        return output;
      }
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
      generatedAt: new Date().toISOString()
    },
    intermediates: {
      chunks,
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
    provider: trace.find((entry) => entry.provider)?.provider,
    modelId: [...trace].reverse().find((entry) => entry.model)?.model
  };
}
