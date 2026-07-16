import { normalizeEvidenceQuote, shortEvidenceQuote } from './normalize-evidence-quote.js';
import {
  createSourceDocumentRegistry,
  sanitizeProjectIdentity,
  sourceDisplayNames
} from './source-document-registry.js';
import { cleanText, uniqueText } from './markdown-sanitizer.js';
import { runContentQualityPass } from './content-quality-pass.js';
import { BRAND_DNA_PROTOCOL } from '../protocol-config.js';

const STATUS_LABELS = Object.freeze({
  confirmed: '已确认',
  inferred: '合理推断',
  suggested: '建议',
  conflicting: '内容冲突',
  missing: '信息缺失'
});
const CONFIDENCE_LABELS = Object.freeze({ high: '高', medium: '中', low: '低' });
const GENE_ORDER = ['functional', 'capability', 'relational', 'emotional', 'cultural', 'behavioral', 'aesthetic'];
const GENE_LABELS = Object.freeze({
  functional: '功能基因',
  capability: '能力基因',
  relational: '关系基因',
  emotional: '情绪基因',
  cultural: '文化基因',
  behavioral: '行为基因',
  aesthetic: '审美基因'
});
const ROLE_LABELS = Object.freeze({
  'anchor-image': '视觉锚点图',
  'brand-poster': '品牌主题图',
  'product-or-service-scene': '服务场景图',
  'packaging-concept': '包装概念图',
  'visual-system': '视觉系统图',
  'application-scene': '应用场景图',
  'detail-craft': '细节与工艺图',
  custom: '自定义任务'
});

function fact(label, value) {
  if (!value || typeof value !== 'object') return null;
  return {
    label,
    value: cleanText(value.value, '待确认'),
    status: value.status || 'missing',
    statusLabel: STATUS_LABELS[value.status] || STATUS_LABELS.missing,
    confidence: value.confidence || 'low',
    confidenceLabel: CONFIDENCE_LABELS[value.confidence] || CONFIDENCE_LABELS.low,
    evidenceIds: uniqueText(value.evidenceIds || []),
    references: Array.isArray(value.evidence) ? value.evidence : [],
    note: cleanText(value.note)
  };
}

function allFactItems(dna) {
  return [
    fact('项目名称', dna.projectName),
    fact('品牌名称', dna.brandName),
    fact('行业 / 品类', dna.category),
    fact('实际业务结构', dna.businessModel),
    fact('发展阶段', dna.developmentStage),
    fact('品牌使命 / 目的', dna.strategy?.purpose),
    fact('品牌对外定位', dna.strategy?.positioning),
    fact('品牌承诺', dna.strategy?.brandPromise),
    fact('品牌关系角色', dna.personality?.relationshipRole),
    ...(dna.audience?.primary || []).map((item) => fact('主要人群', item)),
    ...(dna.audience?.secondary || []).map((item) => fact('次要人群', item)),
    ...(dna.audience?.needs || []).map((item) => fact('人群需求', item)),
    ...(dna.audience?.barriers || []).map((item) => fact('人群阻力', item)),
    ...(dna.audience?.usageScenarios || []).map((item) => fact('使用场景', item)),
    ...(dna.strategy?.valueProposition || []).map((item) => fact('价值主张', item)),
    ...(dna.strategy?.differentiators || []).map((item) => fact('差异化依据', item)),
    ...(dna.strategy?.brandValues || []).map((item) => fact('品牌价值观', item)),
    ...(dna.personality?.traits || []).map((item) => fact('人格特征', item)),
    ...(dna.personality?.toneOfVoice || []).map((item) => fact('表达语气', item)),
    ...(dna.personality?.emotionalOutcome || []).map((item) => fact('情绪结果', item))
  ].filter(Boolean);
}

function evidenceModel(facts, sourceDocuments) {
  const references = facts.flatMap((item) => item.references);
  const sources = createSourceDocumentRegistry(sourceDocuments, references);
  const evidenceMap = new Map();
  for (const item of facts) {
    for (const [index, evidenceId] of item.evidenceIds.entries()) {
      const entry = evidenceMap.get(evidenceId) || {
        evidenceId,
        topic: item.label,
        claim: item.value,
        references: []
      };
      const related = item.references.length === item.evidenceIds.length
        ? [item.references[index]]
        : item.references;
      entry.references.push(...related.filter(Boolean));
      evidenceMap.set(evidenceId, entry);
    }
  }
  const ordered = [...evidenceMap.values()].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId, 'zh-CN', { numeric: true })
  );
  const displayIds = new Map(ordered.map((entry, index) => [entry.evidenceId, `E${String(index + 1).padStart(2, '0')}`]));
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const index = ordered.map((entry) => {
    const dedupedRefs = entry.references.filter((reference, index, all) =>
      index === all.findIndex((candidate) =>
        candidate.documentId === reference.documentId
        && normalizeEvidenceQuote(candidate.excerpt) === normalizeEvidenceQuote(reference.excerpt)
      )
    );
    return {
      id: displayIds.get(entry.evidenceId),
      internalId: entry.evidenceId,
      topic: entry.topic,
      claim: entry.claim,
      sourceNames: sourceDisplayNames(sources, dedupedRefs.map((reference) => reference.documentId)),
      references: dedupedRefs.map((reference) => ({
        sourceName: sourceById.get(reference.documentId)?.displayName || '来源文档',
        location: cleanText(reference.section) || (reference.page ? `第 ${reference.page} 页` : '位置未标注'),
        shortQuote: shortEvidenceQuote(reference.excerpt),
        quote: normalizeEvidenceQuote(reference.excerpt)
      }))
    };
  });
  return { sources, index, displayIds };
}

function withEvidence(facts, evidence) {
  const evidenceByInternalId = new Map(
    evidence.index.map((item) => [item.internalId, item])
  );
  const quotedEvidenceIds = new Set();
  return facts.map((item) => {
    const quoteIds = item.evidenceIds.filter((id) => !quotedEvidenceIds.has(id));
    quoteIds.forEach((id) => quotedEvidenceIds.add(id));
    return {
      ...item,
      evidenceLabels: item.evidenceIds.map((id) => evidence.displayIds.get(id)).filter(Boolean),
      sourceNames: sourceDisplayNames(
        evidence.sources,
        item.references.map((reference) => reference.documentId)
      ),
      shortQuotes: uniqueText(quoteIds.flatMap((id) =>
        (evidenceByInternalId.get(id)?.references || []).map((reference) => reference.shortQuote)
      )).slice(0, 1)
    };
  });
}

function geneItems(dna) {
  const genes = [...(dna.genes || [])].sort((left, right) => {
    const a = GENE_ORDER.indexOf(String(left.type).toLowerCase());
    const b = GENE_ORDER.indexOf(String(right.type).toLowerCase());
    return (a < 0 ? 99 : a) - (b < 0 ? 99 : b);
  });
  return genes.map((gene, index) => {
    const type = String(gene.type || '').toLowerCase();
    return {
      ...gene,
      id: `G${String(index + 1).padStart(2, '0')}`,
      sourceId: gene.id || null,
      type,
      typeLabel: GENE_LABELS[type] || '其他基因',
      statement: cleanText(gene.statement),
      confidenceLabel: CONFIDENCE_LABELS[gene.confidence] || '低',
      culturalMaturity: type === 'cultural'
        ? ({
            embedded: '已内化并被行为证明',
            declared: '已明确声明',
            aspirational: '仍处于愿景阶段'
          })[gene.culturalMaturity] || '待评估'
        : null
    };
  });
}

function boundaryModel(dna, imageSystem, facts) {
  const boundary = imageSystem?.generationBoundary || {};
  const lockedAssets = uniqueText(boundary.lockedAssets || imageSystem?.knownAssets || []).filter((item) =>
    !/未提供|暂无|没有/i.test(item)
  );
  const prohibitedElements = uniqueText([
    ...(boundary.prohibitedElements || []),
    ...(imageSystem?.globalProhibitions || []),
    ...(dna.creativeTranslation?.avoidDirections || []),
    ...(dna.boundaries?.prohibitedStyles || []).map((item) => item.value),
    ...(!lockedAssets.length ? [
      '未提供已批准 Logo，禁止模型自行设计、重绘、仿造或冒用 Logo。',
      '未提供认证图形时，只能表现标准化管理概念，不得生成、仿制或冒用认证标识。'
    ] : [])
  ]);
  return {
    lockedFacts: uniqueText(boundary.lockedFacts || imageSystem?.lockedFacts || []),
    lockedAssets,
    verifiedRequiredElements: uniqueText(boundary.verifiedRequiredElements || []),
    suggestedElements: uniqueText(boundary.suggestedElements || dna.creativeTranslation?.suggestedAssets || []),
    creativeFreedom: uniqueText(boundary.creativeFreedom || imageSystem?.creativeFreedom || []),
    prohibitedElements,
    prohibitedClaims: uniqueText([
      ...(boundary.prohibitedClaims || []),
      ...(dna.boundaries?.prohibitedClaims || []).map((item) => item.value)
    ]),
    pendingConfirmations: uniqueText([
      ...(boundary.pendingConfirmations || []),
      ...facts.filter((item) => ['missing', 'conflicting'].includes(item.status)).map((item) => `${item.label}：${item.value}`),
      ...(!lockedAssets.length ? ['是否存在已批准的 Logo、标准色、字体、图形或认证资产。'] : [])
    ]),
    textPolicy: cleanText(imageSystem?.textPolicy, '文字由后期排版完成，不生成不可控正式品牌文字。'),
    logoPolicy: cleanText(imageSystem?.logoPolicy, lockedAssets.length
      ? '仅可原样使用已批准 Logo。'
      : '未提供已批准 Logo，不得生成或仿造 Logo。')
  };
}

function taskModel(tasks = [], genes = []) {
  const geneIdMap = new Map(genes.map((gene) => [gene.sourceId || gene.id, gene.id]));
  return tasks.map((task, index) => ({
    ...task,
    brandDnaBasis: uniqueText(task.brandDnaBasis || []).map((id) => geneIdMap.get(id) || id),
    sequence: task.sequence || index + 1,
    roleLabel: ROLE_LABELS[task.role] || '图片任务',
    title: cleanText(task.title, ROLE_LABELS[task.role] || `图片任务 ${index + 1}`),
    coreMessage: cleanText(task.viewerTakeaway || task.objective, '待明确'),
    format: cleanText(task.visualFormat || ROLE_LABELS[task.role], '待明确'),
    difference: uniqueText(task.intentionalDifferenceFromPreviousTasks || []),
    finalPrompt: cleanText(task.finalPrompt || task.prompt)
  }));
}

function visualModel(dna, imageSystem, genes) {
  const candidates = dna.creativeTranslation?.distinctiveAssetCandidates || [];
  const suggestedAssets = uniqueText([
    ...candidates.map((item) => `${item.name}：${item.mechanism}`),
    ...(dna.creativeTranslation?.suggestedAssets || [])
  ]);
  const geneIds = genes.map((gene) => gene.id);
  return {
    personality: uniqueText(dna.creativeTranslation?.visualPersonality || []),
    keywords: uniqueText(dna.creativeTranslation?.visualKeywords || []),
    emotionalTemperature: uniqueText(dna.creativeTranslation?.emotionalTemperature || []),
    directions: {
      color: dna.creativeTranslation?.colorDirection || [],
      typography: dna.creativeTranslation?.typographyDirection || [],
      graphic: dna.creativeTranslation?.graphicDirection || [],
      composition: dna.creativeTranslation?.compositionDirection || [],
      photography: dna.creativeTranslation?.photographyDirection || [],
      illustration: dna.creativeTranslation?.illustrationDirection || [],
      material: dna.creativeTranslation?.materialDirection || [],
      lighting: dna.creativeTranslation?.lightingDirection || [],
      motion: dna.creativeTranslation?.motionDirection || []
    },
    mappings: (dna.creativeTranslation?.mappings || []).map((mapping) => {
      const sourceIndex = (dna.genes || []).findIndex((gene) => gene.id === mapping.dnaGeneId);
      return {
        ...mapping,
        dnaGeneId: sourceIndex >= 0 ? geneIds[sourceIndex] : mapping.dnaGeneId
      };
    }),
    anchorVisual: cleanText(imageSystem?.anchorVisual),
    compositionSystem: cleanText(imageSystem?.compositionSystem),
    colorSystem: imageSystem?.colorSystem || [],
    materialSystem: uniqueText(imageSystem?.materialSystem || []),
    lightingSystem: cleanText(imageSystem?.lightingSystem),
    imageLanguage: cleanText(imageSystem?.imageLanguage),
    consistencyRules: uniqueText(imageSystem?.consistencyRules || []),
    distinctiveAssets: suggestedAssets
  };
}

function auditModel(qualityAudit, findings, pendingCount) {
  const hard = findings.filter((item) => item.severity === 'hard');
  const major = findings.filter((item) => item.severity === 'major');
  const reported = Number(qualityAudit?.totalScore) || 0;
  const score = Math.min(reported, hard.length || major.length ? 89 : 100);
  return {
    passed: Boolean(qualityAudit?.passed) && hard.length === 0,
    reportedScore: reported,
    score,
    dimensionScores: qualityAudit?.dimensionScores || {},
    hardFailures: uniqueText([...(qualityAudit?.hardFailures || []), ...hard.map((item) => item.message)]),
    deductions: uniqueText([...major.map((item) => item.message), ...(qualityAudit?.repairInstructions || [])]),
    pendingCount,
    findings
  };
}

export function buildBrandDnaReportViewModel(dna, options = {}) {
  const rawFacts = allFactItems(dna);
  const evidence = evidenceModel(rawFacts, options.sourceDocuments || []);
  let facts = withEvidence(rawFacts, evidence);
  const brandName = sanitizeProjectIdentity(
    dna.brandName?.status === 'missing' ? '' : dna.brandName?.value,
    sanitizeProjectIdentity(dna.projectName?.value)
  );
  const projectName = sanitizeProjectIdentity(dna.projectName?.value, brandName);
  const identity = {
    projectName,
    brandName,
    analysisTaskName: projectName === cleanText(dna.projectName?.value) ? null : cleanText(dna.projectName?.value),
    sourceFileTitles: evidence.sources.map((source) => source.displayName),
    confidence: dna.brandName?.confidence || dna.projectName?.confidence || 'low'
  };
  facts = facts.map((item) => item.label === '项目名称'
    ? { ...item, value: identity.projectName }
    : item);
  const genes = geneItems(dna);
  const imageSystem = options.imageSystem || dna.imageSystem || {};
  const boundaries = boundaryModel(dna, imageSystem, facts);
  const tasks = taskModel(options.imageTasks || dna.creativeTranslation?.generationPlan || [], genes);
  const visualSystem = visualModel(dna, imageSystem, genes);
  const findings = runContentQualityPass({
    identity,
    genes,
    creativeThesis: {
      statement: cleanText(dna.creativeTranslation?.creativeThesis, '待确认'),
      coverage: options.creativeThesisCoverage || null
    },
    visualSystem,
    boundaries,
    tasks,
    mappings: visualSystem.mappings
  });
  const priorityConfirmations = uniqueText([
    ...boundaries.pendingConfirmations,
    ...(dna.diagnosis?.missingInformation || [])
  ]).slice(0, 5);
  const confirmedFacts = uniqueText([
    identity.brandName,
    ...facts
      .filter((item) => item.status === 'confirmed' && !['项目名称', '品牌名称'].includes(item.label))
      .map((item) => item.value)
  ]).slice(0, 3);
  const keyJudgments = uniqueText([
    dna.strategy?.positioning?.value,
    dna.strategy?.brandPromise?.value,
    ...(dna.diagnosis?.strategicRisks || [])
  ]).slice(0, 3);
  const statusCounts = facts.reduce((counts, item) => ({
    ...counts,
    [item.status]: (counts[item.status] || 0) + 1
  }), {});
  return {
    version: 'brand-dna-report-v2',
    title: { brandName, reportName: '品牌 DNA 与创意转译报告' },
    executiveSummary: {
      confirmedFacts,
      keyJudgments,
      creativeThesis: cleanText(dna.creativeTranslation?.creativeThesis, '待确认'),
      priorityConfirmations
    },
    identity,
    statusCounts,
    facts,
    strategy: {
      positioning: facts.find((item) => item.label === '品牌对外定位'),
      businessReality: facts.find((item) => item.label === '实际业务结构'),
      purpose: facts.find((item) => item.label === '品牌使命 / 目的'),
      promise: facts.find((item) => item.label === '品牌承诺'),
      audience: facts.filter((item) => ['主要人群', '次要人群', '人群需求', '人群阻力', '使用场景'].includes(item.label))
    },
    genes,
    oneSentenceDna: cleanText(dna.oneSentenceDna, '待确认'),
    risks: {
      conflicts: uniqueText(dna.diagnosis?.conflicts || []),
      missing: uniqueText(dna.diagnosis?.missingInformation || []),
      generic: uniqueText(dna.diagnosis?.genericStatements || []),
      strategic: uniqueText(dna.diagnosis?.strategicRisks || [])
    },
    creativeThesis: {
      statement: cleanText(dna.creativeTranslation?.creativeThesis, '待确认'),
      coverage: options.creativeThesisCoverage || null
    },
    visualSystem,
    boundaries,
    taskOverview: tasks,
    taskDetails: tasks,
    evidenceIndex: evidence.index,
    evidenceQuotes: evidence.index.flatMap((entry) =>
      entry.references.map((reference) => ({ ...reference, evidenceId: entry.id, topic: entry.topic }))
    ),
    sources: evidence.sources,
    audit: auditModel(options.qualityAudit, findings, priorityConfirmations.length),
    metadata: {
      ...(options.metadata || {}),
      reportSchemaVersion: 'brand-dna-report-v2',
      contentProtocolVersion: BRAND_DNA_PROTOCOL.contentProtocolVersion
    }
  };
}
