import crypto from 'node:crypto';

const ROLE_RULES = Object.freeze([
  ['visual-guideline', /VI|视觉(?:规范|指南|系统)|brand\s*guideline|visual\s*guideline/i],
  ['creative-brief', /creative\s*brief|创意简报|创意任务书/i],
  ['market-research', /市场(?:研究|调研)|竞品|market\s*research|competitor/i],
  ['brand-strategy', /品牌(?:策略|战略|定位|策划)|brand\s*(?:strategy|positioning)/i],
  ['product-information', /产品(?:资料|说明|手册)|product\s*(?:brief|information)/i],
  ['reference', /参考|案例|reference|inspiration/i]
]);

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function naturalBoundary(text, start, maximum) {
  const limit = Math.min(text.length, start + maximum);
  if (limit >= text.length) return text.length;
  const minimum = start + Math.floor(maximum * 0.55);
  const window = text.slice(minimum, limit);
  const patterns = [/\n{2,}/gu, /\n/gu, /[。！？!?；;]/gu, /[，,、]/gu, /\s/gu];
  for (const pattern of patterns) {
    let boundary = -1;
    for (const match of window.matchAll(pattern)) boundary = minimum + match.index + match[0].length;
    if (boundary > start) return boundary;
  }
  return limit;
}

export function splitTextAtNaturalBoundaries(text, maximum = 4000) {
  const value = String(text || '').trim();
  const chunks = [];
  let start = 0;
  while (start < value.length) {
    const end = naturalBoundary(value, start, maximum);
    const chunk = value.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end;
    while (start < value.length && /\s/u.test(value[start])) start += 1;
  }
  return chunks;
}

export function classifyDocumentRole(document) {
  const sample = `${document.filename || ''}\n${document.title || ''}\n${String(document.rawText || '').slice(0, 1200)}`;
  const matched = ROLE_RULES.find(([, pattern]) => pattern.test(sample));
  return matched ? { role: matched[0], confidence: 'medium' } : { role: 'unknown', confidence: 'low' };
}

export function prepareDocumentSet(input) {
  const sourceDocuments = [];
  const chunks = [];
  const seenChunkHashes = new Set();
  for (const document of input.corpus?.documents || []) {
    const originalFileName = String(document.filename || `${document.id}.txt`);
    const role = document.documentRole
      ? { role: document.documentRole, confidence: 'high' }
      : classifyDocumentRole(document);
    sourceDocuments.push({
      sourceId: document.id,
      originalFileName,
      displayName: originalFileName.replace(/\.[^.]+$/, ''),
      fileType: document.sourceType,
      documentRole: role.role,
      roleConfidence: role.confidence,
      contentHash: hash(document.rawText),
      characterCount: document.characterCount || String(document.rawText || '').length
    });
    const sections = document.sections?.length ? document.sections : [{ content: document.rawText }];
    sections.forEach((section, sectionIndex) => {
      splitTextAtNaturalBoundaries(section.content).forEach((text, partIndex) => {
        const contentHash = hash(text.replace(/\s+/g, ' ').trim());
        if (seenChunkHashes.has(contentHash)) return;
        seenChunkHashes.add(contentHash);
        chunks.push({
          chunkId: `chunk-${hash(`${document.id}:${sectionIndex}:${partIndex}:${contentHash}`).slice(0, 16)}`,
          sourceId: document.id,
          documentRole: role.role,
          sectionPath: [section.heading || `段落 ${sectionIndex + 1}`, ...(partIndex ? [`分段 ${partIndex + 1}`] : [])],
          text,
          contentHash
        });
      });
    });
  }
  if (!sourceDocuments.length || !chunks.length) throw Object.assign(new Error('没有可用于视觉转译的文档内容'), { code: 'BLOCKED_INPUT' });
  const documentSetHash = hash(JSON.stringify({
    sourceDocuments: sourceDocuments.map(({ sourceId, contentHash, documentRole }) => ({ sourceId, contentHash, documentRole })),
    chunks: chunks.map(({ chunkId, sourceId, contentHash }) => ({ chunkId, sourceId, contentHash }))
  }));
  return Object.freeze({
    projectId: input.projectId,
    sourceDocuments,
    chunks,
    documentSetHash,
    preparedAt: new Date().toISOString()
  });
}
