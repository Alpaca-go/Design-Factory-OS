import { arrayValue, enumValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';

export const VISUAL_EVIDENCE_TYPES = Object.freeze([
  'identity', 'business-context', 'audience', 'brand-positioning', 'brand-promise',
  'capability', 'relationship', 'emotion', 'culture', 'aesthetic-intent',
  'visual-asset', 'application', 'constraint', 'prohibited', 'uncertainty'
]);
export const CLAIM_STATUSES = Object.freeze(['confirmed', 'reasonable-inference', 'suggested', 'missing', 'conflicting']);

function normalizeQuote(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

export function validateVisualEvidenceMap(value, prepared) {
  const root = objectValue(value?.visualEvidenceMap || value, 'visualEvidenceMap');
  const sourceIds = new Set(prepared.sourceDocuments.map((item) => item.sourceId));
  const chunks = new Map(prepared.chunks.map((item) => [item.chunkId, item]));
  const evidence = arrayValue(root.evidence, 'visualEvidenceMap.evidence', { min: 5 }).map((raw, index) => {
    const path = `visualEvidenceMap.evidence[${index}]`;
    const item = objectValue(raw, path);
    const sourceId = stringValue(item.sourceId, `${path}.sourceId`);
    const chunkId = stringValue(item.chunkId, `${path}.chunkId`);
    const chunk = chunks.get(chunkId);
    if (!sourceIds.has(sourceId) || !chunk || chunk.sourceId !== sourceId) throw Object.assign(new Error(`${path} 引用了未知或不匹配的来源`), { code: 'FAILED_SCHEMA', path });
    const shortestQuote = stringValue(item.shortestQuote, `${path}.shortestQuote`, { maxLength: 120 });
    if (!normalizeQuote(chunk.text).includes(normalizeQuote(shortestQuote))) throw Object.assign(new Error(`${path}.shortestQuote 不存在于引用 Chunk`), { code: 'FAILED_SCHEMA', path: `${path}.shortestQuote` });
    return {
      evidenceId: item.evidenceId ? stringValue(item.evidenceId, `${path}.evidenceId`) : `VE${String(index + 1).padStart(3, '0')}`,
      sourceId,
      chunkId,
      type: enumValue(item.type, VISUAL_EVIDENCE_TYPES, `${path}.type`),
      statement: stringValue(item.statement, `${path}.statement`, { maxLength: 240 }),
      status: enumValue(item.status, CLAIM_STATUSES, `${path}.status`),
      shortestQuote,
      visualImpact: stringValue(item.visualImpact, `${path}.visualImpact`, { maxLength: 300 })
    };
  });
  if (new Set(evidence.map((item) => item.evidenceId)).size !== evidence.length) throw Object.assign(new Error('visualEvidenceMap.evidence 包含重复 Evidence ID'), { code: 'FAILED_SCHEMA', path: 'visualEvidenceMap.evidence' });
  const identityRaw = objectValue(root.identity, 'visualEvidenceMap.identity');
  const identity = {
    projectName: stringValue(identityRaw.projectName, 'visualEvidenceMap.identity.projectName'),
    brandName: stringValue(identityRaw.brandName, 'visualEvidenceMap.identity.brandName'),
    status: enumValue(identityRaw.status, CLAIM_STATUSES, 'visualEvidenceMap.identity.status'),
    evidenceIds: stringArray(identityRaw.evidenceIds, 'visualEvidenceMap.identity.evidenceIds')
  };
  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  const validateRefs = (ids, path) => {
    const refs = stringArray(ids || [], path);
    if (refs.some((id) => !evidenceIds.has(id))) throw Object.assign(new Error(`${path} 包含未知 Evidence ID`), { code: 'FAILED_SCHEMA', path });
    return refs;
  };
  identity.evidenceIds = validateRefs(identity.evidenceIds, 'visualEvidenceMap.identity.evidenceIds');
  const simpleItems = (items, path) => arrayValue(items || [], path).map((raw, index) => {
    const item = objectValue(raw, `${path}[${index}]`);
    return { statement: stringValue(item.statement, `${path}[${index}].statement`), evidenceIds: validateRefs(item.evidenceIds, `${path}[${index}].evidenceIds`) };
  });
  return Object.freeze({
    identity,
    evidence,
    conflicts: simpleItems(root.conflicts, 'visualEvidenceMap.conflicts'),
    missingInformation: simpleItems(root.missingInformation, 'visualEvidenceMap.missingInformation'),
    lockedAssets: stringArray(root.lockedAssets || [], 'visualEvidenceMap.lockedAssets'),
    suggestedAssets: stringArray(root.suggestedAssets || [], 'visualEvidenceMap.suggestedAssets')
  });
}
