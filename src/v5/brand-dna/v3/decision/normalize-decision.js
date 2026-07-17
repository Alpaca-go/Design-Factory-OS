import { cleanProjectName, extractAnalysisTaskName } from '../preparation/prepare-document-set.js';

const GENE_ORDER = Object.freeze(['functional', 'capability', 'relational', 'emotional', 'cultural', 'behavioral', 'aesthetic']);
const GENE_IDS = Object.freeze(Object.fromEntries(GENE_ORDER.map((type, index) => [type, `G${String(index + 1).padStart(2, '0')}`])));
const ABSOLUTE_RISK_TERMS = /将严重阻碍|一定导致|必然失去|将错失|直接抹平/g;

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function insightItems(values, fallbackStatus, fallbackEvidenceIds) {
  return (values || []).map((value) => typeof value === 'string'
    ? { status: fallbackStatus, statement: value, evidenceIds: fallbackEvidenceIds }
    : value);
}

function legacyRisk(raw, index, defaults) {
  const value = typeof raw === 'string' ? { statement: raw } : raw || {};
  const legacyStatus = value.status;
  const status = defaults.status === 'conflicting'
    ? (legacyStatus === 'suggested' ? 'suggested' : 'conflicting')
    : defaults.status === 'missing'
      ? 'missing'
      : legacyStatus || defaults.status;
  return {
    riskId: value.riskId || `risk-${index + 1}`,
    status,
    severity: value.severity || defaults.severity,
    topic: value.topic || defaults.topic,
    statement: value.statement,
    evidenceIds: unique(value.evidenceIds),
    recommendedAction: value.recommendedAction ?? null
  };
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

  decision.audiences = (decision.audiences || []).map((audience) => {
    const fallbackStatus = audience.inferenceLevel || 'reasonable-inference';
    const fallbackEvidenceIds = unique(audience.evidenceIds);
    return {
      ...audience,
      needs: insightItems(audience.needs, fallbackStatus, fallbackEvidenceIds),
      barriers: insightItems(audience.barriers, fallbackStatus, fallbackEvidenceIds),
      useCases: insightItems(audience.useCases, fallbackStatus, fallbackEvidenceIds)
    };
  });

  const sourceByEvidence = new Map((evidenceMap?.evidence || []).map((item) => [item.evidenceId, item.sourceId]));
  decision.genes = (decision.genes || []).map((gene) => {
    const type = gene.type;
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
  }).sort((a, b) => GENE_ORDER.indexOf(a.type) - GENE_ORDER.indexOf(b.type));

  const legacyDiagnosis = decision.diagnosis || {};
  const risks = [
    ...(legacyDiagnosis.conflicts || []).map((item, index) => legacyRisk(item, index, { status: 'conflicting', severity: 'major', topic: '内容冲突' })),
    ...(legacyDiagnosis.missingInformation || []).map((item, index) => legacyRisk(item, index, { status: 'missing', severity: 'major', topic: '信息缺失' })),
    ...(legacyDiagnosis.risks || []).map((item, index) => legacyRisk(item, index, { status: 'reasonable-inference', severity: 'major', topic: '战略风险' }))
  ].map((risk, index) => ({ ...risk, riskId: `R${String(index + 1).padStart(2, '0')}` }));
  for (const risk of risks) {
    if (risk.status === 'confirmed' && ABSOLUTE_RISK_TERMS.test(risk.statement || '')) {
      ABSOLUTE_RISK_TERMS.lastIndex = 0;
      const before = risk.statement;
      risk.statement = risk.statement.replace(ABSOLUTE_RISK_TERMS, '可能导致');
      risk.status = 'reasonable-inference';
      deterministicFixes.push({ code: 'RISK_ABSOLUTE_LANGUAGE_SOFTENED', path: `/diagnosis/risks/${risk.riskId}/statement`, action: `${before} → ${risk.statement}` });
    }
    ABSOLUTE_RISK_TERMS.lastIndex = 0;
  }
  decision.diagnosis = { risks };

  const geneIdByLegacy = new Map(GENE_ORDER.flatMap((type) => [[`gene-${type}`, GENE_IDS[type]], [`local-${type}`, GENE_IDS[type]], [GENE_IDS[type], GENE_IDS[type]]]));
  if (decision.creativeThesis) {
    decision.creativeThesis.geneIds = unique((decision.creativeThesis.geneIds || ['G02', 'G03', 'G04']).map((id) => geneIdByLegacy.get(id) || id));
  }
  decision.visualMechanisms = (decision.visualMechanisms || []).map((item) => ({
    ...item,
    geneIds: unique((item.geneIds || []).map((id) => geneIdByLegacy.get(id) || id))
  }));
  decision.normalization = { deterministicFixes, warnings };
  return decision;
}

export { GENE_IDS, GENE_ORDER };
