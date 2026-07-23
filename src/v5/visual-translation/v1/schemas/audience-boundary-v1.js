import { arrayValue, enumValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';

export const BUSINESS_MODELS = Object.freeze(['b2b', 'b2c', 'b2b2c', 'unknown']);
export const CONSUMER_VISUAL_POLICIES = Object.freeze(['core_allowed', 'auxiliary_only', 'excluded', 'unknown']);

function validateAudienceList(value, path, evidenceIds, includeReason = false) {
  return arrayValue(value || [], path).map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    const item = objectValue(raw, itemPath);
    const refs = stringArray(item.evidenceIds || [], `${itemPath}.evidenceIds`);
    if (refs.some((id) => !evidenceIds.has(id))) {
      throw Object.assign(new Error(`${itemPath}.evidenceIds contains unknown evidence`), { code: 'FAILED_SCHEMA', path: itemPath });
    }
    return {
      label: stringValue(item.label, `${itemPath}.label`, { maxLength: 160 }),
      ...(includeReason ? { reason: stringValue(item.reason, `${itemPath}.reason`, { maxLength: 240 }) } : {}),
      evidenceIds: refs
    };
  });
}

export function validateAudienceBoundary(value, evidence = []) {
  const root = objectValue(value, 'audienceBoundary');
  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  const businessModelEvidenceIds = stringArray(root.businessModelEvidenceIds || [], 'audienceBoundary.businessModelEvidenceIds');
  const policyEvidenceIds = stringArray(root.consumerVisualPolicyEvidenceIds || [], 'audienceBoundary.consumerVisualPolicyEvidenceIds');
  for (const [refs, path] of [[businessModelEvidenceIds, 'businessModelEvidenceIds'], [policyEvidenceIds, 'consumerVisualPolicyEvidenceIds']]) {
    if (refs.some((id) => !evidenceIds.has(id))) throw Object.assign(new Error(`audienceBoundary.${path} contains unknown evidence`), { code: 'FAILED_SCHEMA', path: `audienceBoundary.${path}` });
  }
  const result = {
    businessModel: enumValue(root.businessModel, BUSINESS_MODELS, 'audienceBoundary.businessModel'),
    businessModelEvidenceIds,
    primaryAudience: validateAudienceList(root.primaryAudience, 'audienceBoundary.primaryAudience', evidenceIds),
    excludedAudience: validateAudienceList(root.excludedAudience, 'audienceBoundary.excludedAudience', evidenceIds, true),
    consumerVisualPolicy: enumValue(root.consumerVisualPolicy, CONSUMER_VISUAL_POLICIES, 'audienceBoundary.consumerVisualPolicy'),
    consumerVisualPolicyEvidenceIds: policyEvidenceIds
  };
  if (result.businessModel === 'b2b' && !['auxiliary_only', 'excluded'].includes(result.consumerVisualPolicy)) {
    throw Object.assign(new Error('B2B projects must keep consumers auxiliary or excluded'), { code: 'FAILED_SCHEMA', path: 'audienceBoundary.consumerVisualPolicy' });
  }
  return Object.freeze(result);
}

export function assertAudienceBoundaryMatches(value, expected, path = 'audienceBoundary') {
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw Object.assign(new Error(`${path} must exactly preserve the Evidence-stage audience boundary`), { code: 'FAILED_SCHEMA', path });
  }
  return structuredClone(expected);
}
