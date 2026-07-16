import { cleanText } from './markdown-sanitizer.js';

const LIST_PREFIX = /^\s*(?:[-*•·▪▫◦‣⁃]+|\(?\d{1,3}[.)、])\s*/;

export function normalizeEvidenceQuote(value, maximum = 800) {
  const lines = String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(LIST_PREFIX, '').trim())
    .filter(Boolean);
  const deduplicated = lines.filter((line, index) => line !== lines[index - 1]);
  const normalized = cleanText(deduplicated.join(' '))
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([，。；：！？、])/g, '$1')
    .replace(/([，。；：！？、])\s+/g, '$1');
  return normalized.length > maximum
    ? `${normalized.slice(0, Math.max(1, maximum - 1)).trim()}…`
    : normalized;
}

export function shortEvidenceQuote(value) {
  return normalizeEvidenceQuote(value, 160);
}
