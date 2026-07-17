import { arrayValue, enumValue, numberValue, objectValue, stringArray, stringValue } from '../../runtime-contracts.js';
import { cleanProjectName } from '../preparation/prepare-document-set.js';

const GENE_TYPES = ['functional', 'capability', 'relational', 'emotional', 'cultural', 'behavioral', 'aesthetic'];

function refs(value, path, evidenceIds, minimum = 1) {
  const result = [...new Set(stringArray(value, path, { min: minimum }))];
  if (result.some((id) => !evidenceIds.has(id))) throw new Error(`${path} 包含未知 Evidence ID`);
  return result;
}

function diagnosisItems(value, path, evidenceIds) {
  return arrayValue(value || [], path).map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    const item = objectValue(raw, itemPath);
    return {
      statement: stringValue(item.statement, `${itemPath}.statement`),
      status: enumValue(item.status, ['confirmed', 'reasonable-inference', 'suggested'], `${itemPath}.status`),
      evidenceIds: refs(item.evidenceIds || [], `${itemPath}.evidenceIds`, evidenceIds, item.status === 'suggested' ? 0 : 1)
    };
  });
}

export function normalizeDecision(value) {
  const decision = structuredClone(value?.brandCreativeDecision || value);
  if (decision?.identity) decision.identity.projectName = cleanProjectName(decision.identity.projectName, decision.identity.brandName);
  if (Array.isArray(decision?.genes)) {
    decision.genes = decision.genes.map((gene) => ({ ...gene, evidenceIds: [...new Set(gene?.evidenceIds || [])] }));
  }
  return decision;
}

export function validateBrandCreativeDecision(value, evidenceMap) {
  const decision = objectValue(normalizeDecision(value), 'brandCreativeDecision');
  const evidenceIds = new Set(evidenceMap.evidence.map((item) => item.evidenceId));
  const identity = objectValue(decision.identity, 'brandCreativeDecision.identity');
  const strategy = objectValue(decision.strategy, 'brandCreativeDecision.strategy');
  const diagnosis = objectValue(decision.diagnosis, 'brandCreativeDecision.diagnosis');
  const genes = arrayValue(decision.genes, 'brandCreativeDecision.genes', { min: 7, max: 7 }).map((raw, index) => {
    const path = `brandCreativeDecision.genes[${index}]`;
    const gene = objectValue(raw, path);
    const type = enumValue(gene.type, GENE_TYPES, `${path}.type`);
    const maturity = gene.culturalMaturity === null ? null : enumValue(gene.culturalMaturity, ['embedded', 'declared', 'aspirational'], `${path}.culturalMaturity`);
    if (type === 'cultural' && !maturity) throw new Error(`${path}.culturalMaturity 不能为空`);
    if (type !== 'cultural' && maturity !== null) throw new Error(`${path}.culturalMaturity 仅文化基因可设置`);
    return { geneId: `gene-${type}`, type, statement: stringValue(gene.statement, `${path}.statement`), evidenceIds: refs(gene.evidenceIds, `${path}.evidenceIds`, evidenceIds), confidence: enumValue(gene.confidence, ['high', 'medium', 'low'], `${path}.confidence`), culturalMaturity: maturity, differentiationValue: enumValue(gene.differentiationValue, ['high', 'medium', 'low'], `${path}.differentiationValue`) };
  });
  if (new Set(genes.map((gene) => gene.type)).size !== 7) throw new Error('brandCreativeDecision.genes 必须完整覆盖七类基因');
  const geneIds = new Set(genes.map((gene) => gene.geneId));
  const thesis = objectValue(decision.creativeThesis, 'brandCreativeDecision.creativeThesis');
  const coverage = objectValue(thesis.coverage, 'brandCreativeDecision.creativeThesis.coverage');
  return {
    identity: { projectName: stringValue(identity.projectName, 'brandCreativeDecision.identity.projectName'), brandName: stringValue(identity.brandName, 'brandCreativeDecision.identity.brandName'), industry: stringValue(identity.industry, 'brandCreativeDecision.identity.industry'), businessRole: stringValue(identity.businessRole, 'brandCreativeDecision.identity.businessRole'), brandPositioning: stringValue(identity.brandPositioning, 'brandCreativeDecision.identity.brandPositioning'), developmentStage: stringValue(identity.developmentStage, 'brandCreativeDecision.identity.developmentStage'), evidenceIds: refs(identity.evidenceIds, 'brandCreativeDecision.identity.evidenceIds', evidenceIds), confidence: enumValue(identity.confidence, ['high', 'medium', 'low'], 'brandCreativeDecision.identity.confidence') },
    audiences: arrayValue(decision.audiences, 'brandCreativeDecision.audiences', { min: 1 }).map((raw, index) => { const path = `brandCreativeDecision.audiences[${index}]`; const item = objectValue(raw, path); return { audienceId: `audience-${index + 1}`, name: stringValue(item.name, `${path}.name`), priority: enumValue(item.priority, ['primary', 'secondary'], `${path}.priority`), needs: stringArray(item.needs, `${path}.needs`, { min: 1 }), barriers: stringArray(item.barriers || [], `${path}.barriers`), useCases: stringArray(item.useCases || [], `${path}.useCases`), evidenceIds: refs(item.evidenceIds, `${path}.evidenceIds`, evidenceIds), inferenceLevel: enumValue(item.inferenceLevel, ['confirmed', 'reasonable-inference'], `${path}.inferenceLevel`) }; }),
    strategy: { mission: stringValue(strategy.mission, 'brandCreativeDecision.strategy.mission'), promise: stringValue(strategy.promise, 'brandCreativeDecision.strategy.promise'), valuePropositions: stringArray(strategy.valuePropositions, 'brandCreativeDecision.strategy.valuePropositions', { min: 1 }), differentiators: stringArray(strategy.differentiators, 'brandCreativeDecision.strategy.differentiators', { min: 1 }), relationshipRole: stringValue(strategy.relationshipRole, 'brandCreativeDecision.strategy.relationshipRole'), personality: stringArray(strategy.personality, 'brandCreativeDecision.strategy.personality', { min: 1 }), toneOfVoice: stringArray(strategy.toneOfVoice, 'brandCreativeDecision.strategy.toneOfVoice', { min: 1 }), emotionalOutcomes: stringArray(strategy.emotionalOutcomes, 'brandCreativeDecision.strategy.emotionalOutcomes', { min: 1 }), evidenceIds: refs(strategy.evidenceIds, 'brandCreativeDecision.strategy.evidenceIds', evidenceIds) },
    genes,
    oneSentenceDna: stringValue(decision.oneSentenceDna, 'brandCreativeDecision.oneSentenceDna'),
    diagnosis: { conflicts: diagnosisItems(diagnosis.conflicts, 'brandCreativeDecision.diagnosis.conflicts', evidenceIds), missingInformation: stringArray(diagnosis.missingInformation || [], 'brandCreativeDecision.diagnosis.missingInformation'), risks: diagnosisItems(diagnosis.risks, 'brandCreativeDecision.diagnosis.risks', evidenceIds) },
    creativeThesis: { statement: stringValue(thesis.statement, 'brandCreativeDecision.creativeThesis.statement'), rationale: stringValue(thesis.rationale, 'brandCreativeDecision.creativeThesis.rationale'), coverage: Object.fromEntries(['capability', 'relationship', 'emotion', 'culture', 'differentiation'].map((key) => [key, numberValue(coverage[key], `brandCreativeDecision.creativeThesis.coverage.${key}`, { min: 0, max: 5 })])), evidenceIds: refs(thesis.evidenceIds, 'brandCreativeDecision.creativeThesis.evidenceIds', evidenceIds), isExistingSloganReuse: Boolean(thesis.isExistingSloganReuse), distinctiveMechanism: stringValue(thesis.distinctiveMechanism, 'brandCreativeDecision.creativeThesis.distinctiveMechanism') },
    visualMechanisms: arrayValue(decision.visualMechanisms, 'brandCreativeDecision.visualMechanisms', { min: 1 }).map((raw, index) => { const path = `brandCreativeDecision.visualMechanisms[${index}]`; const item = objectValue(raw, path); const mechanismGeneIds = stringArray(item.geneIds, `${path}.geneIds`, { min: 1 }); if (mechanismGeneIds.some((id) => !geneIds.has(id))) throw new Error(`${path}.geneIds 包含未知基因`); return { mechanismId: `mechanism-${index + 1}`, name: stringValue(item.name, `${path}.name`), description: stringValue(item.description, `${path}.description`), geneIds: mechanismGeneIds, evidenceIds: refs(item.evidenceIds, `${path}.evidenceIds`, evidenceIds), genericRisk: enumValue(item.genericRisk, ['low', 'medium', 'high'], `${path}.genericRisk`) }; }),
    pendingConfirmations: stringArray(decision.pendingConfirmations || [], 'brandCreativeDecision.pendingConfirmations')
  };
}
