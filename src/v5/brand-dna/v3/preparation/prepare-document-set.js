import crypto from 'node:crypto';

const TASK_WORDS = /(?:品牌\s*DNA\s*(?:合成|提炼)|核心分析|分析报告|策划案|项目资料|生成|输出|测试)/gi;

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function cleanProjectName(value, fallback = '品牌项目') {
  const cleaned = String(value || '').replace(TASK_WORDS, '').replace(/[\s_\-—|]+$/g, '').trim();
  return cleaned.length >= 2 ? cleaned : fallback;
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

export function prepareDocumentSet(input) {
  const sourceDocuments = [];
  const chunks = [];
  const seenChunkHashes = new Set();
  const projectNameCandidates = [];
  for (const document of input.corpus.documents || []) {
    const originalFileName = String(document.filename || `${document.id}.txt`);
    const displayName = originalFileName.replace(/\.[^.]+$/, '');
    sourceDocuments.push({
      sourceId: document.id,
      originalFileName,
      displayName,
      fileType: document.sourceType,
      contentHash: hash(document.rawText),
      characterCount: document.characterCount || String(document.rawText || '').length
    });
    if (document.title) projectNameCandidates.push({ value: cleanProjectName(document.title), source: 'document-heading', confidence: 0.82 });
    projectNameCandidates.push({ value: cleanProjectName(displayName), source: 'file-name', confidence: 0.58 });
    const sections = document.sections?.length ? document.sections : [{ content: document.rawText }];
    sections.forEach((section, sectionIndex) => {
      splitText(section.content).forEach((text, partIndex) => {
        const contentHash = hash(text.replace(/\s+/g, ' ').trim());
        if (seenChunkHashes.has(contentHash)) return;
        seenChunkHashes.add(contentHash);
        chunks.push({
          chunkId: `chunk-${hash(`${document.id}:${sectionIndex}:${partIndex}:${contentHash}`).slice(0, 16)}`,
          sourceId: document.id,
          sectionPath: [section.heading || `段落 ${sectionIndex + 1}`, ...(partIndex ? [`分段 ${partIndex + 1}`] : [])],
          text,
          contentHash
        });
      });
    });
  }
  const documentSetHash = hash(JSON.stringify({ sourceDocuments, chunks: chunks.map(({ chunkId, sourceId, contentHash }) => ({ chunkId, sourceId, contentHash })) }));
  return Object.freeze({
    projectId: input.projectId,
    sourceDocuments,
    chunks,
    projectNameCandidates,
    documentSetHash,
    preparedAt: new Date().toISOString()
  });
}
