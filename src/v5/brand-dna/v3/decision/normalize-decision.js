import { cleanProjectName, extractAnalysisTaskName } from '../preparation/prepare-document-set.js';

const GENE_ORDER = Object.freeze(['functional', 'capability', 'relational', 'emotional', 'cultural', 'behavioral', 'aesthetic']);
const GENE_IDS = Object.freeze(Object.fromEntries(GENE_ORDER.map((type, index) => [type, `G${String(index + 1).padStart(2, '0')}`])));
const GENE_TYPE_ALIASES = Object.freeze({ function: 'functional', 'functional-value': 'functional', ability: 'capability', competence: 'capability', relationship: 'relational', relation: 'relational', emotion: 'emotional', culture: 'cultural', behavior: 'behavioral', aesthetics: 'aesthetic', visual: 'aesthetic' });
const ABSOLUTE_RISK_TERMS = /将严重阻碍|一定导致|必然失去|将错失|直接抹平/g;
const RISK_STATUS_ALIASES = Object.freeze({ inferred: 'reasonable-inference', 'reasonable_inference': 'reasonable-inference', conflict: 'conflicting', unknown: 'missing', unverified: 'missing', pending: 'missing', recommendation: 'suggested' });
const RISK_SEVERITY_ALIASES = Object.freeze({ severe: 'critical', high: 'major', medium: 'major', moderate: 'major', low: 'minor', warning: 'minor' });
const CUSTOMER_RESULT_WORDS = /获得|降低|降本|提升|增效|改善|实现|减少|确保|解决|支持|体验/;
const BRAND_TASK_WORDS = /构建.{0,8}(?:网络|平台)|打造.{0,8}(?:生态|平台)|提升品牌影响力/;

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function canonicalEvidenceId(value, validEvidenceIds) {
  const raw = String(value || '').trim();
  if (validEvidenceIds.has(raw)) return raw;
  const match = /^evidence[-_ ]?(\d+)$/i.exec(raw);
  if (!match) return raw;
  const canonical = `evidence-${String(Number(match[1])).padStart(4, '0')}`;
  return validEvidenceIds.has(canonical) ? canonical : raw;
}

function insightItems(values, fallbackStatus, fallbackEvidenceIds, onEvidenceMissing) {
  return (values || []).map((value, index) => {
    const item = typeof value === 'string' ? { status: fallbackStatus, statement: value, evidenceIds: fallbackEvidenceIds } : value;
    const evidenceIds = unique(item?.evidenceIds);
    if (item?.status !== 'missing' && !evidenceIds.length) {
      onEvidenceMissing?.(index, item);
      return { ...item, status: 'missing', evidenceIds: [] };
    }
    return { ...item, evidenceIds };
  });
}

function legacyRisk(raw, index, defaults) {
  const value = typeof raw === 'string' ? { statement: raw } : raw || {};
  const legacyStatus = value.status;
  const statusBeforeAlias = defaults.status === 'conflicting'
    ? (legacyStatus === 'suggested' ? 'suggested' : 'conflicting')
    : defaults.status === 'missing'
      ? 'missing'
      : legacyStatus || defaults.status;
  const status = RISK_STATUS_ALIASES[statusBeforeAlias] || statusBeforeAlias;
  const rawSeverity = value.severity || defaults.severity;
  const severity = RISK_SEVERITY_ALIASES[rawSeverity] || rawSeverity;
  return {
    riskId: value.riskId || `risk-${index + 1}`,
    status,
    severity,
    topic: value.topic || defaults.topic,
    statement: value.statement,
    evidenceIds: unique(value.evidenceIds),
    recommendedAction: value.recommendedAction ?? null,
    _normalizedEnums: [statusBeforeAlias !== status ? `status:${statusBeforeAlias}→${status}` : null, rawSeverity !== severity ? `severity:${rawSeverity}→${severity}` : null].filter(Boolean)
  };
}

function geneStrength(gene) {
  const confidence = { high: 30, medium: 20, low: 10 }[gene.confidence] || 0;
  const differentiation = { high: 3, medium: 2, low: 1 }[gene.differentiationValue] || 0;
  return confidence + differentiation + unique(gene.evidenceIds).length;
}

export function normalizeBrandCreativeDecision(value, evidenceMap) {
  const decision = structuredClone(value?.brandCreativeDecision || value || {});
  const deterministicFixes = [...(decision.normalization?.deterministicFixes || [])];
  const warnings = [...(decision.normalization?.warnings || [])];
  const beforeProjectName = String(decision.identity?.projectName || '');
  const brandName = String(decision.identity?.brandName || '').trim();
  const detectedTaskName = decision.identity?.analysisTaskName || extractAnalysisTaskName(beforeProjectName);
  const cleanedProjectName = cleanProjectName(beforeProjectName, brandName || '品牌项目');
  if (cleanedProjectName !== beforeProjectName.trim()) {
    deterministicFixes.push({ code: 'PROJECT_NAME_TASK_TERM_REMOVED', path: '/identity/projectName', action: `${beforeProjectName} → ${cleanedProjectName}` });
    warnings.push({ code: 'PROJECT_NAME_TASK_TERM_REMOVED', path: '/identity/projectName', message: `已从项目名称中分离分析任务：${beforeProjectName} → ${cleanedProjectName}` });
  }
  if (decision.identity) {
    decision.identity.projectName = cleanedProjectName;
    decision.identity.analysisTaskName = detectedTaskName || null;
    decision.identity.brandPositioningStatus ||= 'reasonable-inference';
  }

  decision.audiences = (decision.audiences || []).map((audience, audienceIndex) => {
    const fallbackStatus = audience.inferenceLevel || 'reasonable-inference';
    const fallbackEvidenceIds = unique(audience.evidenceIds);
    const normalizeInsights = (values, kind) => insightItems(values, fallbackStatus, fallbackEvidenceIds, (itemIndex) => {
      const path = `/audiences/${audienceIndex}/${kind}/${itemIndex}`;
      deterministicFixes.push({ code: 'AUDIENCE_INSIGHT_WITHOUT_EVIDENCE_DOWNGRADED', path, action: '无 Evidence ID，状态调整为 missing' });
      warnings.push({ code: 'AUDIENCE_INSIGHT_WITHOUT_EVIDENCE_DOWNGRADED', path, message: '洞察缺少直接证据，已保留为待确认信息' });
    });
    const needs = normalizeInsights(audience.needs, 'needs').map((item, itemIndex) => {
      if (item.status === 'missing' || CUSTOMER_RESULT_WORDS.test(item.statement || '') || BRAND_TASK_WORDS.test(item.statement || '')) return item;
      const path = `/audiences/${audienceIndex}/needs/${itemIndex}/statement`;
      deterministicFixes.push({ code: 'AUDIENCE_NEED_RESULT_FRAMED', path, action: `${item.statement} → 获得${item.statement}` });
      warnings.push({ code: 'AUDIENCE_NEED_RESULT_FRAMED', path, message: '已将名词式需求统一改写为客户获得的结果' });
      return { ...item, statement: `获得${item.statement}` };
    });
    return {
      ...audience,
      needs,
      barriers: normalizeInsights(audience.barriers, 'barriers'),
      useCases: normalizeInsights(audience.useCases, 'useCases')
    };
  });

  const sourceByEvidence = new Map((evidenceMap?.evidence || []).map((item) => [item.evidenceId, item.sourceId]));
  const validEvidenceIds = new Set(sourceByEvidence.keys());
  const normalizedGenes = (decision.genes || []).map((gene) => {
    const rawType = String(gene.type || '').toLowerCase().replaceAll('_', '-');
    const type = GENE_TYPE_ALIASES[rawType] || rawType;
    const normalized = {
      ...gene,
      geneId: GENE_IDS[type] || gene.geneId,
      maturity: type === 'cultural' ? (gene.maturity || gene.culturalMaturity) : 'not-applicable',
      evidenceIds: unique(gene.evidenceIds)
    };
    delete normalized.culturalMaturity;
    const evidenceSources = new Set(normalized.evidenceIds.map((id) => sourceByEvidence.get(id)).filter(Boolean));
    const declaredCulture = type === 'cultural' && ['declared', 'aspirational'].includes(normalized.maturity);
    const unresolvedAesthetic = type === 'aesthetic' && (decision.pendingConfirmations || []).some((item) => /视觉|色彩|风格|方向/.test(item));
    const softGeneWithOneSource = ['relational', 'emotional', 'cultural', 'aesthetic'].includes(type) && evidenceSources.size <= 1;
    if (normalized.confidence === 'high' && (declaredCulture || unresolvedAesthetic || softGeneWithOneSource)) {
      normalized.confidence = 'medium';
      deterministicFixes.push({ code: type === 'aesthetic' ? 'AESTHETIC_CONFIDENCE_CALIBRATED' : 'GENE_CONFIDENCE_CALIBRATED', path: `/genes/${GENE_ORDER.indexOf(type)}/confidence`, action: 'high → medium' });
      if (type === 'aesthetic' && unresolvedAesthetic) warnings.push({ code: 'AESTHETIC_DIRECTION_UNRESOLVED', path: `/genes/${GENE_ORDER.indexOf(type)}/confidence`, message: '视觉方向尚未确认，Aesthetic Gene 置信度最高为中' });
    }
    return normalized;
  });
  const canonicalGenes = [];
  for (const type of GENE_ORDER) {
    const candidates = normalizedGenes.filter((gene) => gene.type === type).sort((a, b) => geneStrength(b) - geneStrength(a));
    if (!candidates.length) continue;
    canonicalGenes.push({ ...candidates[0], evidenceIds: unique(candidates.flatMap((gene) => gene.evidenceIds)) });
    if (candidates.length > 1) {
      deterministicFixes.push({ code: 'GENE_DUPLICATE_TYPE_COLLAPSED', path: `/genes/${GENE_ORDER.indexOf(type)}`, action: `${type} ${candidates.length} 条 → 1 条，并合并 Evidence IDs` });
      warnings.push({ code: 'GENE_DUPLICATE_TYPE_COLLAPSED', path: `/genes/${GENE_ORDER.indexOf(type)}`, message: `模型将 ${type} Gene 拆为 ${candidates.length} 条，已保留证据最充分的一条` });
    }
  }
  const extraTypes = unique(normalizedGenes.filter((gene) => !GENE_ORDER.includes(gene.type)).map((gene) => gene.type));
  if (extraTypes.length) warnings.push({ code: 'GENE_NON_STANDARD_TYPE_REMOVED', path: '/genes', message: `已移除非标准 Gene 类型：${extraTypes.join('、')}` });
  decision.genes = canonicalGenes;

  const legacyDiagnosis = decision.diagnosis || {};
  const risks = [
    ...(legacyDiagnosis.conflicts || []).map((item, index) => legacyRisk(item, index, { status: 'conflicting', severity: 'major', topic: '内容冲突' })),
    ...(legacyDiagnosis.missingInformation || []).map((item, index) => legacyRisk(item, index, { status: 'missing', severity: 'major', topic: '信息缺失' })),
    ...(legacyDiagnosis.risks || []).map((item, index) => legacyRisk(item, index, { status: 'reasonable-inference', severity: 'major', topic: '战略风险' }))
  ].map((risk, index) => ({ ...risk, riskId: `R${String(index + 1).padStart(2, '0')}` }));
  for (const risk of risks) {
    if (risk._normalizedEnums.length) deterministicFixes.push({ code: 'RISK_ENUM_NORMALIZED', path: `/diagnosis/risks/${risk.riskId}`, action: risk._normalizedEnums.join('；') });
    delete risk._normalizedEnums;
    if (risk.status === 'confirmed' && ABSOLUTE_RISK_TERMS.test(risk.statement || '')) {
      ABSOLUTE_RISK_TERMS.lastIndex = 0;
      const before = risk.statement;
      risk.statement = risk.statement.replace(ABSOLUTE_RISK_TERMS, '可能导致');
      risk.status = 'reasonable-inference';
      deterministicFixes.push({ code: 'RISK_ABSOLUTE_LANGUAGE_SOFTENED', path: `/diagnosis/risks/${risk.riskId}/statement`, action: `${before} → ${risk.statement}` });
    }
    ABSOLUTE_RISK_TERMS.lastIndex = 0;
    const canonicalIds = unique(risk.evidenceIds.map((id) => canonicalEvidenceId(id, validEvidenceIds)));
    const invalidIds = canonicalIds.filter((id) => !validEvidenceIds.has(id));
    risk.evidenceIds = canonicalIds.filter((id) => validEvidenceIds.has(id));
    if (invalidIds.length) {
      const path = `/diagnosis/risks/${risk.riskId}/evidenceIds`;
      deterministicFixes.push({ code: 'RISK_UNKNOWN_EVIDENCE_REMOVED', path, action: `移除未知引用：${invalidIds.join('、')}` });
      warnings.push({ code: 'RISK_UNKNOWN_EVIDENCE_REMOVED', path, message: '风险引用了 Evidence Map 中不存在的条目，已移除无效引用' });
    }
    if (!risk.evidenceIds.length && !['missing', 'suggested'].includes(risk.status)) {
      const path = `/diagnosis/risks/${risk.riskId}`;
      risk.status = 'missing';
      deterministicFixes.push({ code: 'RISK_WITHOUT_VALID_EVIDENCE_DOWNGRADED', path, action: '无有效 Evidence ID，状态调整为 missing' });
      warnings.push({ code: 'RISK_WITHOUT_VALID_EVIDENCE_DOWNGRADED', path, message: '风险缺少可核验依据，已保留为待确认项' });
    }
  }
  decision.diagnosis = { risks };

  const geneIdByLegacy = new Map(GENE_ORDER.flatMap((type) => [[`gene-${type}`, GENE_IDS[type]], [`local-${type}`, GENE_IDS[type]], [GENE_IDS[type], GENE_IDS[type]]]));
  if (decision.creativeThesis) {
    decision.creativeThesis.geneIds = unique((decision.creativeThesis.geneIds || ['G02', 'G03', 'G04']).map((id) => geneIdByLegacy.get(id) || id));
    const coverage = { ...(decision.creativeThesis.coverage || {}) };
    const evidenceBacked = unique(decision.creativeThesis.evidenceIds).length > 0;
    const structuralScores = {
      capability: decision.creativeThesis.geneIds.includes('G02') && evidenceBacked ? 4 : 0,
      relationship: decision.creativeThesis.geneIds.includes('G03') && evidenceBacked ? 4 : 0,
      emotion: decision.creativeThesis.geneIds.includes('G04') && evidenceBacked ? 4 : 0,
      culture: decision.creativeThesis.geneIds.includes('G05') && evidenceBacked ? 4 : 0,
      differentiation: String(decision.creativeThesis.distinctiveMechanism || '').trim().length >= 12 && evidenceBacked ? 4 : 0
    };
    const recalculated = Object.fromEntries(Object.entries(structuralScores).map(([key, score]) => [key, Math.max(Number(coverage[key]) || 0, score)]));
    if (Object.keys(structuralScores).some((key) => recalculated[key] !== coverage[key])) {
      deterministicFixes.push({ code: 'THESIS_COVERAGE_RECALCULATED', path: '/creativeThesis/coverage', action: `${JSON.stringify(coverage)} → ${JSON.stringify(recalculated)}` });
      warnings.push({ code: 'THESIS_COVERAGE_RECALCULATED', path: '/creativeThesis/coverage', message: '覆盖度已按关联基因、证据与专属机制重新计算' });
    }
    decision.creativeThesis.coverage = recalculated;
  }
  decision.visualMechanisms = (decision.visualMechanisms || []).map((item) => ({
    ...item,
    geneIds: unique((item.geneIds || []).map((id) => geneIdByLegacy.get(id) || id))
  }));
  decision.normalization = { deterministicFixes, warnings };
  return decision;
}

export { GENE_IDS, GENE_ORDER };
