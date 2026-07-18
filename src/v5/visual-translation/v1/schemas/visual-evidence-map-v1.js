import { arrayValue, enumValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';

export const VISUAL_EVIDENCE_TYPES = Object.freeze([
  'identity', 'business-context', 'audience', 'brand-positioning', 'brand-promise',
  'capability', 'relationship', 'emotion', 'culture', 'aesthetic-intent',
  'visual-asset', 'application', 'constraint', 'prohibited', 'uncertainty'
]);
export const CLAIM_STATUSES = Object.freeze(['confirmed', 'reasonable-inference', 'suggested', 'missing', 'conflicting']);

function normalizeQuote(value) { return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim(); }

function canonicalCharacters(value, includeOffsets = false) {
  const text = String(value || '');
  const characters = [];
  const offsets = [];
  for (let start = 0; start < text.length;) {
    const original = String.fromCodePoint(text.codePointAt(start));
    const end = start + original.length;
    for (const normalized of original.normalize('NFKC').toLocaleLowerCase('zh-CN')) {
      if (!/[\p{L}\p{N}]/u.test(normalized)) continue;
      characters.push(normalized);
      if (includeOffsets) offsets.push({ start, end });
    }
    start = end;
  }
  return { value: characters.join(''), offsets };
}

export function resolveGroundedQuote(quote, chunkText) {
  const requested = normalizeQuote(quote);
  const chunk = String(chunkText || '');
  if (chunk.includes(requested)) return requested;
  const canonicalQuote = canonicalCharacters(requested).value;
  const canonicalChunk = canonicalCharacters(chunk, true);
  if (!canonicalQuote) return null;
  const start = canonicalChunk.value.indexOf(canonicalQuote);
  if (start < 0) return null;
  const first = canonicalChunk.offsets[start];
  const last = canonicalChunk.offsets[start + canonicalQuote.length - 1];
  if (!first || !last) return null;
  let end = last.end;
  const trailing = chunk.slice(end).match(/^[）】》」』”’\)\]\}]/u)?.[0];
  if (trailing && requested.normalize('NFKC').includes(trailing.normalize('NFKC'))) end += trailing.length;
  return chunk.slice(first.start, end).trim();
}

function quoteCandidates(text) {
  const candidates = [];
  const seen = new Set();
  const add = (value) => {
    const candidate = String(value || '').trim().replace(/^[-·•]\s*/u, '');
    const canonical = canonicalCharacters(candidate).value;
    if (canonical.length < 2 || candidate.length > 120 || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  };
  for (const line of String(text || '').split(/\n+/u)) {
    add(line);
    for (const sentence of line.match(/[^。！？!?；;]+[。！？!?；;]?/gu) || []) {
      add(sentence);
      if (sentence.length > 120) {
        for (const clause of sentence.match(/[^，,、]+[，,、]?/gu) || []) add(clause);
      }
    }
  }
  if (!candidates.length) add(String(text || '').slice(0, 120));
  return candidates;
}

function ngrams(value, size = 2) {
  const canonical = canonicalCharacters(value).value;
  if (!canonical) return new Set();
  if (canonical.length <= size) return new Set([canonical]);
  const values = new Set();
  for (let index = 0; index <= canonical.length - size; index += 1) values.add(canonical.slice(index, index + size));
  return values;
}

function lexicalFit(target, candidate) {
  const targetGrams = ngrams(target);
  const candidateGrams = ngrams(candidate);
  if (!targetGrams.size || !candidateGrams.size) return 0;
  let shared = 0;
  for (const gram of targetGrams) if (candidateGrams.has(gram)) shared += 1;
  return (shared / targetGrams.size) * 0.7 + (shared / candidateGrams.size) * 0.3;
}

export function groundEvidenceQuote({ requestedQuote, statement, sourceId, chunkId }, prepared) {
  const selected = prepared.chunks.find((chunk) => chunk.chunkId === chunkId && chunk.sourceId === sourceId);
  if (!selected) throw Object.assign(new Error('证据引用了未知或不匹配的来源'), { code: 'FAILED_SCHEMA' });

  const direct = resolveGroundedQuote(requestedQuote, selected.text);
  if (direct) return { sourceId, chunkId, shortestQuote: direct, repaired: false };

  for (const chunk of prepared.chunks) {
    const exact = resolveGroundedQuote(requestedQuote, chunk.text);
    if (exact) return { sourceId: chunk.sourceId, chunkId: chunk.chunkId, shortestQuote: exact, repaired: true };
  }

  let best = null;
  for (const chunk of prepared.chunks) {
    for (const candidate of quoteCandidates(chunk.text)) {
      const score = lexicalFit(requestedQuote, candidate) * 0.65
        + lexicalFit(statement, candidate) * 0.35
        + (chunk.chunkId === chunkId ? 0.04 : 0);
      if (!best || score > best.score || (score === best.score && candidate.length < best.shortestQuote.length)) {
        best = { sourceId: chunk.sourceId, chunkId: chunk.chunkId, shortestQuote: candidate, repaired: true, score };
      }
    }
  }
  if (!best) throw Object.assign(new Error('引用 Chunk 中没有可用的原文句子'), { code: 'FAILED_SCHEMA' });
  return best;
}

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
    const statement = stringValue(item.statement, `${path}.statement`, { maxLength: 240 });
    const requestedQuote = stringValue(item.shortestQuote, `${path}.shortestQuote`);
    const grounded = groundEvidenceQuote({ requestedQuote, statement, sourceId, chunkId }, prepared);
    return {
      evidenceId: item.evidenceId ? stringValue(item.evidenceId, `${path}.evidenceId`) : `VE${String(index + 1).padStart(3, '0')}`,
      sourceId: grounded.sourceId,
      chunkId: grounded.chunkId,
      type: enumValue(item.type, VISUAL_EVIDENCE_TYPES, `${path}.type`),
      statement,
      status: enumValue(item.status, CLAIM_STATUSES, `${path}.status`),
      shortestQuote: grounded.shortestQuote,
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
