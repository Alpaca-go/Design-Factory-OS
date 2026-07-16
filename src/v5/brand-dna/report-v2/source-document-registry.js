import path from 'node:path';
import { cleanText, uniqueText } from './markdown-sanitizer.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_WORDS = /(?:品牌\s*DNA\s*(?:合成|分析)?|深度分析|分析报告|创意转译报告|策划案)$/gi;

function withoutExtension(value) {
  const extension = path.extname(value);
  return extension ? value.slice(0, -extension.length) : value;
}

function isUuidFilename(value) {
  return UUID_PATTERN.test(withoutExtension(path.basename(cleanText(value))));
}

export function readableDocumentName(value, fallback) {
  const original = cleanText(value);
  const base = withoutExtension(path.basename(original))
    .replace(/(?:\(\d+\)){1,3}$/g, '')
    .replace(/[-_]+$/g, '')
    .trim();
  if (!base || UUID_PATTERN.test(base)) return fallback;
  return base;
}

export function sanitizeProjectIdentity(value, fallback = '待确认') {
  const cleaned = cleanText(value)
    .replace(TASK_WORDS, '')
    .replace(/[-_—–｜|·:：\s]+$/g, '')
    .trim();
  return cleaned || fallback;
}

export function createSourceDocumentRegistry(sourceDocuments = [], references = []) {
  const sourceMap = new Map();
  const candidates = [
    ...sourceDocuments.map((document) => ({
      sourceId: document.id || document.documentId,
      filename: document.originalFileName || document.originalName || document.filename,
      title: document.title,
      fileType: document.sourceType || document.fileType,
      contentHash: document.contentHash || document.sha256 || null
    })),
    ...references.map((reference) => ({
      sourceId: reference.documentId,
      filename: reference.filename,
      title: null,
      fileType: reference.fileType || null,
      contentHash: null
    }))
  ];
  for (const candidate of candidates) {
    const sourceId = cleanText(candidate.sourceId);
    if (!sourceId) continue;
    const existing = sourceMap.get(sourceId) || {};
    const preferredFilename = existing.filename && !isUuidFilename(existing.filename)
      ? existing.filename
      : candidate.filename || existing.filename;
    sourceMap.set(sourceId, {
      ...existing,
      ...candidate,
      filename: preferredFilename,
      title: candidate.title || existing.title
    });
  }
  let sequence = 0;
  return [...sourceMap.values()].map((source) => {
    sequence += 1;
    const fallback = `来源文档 ${sequence}`;
    const displayName = readableDocumentName(source.title || source.filename, fallback);
    return {
      sourceId: source.sourceId,
      originalFileName: source.filename || fallback,
      displayName,
      fileType: source.fileType || 'unknown',
      contentHash: source.contentHash || null
    };
  });
}

export function sourceDisplayNames(registry, documentIds) {
  const byId = new Map(registry.map((source) => [source.sourceId, source.displayName]));
  return uniqueText(documentIds.map((id) => byId.get(id)).filter(Boolean));
}
