import { arrayValue, enumValue, numberValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { assertAudienceBoundaryMatches } from './audience-boundary-v1.js';
import { buildDirectionDifferenceMatrix } from './direction-difference-matrix-v1.js';
import { validateEvidenceConfidence } from './evidence-confidence-v1.js';
import { buildDirectionRiskBreakdown } from './direction-risk-v1.js';
import { containsChinese } from './report-language-v1.js';

export const PEOPLE_ROLES = Object.freeze([
  'none', 'partner_team', 'industry_expert', 'ecosystem_participant',
  'staff_auxiliary', 'consumer_auxiliary', 'consumer_core'
]);
const PRODUCT_ROLES = Object.freeze(['none', 'platform_capability', 'industry_product', 'consumer_product_core']);
const ENVIRONMENT_ROLES = Object.freeze(['abstract', 'industry', 'platform', 'partner_business', 'consumer_service']);
const APPLICATION_AUDIENCES = Object.freeze(['b2b', 'internal', 'consumer']);
const APPLICATION_ROLES = Object.freeze(['core', 'auxiliary']);
const DEFERRED_ANCHOR_DETAILS = Object.freeze(['specific_shot', 'specific_person_action', 'precise_lighting_camera', 'full_product_staging', 'single_anchor_scene']);

export function inferPeopleRoleFromText(value) {
  const text = String(value || '').normalize('NFKC').toLowerCase();
  if (/(?:no (?:complete )?(?:people|person|human)|without (?:people|people imagery)|无人|不使用人物|无需人物|没有人物)/u.test(text)) return 'none';
  if (/(?:终端消费者|消费者|顾客|consumer|customer)/u.test(text)) return 'consumer_auxiliary';
  if (/(?:生态参与者|生态成员|ecosystem participant|ecosystem member)/u.test(text)) return 'ecosystem_participant';
  if (/(?:行业专家|专业人士|专业人员|industry expert|industry professional|business professional|specialist)/u.test(text)) return 'industry_expert';
  if (/(?:合作伙伴|伙伴团队|合作团队|partner team|partner staff|partners?)/u.test(text)) return 'partner_team';
  if (/(?:员工|内部团队|工作人员|staff|employee|internal team)/u.test(text)) return 'staff_auxiliary';
  return null;
}

function validatePeoplePolicy(subjectPolicy, path) {
  const inferred = inferPeopleRoleFromText(subjectPolicy.people);
  if (!inferred) return;
  const compatible = inferred === 'consumer_auxiliary'
    ? ['consumer_auxiliary', 'consumer_core'].includes(subjectPolicy.peopleRole)
    : subjectPolicy.peopleRole === inferred;
  if (!compatible) throw Object.assign(new Error(`${path}.people text implies ${inferred} but peopleRole is ${subjectPolicy.peopleRole}`), {
    code: 'PEOPLE_POLICY_MAPPING_CONFLICT', path: `${path}.peopleRole`
  });
}

function validateB2BBoundary(direction, audienceBoundary, path) {
  if (audienceBoundary.businessModel !== 'b2b') return;
  if (direction.subjectPolicy.peopleRole === 'consumer_core') throw Object.assign(new Error('B2B direction cannot use consumers as the core subject'), { code: 'B2B_BOUNDARY_VIOLATION', path: `${path}.subjectPolicy.peopleRole` });
  if (direction.subjectPolicy.productRole === 'consumer_product_core') throw Object.assign(new Error('B2B direction cannot present a consumer product as the core offer'), { code: 'B2B_BOUNDARY_VIOLATION', path: `${path}.subjectPolicy.productRole` });
  if (direction.subjectPolicy.environmentRole === 'consumer_service') throw Object.assign(new Error('B2B direction cannot become a consumer service environment'), { code: 'B2B_BOUNDARY_VIOLATION', path: `${path}.subjectPolicy.environmentRole` });
  if (direction.suitableApplications.some((item) => item.audience === 'consumer' && item.role === 'core')) {
    throw Object.assign(new Error('B2B direction cannot include core consumer touchpoints'), { code: 'B2B_BOUNDARY_VIOLATION', path: `${path}.suitableApplications` });
  }
}

export function validateVisualCreativeDirections(value, context) {
  const root = objectValue(value?.visualCreativeDirections || value, 'visualCreativeDirections');
  const audienceBoundary = assertAudienceBoundaryMatches(root.audienceBoundary, context.evidenceMap.audienceBoundary, 'visualCreativeDirections.audienceBoundary');
  const signalIds = new Set(context.signalMap.signals.map((item) => item.signalId));
  const evidenceIds = new Set(context.evidenceMap.evidence.map((item) => item.evidenceId));
  const executableAssetIds = new Set(context.evidenceMap.executableSuggestedAssets.map((item) => item.assetId));
  const directions = arrayValue(root.directions, 'visualCreativeDirections.directions', { min: 3, max: 3 }).map((raw, index) => {
    const path = `visualCreativeDirections.directions[${index}]`;
    const item = objectValue(raw, path);
    const strategicSignals = stringArray(item.strategicSignals, `${path}.strategicSignals`, { min: 2 });
    const refs = stringArray(item.evidenceIds, `${path}.evidenceIds`, { min: 2 });
    if (strategicSignals.some((id) => !signalIds.has(id))) throw Object.assign(new Error(`${path}.strategicSignals contains an unknown signal`), { code: 'FAILED_SCHEMA', path });
    if (refs.some((id) => !evidenceIds.has(id))) throw Object.assign(new Error(`${path}.evidenceIds contains unknown evidence`), { code: 'FAILED_SCHEMA', path });
    const subject = objectValue(item.subjectPolicy, `${path}.subjectPolicy`);
    const mechanism = objectValue(item.mechanismAssessment, `${path}.mechanismAssessment`);
    const reasonBasis = enumValue(mechanism.reasonBasis, ['brand_evidence', 'mixed', 'industry_only'], `${path}.mechanismAssessment.reasonBasis`);
    const industryTemplateRisk = enumValue(mechanism.industryTemplateRisk, ['low', 'medium', 'high', 'critical'], `${path}.mechanismAssessment.industryTemplateRisk`);
    if (industryTemplateRisk === 'critical' || reasonBasis === 'industry_only') throw Object.assign(new Error(`${path} uses a critical or industry-only template mechanism and must be replaced before final directions`), { code: 'INDUSTRY_TEMPLATE_RISK', path, repairDirectionIds: [`D0${index + 1}`] });
    const deferredToAnchor = stringArray(item.deferredToAnchor, `${path}.deferredToAnchor`, { min: DEFERRED_ANCHOR_DETAILS.length });
    if (DEFERRED_ANCHOR_DETAILS.some((detail) => !deferredToAnchor.includes(detail))) throw Object.assign(new Error(`${path}.deferredToAnchor must preserve all Sprint 2 details`), { code: 'FAILED_SCHEMA', path: `${path}.deferredToAnchor` });
    const assetIds = stringArray(item.executableAssetIds || [], `${path}.executableAssetIds`);
    if (assetIds.some((id) => !executableAssetIds.has(id))) throw Object.assign(new Error(`${path}.executableAssetIds contains a restricted or unknown asset`), { code: 'RESTRICTED_ASSET_EXECUTION', path: `${path}.executableAssetIds` });
    const direction = {
      directionId: `D0${index + 1}`,
      name: stringValue(item.name, `${path}.name`),
      internalCodeName: item.internalCodeName ? stringValue(item.internalCodeName, `${path}.internalCodeName`) : null,
      oneSentenceConcept: stringValue(item.oneSentenceConcept, `${path}.oneSentenceConcept`, { maxLength: 180 }),
      strategicSignals,
      evidenceIds: refs,
      evidence_ids: refs,
      ...validateEvidenceConfidence(item, path),
      coreMetaphor: stringValue(item.coreMetaphor, `${path}.coreMetaphor`),
      distinctiveMechanism: stringValue(item.distinctiveMechanism, `${path}.distinctiveMechanism`),
      mechanismAssessment: {
        brandSpecificReason: stringValue(mechanism.brandSpecificReason, `${path}.mechanismAssessment.brandSpecificReason`, { maxLength: 300 }),
        reasonBasis,
        industryTemplateRisk,
        replacementMechanism: stringValue(mechanism.replacementMechanism, `${path}.mechanismAssessment.replacementMechanism`, { maxLength: 300 })
      },
      graphicLanguage: stringArray(item.graphicLanguage, `${path}.graphicLanguage`, { min: 2 }),
      colorLogic: stringValue(item.colorLogic, `${path}.colorLogic`),
      materialLanguage: stringArray(item.materialLanguage, `${path}.materialLanguage`, { min: 2 }),
      lightingLanguage: stringValue(item.lightingLanguage, `${path}.lightingLanguage`),
      compositionLanguage: stringValue(item.compositionLanguage, `${path}.compositionLanguage`),
      emotionalRole: stringValue(item.emotionalRole, `${path}.emotionalRole`),
      spatialBehavior: stringValue(item.spatialBehavior, `${path}.spatialBehavior`),
      subjectPolicy: {
        people: stringValue(subject.people, `${path}.subjectPolicy.people`),
        peopleRole: enumValue(subject.peopleRole, PEOPLE_ROLES, `${path}.subjectPolicy.peopleRole`),
        products: stringValue(subject.products, `${path}.subjectPolicy.products`),
        productRole: enumValue(subject.productRole, PRODUCT_ROLES, `${path}.subjectPolicy.productRole`),
        environment: stringValue(subject.environment, `${path}.subjectPolicy.environment`),
        environmentRole: enumValue(subject.environmentRole, ENVIRONMENT_ROLES, `${path}.subjectPolicy.environmentRole`)
      },
      suitableApplications: arrayValue(item.suitableApplications, `${path}.suitableApplications`, { min: 2 }).map((rawApplication, applicationIndex) => {
        const applicationPath = `${path}.suitableApplications[${applicationIndex}]`;
        const application = objectValue(rawApplication, applicationPath);
        return {
          name: stringValue(application.name, `${applicationPath}.name`),
          audience: enumValue(application.audience, APPLICATION_AUDIENCES, `${applicationPath}.audience`),
          role: enumValue(application.role, APPLICATION_ROLES, `${applicationPath}.role`)
        };
      }),
      executableAssetIds: assetIds,
      deferredToAnchor,
      brandFit: numberValue(item.brandFit, `${path}.brandFit`, { min: 0, max: 100 }),
      inspirationValue: numberValue(item.inspirationValue, `${path}.inspirationValue`, { min: 0, max: 100 }),
      distinctiveness: numberValue(item.distinctiveness, `${path}.distinctiveness`, { min: 0, max: 100 }),
      scalability: numberValue(item.scalability, `${path}.scalability`, { min: 0, max: 100 }),
      categoryClicheRisk: enumValue(item.categoryClicheRisk, ['low', 'medium', 'high', 'critical'], `${path}.categoryClicheRisk`),
      risks: stringArray(item.risks, `${path}.risks`, { min: 1 })
    };
    if (context.evidenceMap.reportLanguage === 'zh-CN' && !containsChinese(direction.name)) throw Object.assign(new Error(`${path}.name must use a Chinese formal name`), { code: 'REPORT_LANGUAGE_POLLUTION', path: `${path}.name`, repairDirectionIds: [direction.directionId] });
    direction.risk_breakdown = buildDirectionRiskBreakdown(direction);
    validatePeoplePolicy(direction.subjectPolicy, `${path}.subjectPolicy`);
    validateB2BBoundary(direction, audienceBoundary, path);
    return direction;
  });
  if (new Set(directions.map((item) => item.name)).size !== 3) throw Object.assign(new Error('Three direction names must be distinct'), { code: 'DIRECTIONS_NOT_DISTINCT' });
  const differenceMatrix = buildDirectionDifferenceMatrix(directions, root.differenceMatrix, { evaluator: context.differenceEvaluator, reportLanguage: context.evidenceMap.reportLanguage });
  if (!differenceMatrix.passes) {
    throw Object.assign(new Error('A direction pair scored 0–5 and requires a targeted rewrite'), {
      code: 'DIRECTIONS_NOT_DISTINCT',
      differenceMatrix,
      repairDirectionIds: differenceMatrix.repairDirectionIds
    });
  }
  return Object.freeze({ audienceBoundary, directions, differenceMatrix });
}
