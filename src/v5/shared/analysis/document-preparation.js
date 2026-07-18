import crypto from 'node:crypto';

const ROLE_RULES = Object.freeze([
  ['visual-guideline', /VI|视觉(?:规范|指南|系统)|brand\s*guideline|visual\s*guideline/i],
  ['creative-brief', /creative\s*brief|创意简报|创意任务书/i],
  ['brand-strategy', /品牌(?:策略|战略|定位|策划)|brand\s*(?:strategy|positioning)/i],
  ['product-information', /产品(?:资料|说明|手册)|product\s*(?:brief|information)/i],
  ['market-research', /市场(?:研究|调研)|竞品|market\s*research|competitor/i],
  ['reference', /参考|案例|reference|inspiration/i]
]);

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function splitText(text, maximum = 4000) {
  const paragraphs = String(text || '').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maximum) {
      chunks.push(current);
      current = '';
    }
    if (paragraph.length <= maximum) current += `${current ? '\n\n' : ''}${paragraph}`;
    else {
      if (current) { chunks.push(current); current = ''; }
      for (let offset = 0; offset < paragraph.length; offset += maximum) chunks.push(paragraph.slice(offset, offset + maximum));
    }
  }
  if (current) chunks.push(current);
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
      splitText(section.content).forEach((text, partIndex) => {
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
