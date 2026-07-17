import { arrayValue, enumValue, numberValue, objectValue, stringArray, stringValue } from '../../runtime-contracts.js';
import { GENE_IDS, GENE_ORDER, normalizeBrandCreativeDecision } from './normalize-decision.js';

const INSIGHT_STATUSES = ['confirmed', 'reasonable-inference', 'missing'];
const RISK_STATUSES = ['confirmed', 'reasonable-inference', 'conflicting', 'missing', 'suggested'];

function refs(value, path, evidenceIds, minimum = 1) {
  const result = [...new Set(stringArray(value || [], path, { min: minimum }))];
  if (result.some((id) => !evidenceIds.has(id))) throw new Error(`${path} 包含未知 Evidence ID`);
  return result;
}

function insightItems(value, path, evidenceIds) {
  return arrayValue(value || [], path).map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    const item = objectValue(raw, itemPath);
    const status = enumValue(item.status, INSIGHT_STATUSES, `${itemPath}.status`);
    return {
      status,
      statement: stringValue(item.statement, `${itemPath}.statement`),
      evidenceIds: refs(item.evidenceIds, `${itemPath}.evidenceIds`, evidenceIds, status === 'missing' ? 0 : 1)
    };
  });
}

function risks(value, path, evidenceIds) {
  return arrayValue(value || [], path).map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    const item = objectValue(raw, itemPath);
    const status = enumValue(item.status, RISK_STATUSES, `${itemPath}.status`);
    return {
      riskId: `R${String(index + 1).padStart(2, '0')}`,
      status,
      severity: enumValue(item.severity, ['critical', 'major', 'minor'], `${itemPath}.severity`),
      topic: stringValue(item.topic, `${itemPath}.topic`),
      statement: stringValue(item.statement, `${itemPath}.statement`),
      evidenceIds: refs(item.evidenceIds, `${itemPath}.evidenceIds`, evidenceIds, ['missing', 'suggested'].includes(status) ? 0 : 1),
      recommendedAction: item.recommendedAction === null || item.recommendedAction === undefined ? null : stringValue(item.recommendedAction, `${itemPath}.recommendedAction`)
    };
  });
}

export function normalizeDecision(value, evidenceMap) {
  return normalizeBrandCreativeDecision(value, evidenceMap);
}

export function validateBrandCreativeDecision(value, evidenceMap) {
  const decision = objectValue(normalizeDecision(value, evidenceMap), 'brandCreativeDecision');
  const evidenceIds = new Set(evidenceMap.evidence.map((item) => item.evidenceId));
  const identity = objectValue(decision.identity, 'brandCreativeDecision.identity');
  const strategy = objectValue(decision.strategy, 'brandCreativeDecision.strategy');
  const diagnosis = objectValue(decision.diagnosis, 'brandCreativeDecision.diagnosis');
  const genes = arrayValue(decision.genes, 'brandCreativeDecision.genes', { min: 7, max: 7 }).map((raw, index) => {
    const path = `brandCreativeDecision.genes[${index}]`;
    const gene = objectValue(raw, path);
    const type = enumValue(gene.type, GENE_ORDER, `${path}.type`);
    const maturity = enumValue(gene.maturity, ['embedded', 'declared', 'aspirational', 'not-applicable'], `${path}.maturity`);
    if (type === 'cultural' && maturity === 'not-applicable') throw Object.assign(new Error(`${path}.maturity 不能为空`), { code: 'CULTURAL_MATURITY_MISSING', path: `${path}.maturity` });
    if (type !== 'cultural' && maturity !== 'not-applicable') throw new Error(`${path}.maturity 非文化基因必须为 not-applicable`);
    const confidence = enumValue(gene.confidence, ['high', 'medium', 'low'], `${path}.confidence`);
    if (type === 'cultural' && ['declared', 'aspirational'].includes(maturity) && confidence === 'high') throw Object.assign(new Error(`${path}.confidence 与文化成熟度冲突`), { code: 'CULTURAL_MATURITY_OVERCLAIMED', path: `${path}.confidence` });
    return { geneId: GENE_IDS[type], type, statement: stringValue(gene.statement, `${path}.statement`), evidenceIds: refs(gene.evidenceIds, `${path}.evidenceIds`, evidenceIds), confidence, maturity, differentiationValue: enumValue(gene.differentiationValue, ['high', 'medium', 'low'], `${path}.differentiationValue`) };
  });
  if (new Set(genes.map((gene) => gene.type)).size !== 7) throw new Error('brandCreativeDecision.genes 必须完整覆盖七类基因');
  const geneIds = new Set(genes.map((gene) => gene.geneId));
  const thesis = objectValue(decision.creativeThesis, 'brandCreativeDecision.creativeThesis');
  const coverage = objectValue(thesis.coverage, 'brandCreativeDecision.creativeThesis.coverage');
  const thesisGeneIds = stringArray(thesis.geneIds, 'brandCreativeDecision.creativeThesis.geneIds', { min: 3 });
  if (thesisGeneIds.some((id) => !geneIds.has(id))) throw new Error('brandCreativeDecision.creativeThesis.geneIds 包含未知基因');
  return {
    identity: {
      projectName: stringValue(identity.projectName, 'brandCreativeDecision.identity.projectName'),
      brandName: stringValue(identity.brandName, 'brandCreativeDecision.identity.brandName'),
      analysisTaskName: identity.analysisTaskName === null ? null : stringValue(identity.analysisTaskName, 'brandCreativeDecision.identity.analysisTaskName'),
      industry: stringValue(identity.industry, 'brandCreativeDecision.identity.industry'),
      businessRole: stringValue(identity.businessRole, 'brandCreativeDecision.identity.businessRole'),
      brandPositioning: stringValue(identity.brandPositioning, 'brandCreativeDecision.identity.brandPositioning'),
      brandPositioningStatus: enumValue(identity.brandPositioningStatus, ['confirmed', 'reasonable-inference', 'suggested'], 'brandCreativeDecision.identity.brandPositioningStatus'),
      developmentStage: stringValue(identity.developmentStage, 'brandCreativeDecision.identity.developmentStage'),
      evidenceIds: refs(identity.evidenceIds, 'brandCreativeDecision.identity.evidenceIds', evidenceIds),
      confidence: enumValue(identity.confidence, ['high', 'medium', 'low'], 'brandCreativeDecision.identity.confidence')
    },
    audiences: arrayValue(decision.audiences, 'brandCreativeDecision.audiences', { min: 1 }).map((raw, index) => {
      const path = `brandCreativeDecision.audiences[${index}]`;
      const item = objectValue(raw, path);
      const needs = insightItems(item.needs, `${path}.needs`, evidenceIds);
      if (!needs.length) throw new Error(`${path}.needs 至少需要一项`);
      return { audienceId: `A${String(index + 1).padStart(2, '0')}`, name: stringValue(item.name, `${path}.name`), priority: enumValue(item.priority, ['primary', 'secondary', 'extension'], `${path}.priority`), needs, barriers: insightItems(item.barriers, `${path}.barriers`, evidenceIds), useCases: insightItems(item.useCases, `${path}.useCases`, evidenceIds), evidenceIds: refs(item.evidenceIds, `${path}.evidenceIds`, evidenceIds, 0) };
    }),
    strategy: { mission: stringValue(strategy.mission, 'brandCreativeDecision.strategy.mission'), promise: stringValue(strategy.promise, 'brandCreativeDecision.strategy.promise'), valuePropositions: stringArray(strategy.valuePropositions, 'brandCreativeDecision.strategy.valuePropositions', { min: 1 }), differentiators: stringArray(strategy.differentiators, 'brandCreativeDecision.strategy.differentiators', { min: 1 }), relationshipRole: stringValue(strategy.relationshipRole, 'brandCreativeDecision.strategy.relationshipRole'), personality: stringArray(strategy.personality, 'brandCreativeDecision.strategy.personality', { min: 1 }), toneOfVoice: stringArray(strategy.toneOfVoice, 'brandCreativeDecision.strategy.toneOfVoice', { min: 1 }), emotionalOutcomes: stringArray(strategy.emotionalOutcomes, 'brandCreativeDecision.strategy.emotionalOutcomes', { min: 1 }), evidenceIds: refs(strategy.evidenceIds, 'brandCreativeDecision.strategy.evidenceIds', evidenceIds) },
    genes,
    oneSentenceDna: stringValue(decision.oneSentenceDna, 'brandCreativeDecision.oneSentenceDna'),
    diagnosis: { risks: risks(diagnosis.risks, 'brandCreativeDecision.diagnosis.risks', evidenceIds) },
    creativeThesis: { statement: stringValue(thesis.statement, 'brandCreativeDecision.creativeThesis.statement'), rationale: stringValue(thesis.rationale, 'brandCreativeDecision.creativeThesis.rationale'), geneIds: thesisGeneIds, coverage: Object.fromEntries(['capability', 'relationship', 'emotion', 'culture', 'differentiation'].map((key) => [key, numberValue(coverage[key], `brandCreativeDecision.creativeThesis.coverage.${key}`, { min: 0, max: 5 })])), evidenceIds: refs(thesis.evidenceIds, 'brandCreativeDecision.creativeThesis.evidenceIds', evidenceIds), isExistingSloganReuse: Boolean(thesis.isExistingSloganReuse), distinctiveMechanism: stringValue(thesis.distinctiveMechanism, 'brandCreativeDecision.creativeThesis.distinctiveMechanism') },
    visualMechanisms: arrayValue(decision.visualMechanisms, 'brandCreativeDecision.visualMechanisms', { min: 1 }).map((raw, index) => { const path = `brandCreativeDecision.visualMechanisms[${index}]`; const item = objectValue(raw, path); const mechanismGeneIds = stringArray(item.geneIds, `${path}.geneIds`, { min: 1 }); if (mechanismGeneIds.some((id) => !geneIds.has(id))) throw new Error(`${path}.geneIds 包含未知基因`); return { mechanismId: `M${String(index + 1).padStart(2, '0')}`, name: stringValue(item.name, `${path}.name`), description: stringValue(item.description, `${path}.description`), geneIds: mechanismGeneIds, evidenceIds: refs(item.evidenceIds, `${path}.evidenceIds`, evidenceIds), genericRisk: enumValue(item.genericRisk, ['low', 'medium', 'high'], `${path}.genericRisk`) }; }),
    pendingConfirmations: stringArray(decision.pendingConfirmations || [], 'brandCreativeDecision.pendingConfirmations'),
    normalization: decision.normalization || { deterministicFixes: [], warnings: [] }
  };
}
