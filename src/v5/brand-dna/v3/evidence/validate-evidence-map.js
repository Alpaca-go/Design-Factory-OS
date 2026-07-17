import { arrayValue, enumValue, objectValue, stringArray, stringValue } from '../../runtime-contracts.js';

const CATEGORIES = ['brand-identity', 'industry', 'business-model', 'audience', 'need', 'capability', 'mission', 'positioning', 'promise', 'value', 'personality', 'culture', 'visual-intent', 'constraint', 'asset'];

export function validateEvidenceMap(value, prepared) {
  const map = objectValue(value?.evidenceMap || value, 'evidenceMap');
  const sourceIds = new Set(prepared.sourceDocuments.map((item) => item.sourceId));
  const chunkIds = new Set(prepared.chunks.map((item) => item.chunkId));
  const evidence = arrayValue(map.evidence, 'evidenceMap.evidence', { min: 1 }).map((raw, index) => {
    const path = `evidenceMap.evidence[${index}]`;
    const item = objectValue(raw, path);
    const sourceId = stringValue(item.sourceId, `${path}.sourceId`);
    const chunkId = stringValue(item.chunkId, `${path}.chunkId`);
    if (!sourceIds.has(sourceId) || !chunkIds.has(chunkId)) throw new Error(`${path} 引用了未知来源`);
    return {
      evidenceId: `evidence-${String(index + 1).padStart(4, '0')}`,
      category: enumValue(item.category, CATEGORIES, `${path}.category`),
      statement: stringValue(item.statement, `${path}.statement`, { maxLength: 240 }),
      quote: stringValue(item.quote, `${path}.quote`, { maxLength: 120 }),
      sourceId,
      chunkId,
      sectionPath: stringArray(item.sectionPath, `${path}.sectionPath`, { min: 1 }),
      confidence: enumValue(item.confidence, ['high', 'medium', 'low'], `${path}.confidence`)
    };
  });
  const ids = new Set(evidence.map((item) => item.evidenceId));
  const validateRefs = (refs, path) => {
    const result = stringArray(refs, path, { min: 1 });
    if (result.some((id) => !ids.has(id))) throw new Error(`${path} 包含未知 Evidence ID`);
    return result;
  };
  return {
    evidence,
    conflicts: arrayValue(map.conflicts || [], 'evidenceMap.conflicts').map((raw, index) => {
      const item = objectValue(raw, `evidenceMap.conflicts[${index}]`);
      return { conflictId: `conflict-${index + 1}`, topic: stringValue(item.topic, `evidenceMap.conflicts[${index}].topic`), evidenceIds: validateRefs(item.evidenceIds, `evidenceMap.conflicts[${index}].evidenceIds`), description: stringValue(item.description, `evidenceMap.conflicts[${index}].description`) };
    }),
    missingInformation: arrayValue(map.missingInformation || [], 'evidenceMap.missingInformation').map((raw, index) => {
      const item = objectValue(raw, `evidenceMap.missingInformation[${index}]`);
      return { missingId: `missing-${index + 1}`, topic: stringValue(item.topic, `evidenceMap.missingInformation[${index}].topic`), whyNeeded: stringValue(item.whyNeeded, `evidenceMap.missingInformation[${index}].whyNeeded`) };
    })
  };
}
