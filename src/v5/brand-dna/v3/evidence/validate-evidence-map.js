import { arrayValue, enumValue, objectValue, stringArray, stringValue } from '../../runtime-contracts.js';

const CATEGORIES = ['brand-identity', 'industry', 'business-model', 'offering', 'audience', 'need', 'capability', 'mission', 'positioning', 'promise', 'value', 'personality', 'culture', 'visual-intent', 'constraint', 'asset'];
const CATEGORY_ALIASES = Object.freeze({
  brand: 'brand-identity', identity: 'brand-identity', 'brand-name': 'brand-identity', history: 'brand-identity', heritage: 'brand-identity',
  category: 'industry', market: 'industry', business: 'business-model', 'business-role': 'business-model', role: 'business-model', 'development-stage': 'business-model', development: 'business-model', strategy: 'business-model', channel: 'business-model',
  product: 'offering', service: 'offering', solution: 'offering', 'product-service': 'offering', offering: 'offering',
  customer: 'audience', user: 'audience', 'target-audience': 'audience', 'user-need': 'need', 'customer-need': 'need', 'pain-point': 'need', 'jobs-to-be-done': 'need',
  resource: 'capability', qualification: 'capability', technology: 'capability', operation: 'capability', 'supply-chain': 'capability', differentiation: 'capability',
  vision: 'mission', goal: 'mission', objective: 'mission', 'brand-positioning': 'positioning', competition: 'positioning', competitor: 'positioning', competitive: 'positioning', slogan: 'promise', claim: 'promise', 'value-proposition': 'value', values: 'value', emotion: 'value',
  character: 'personality', tone: 'personality', behavior: 'personality', cultural: 'culture', aesthetic: 'visual-intent', visual: 'visual-intent', risk: 'constraint', boundary: 'constraint', compliance: 'constraint', regulation: 'constraint', logo: 'asset'
});

function evidenceCategory(value, path) {
  const raw = stringValue(value, path).toLowerCase().replaceAll('_', '-').trim();
  const category = CATEGORY_ALIASES[raw] || raw;
  if (!CATEGORIES.includes(category)) throw Object.assign(new Error(`${path} 收到未知类别“${value}”；必须映射为 ${CATEGORIES.join('|')} 之一`), { code: 'EVIDENCE_CATEGORY_UNKNOWN', path, received: value });
  return category;
}

function compactQuote(value, path) {
  const quote = stringValue(value, path).replace(/\s+/g, ' ').trim();
  return { quote: quote.length > 120 ? `${quote.slice(0, 119)}…` : quote, quoteTruncated: quote.length > 120 };
}

export function validateEvidenceMap(value, prepared) {
  const map = objectValue(value?.evidenceMap || value, 'evidenceMap');
  const sourceIds = new Set(prepared.sourceDocuments.map((item) => item.sourceId));
  const chunkIds = new Set(prepared.chunks.map((item) => item.chunkId));
  const rawIdMap = new Map();
  const evidence = arrayValue(map.evidence, 'evidenceMap.evidence', { min: 1 }).map((raw, index) => {
    const path = `evidenceMap.evidence[${index}]`;
    const item = objectValue(raw, path);
    const sourceId = stringValue(item.sourceId, `${path}.sourceId`);
    const chunkId = stringValue(item.chunkId, `${path}.chunkId`);
    if (!sourceIds.has(sourceId) || !chunkIds.has(chunkId)) throw new Error(`${path} 引用了未知来源`);
    const normalizedQuote = compactQuote(item.quote, `${path}.quote`);
    const evidenceId = `evidence-${String(index + 1).padStart(4, '0')}`;
    const rawEvidenceId = typeof item.evidenceId === 'string' && item.evidenceId.trim() ? item.evidenceId.trim() : evidenceId;
    if (rawIdMap.has(rawEvidenceId)) throw new Error(`${path}.evidenceId 与前序证据重复：${rawEvidenceId}`);
    rawIdMap.set(rawEvidenceId, evidenceId);
    rawIdMap.set(evidenceId, evidenceId);
    return {
      evidenceId,
      category: evidenceCategory(item.category, `${path}.category`),
      statement: stringValue(item.statement, `${path}.statement`, { maxLength: 240 }),
      quote: normalizedQuote.quote,
      quoteTruncated: normalizedQuote.quoteTruncated,
      sourceId,
      chunkId,
      sectionPath: stringArray(item.sectionPath, `${path}.sectionPath`, { min: 1 }),
      confidence: enumValue(item.confidence, ['high', 'medium', 'low'], `${path}.confidence`)
    };
  });
  const ids = new Set(evidence.map((item) => item.evidenceId));
  const validateRefs = (refs, path) => {
    const result = stringArray(refs, path, { min: 1 }).map((id) => rawIdMap.get(id) || id);
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
