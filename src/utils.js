import fs from 'node:fs/promises';
import path from 'node:path';

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);

export function normalizeHex(value) {
  if (!value) return null;
  const raw = String(value).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split('').map((x) => x + x).join('').toUpperCase()}`;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toUpperCase()}`;
  return null;
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function slug(value) {
  return String(value).trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

export function relativePortable(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeText(file, content) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, content.replace(/\r?\n/g, '\n'), 'utf8');
}

export async function readJson(file, fallback = {}) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`配置文件无法读取：${file}（${error.message}）`);
  }
}

export function mdCell(value) {
  return String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

export function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

export function extractXmlText(xml) {
  return decodeEntities(String(xml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function nowIso() {
  return new Date().toISOString();
}
