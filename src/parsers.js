import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { extractXmlText, normalizeHex, unique } from './utils.js';

function u16(buffer, offset) { return buffer.readUInt16LE(offset); }
function u32(buffer, offset) { return buffer.readUInt32LE(offset); }

export function parseZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (u32(buffer, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件（缺少中央目录）');
  const count = u16(buffer, eocd + 10);
  let offset = u32(buffer, eocd + 16);
  const entries = [];
  for (let i = 0; i < count && offset + 46 <= buffer.length; i++) {
    if (u32(buffer, offset) !== 0x02014b50) break;
    const method = u16(buffer, offset + 10);
    const compressedSize = u32(buffer, offset + 20);
    const size = u32(buffer, offset + 24);
    const nameLength = u16(buffer, offset + 28);
    const extraLength = u16(buffer, offset + 30);
    const commentLength = u16(buffer, offset + 32);
    const localOffset = u32(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    entries.push({ name, method, compressedSize, size, localOffset, isDirectory: name.endsWith('/') });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const readEntry = (entry) => {
    const local = entry.localOffset;
    if (u32(buffer, local) !== 0x04034b50) throw new Error(`ZIP 条目损坏：${entry.name}`);
    const start = local + 30 + u16(buffer, local + 26) + u16(buffer, local + 28);
    const data = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`暂不支持 ZIP 压缩算法 ${entry.method}`);
  };
  return { entries, readEntry };
}

function pngMetadata(buffer) {
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'PNG' };
}

function jpegMetadata(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) { i++; continue; }
    const marker = buffer[i + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5), format: 'JPEG' };
    }
    if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
    const length = buffer.readUInt16BE(i + 2);
    if (length < 2) break;
    i += 2 + length;
  }
  return { width: null, height: null, format: 'JPEG' };
}

export function imageMetadata(buffer, ext) {
  const png = pngMetadata(buffer); if (png) return png;
  const jpg = jpegMetadata(buffer); if (jpg) return jpg;
  if (buffer.toString('ascii', 0, 3) === 'GIF' && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), format: 'GIF' };
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buffer.toString('ascii', 12, 16);
    if (kind === 'VP8X' && buffer.length >= 30) {
      return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3), format: 'WEBP' };
    }
    return { width: null, height: null, format: 'WEBP' };
  }
  if (ext === '.svg') {
    const text = buffer.toString('utf8', 0, Math.min(buffer.length, 200000));
    const tag = text.match(/<svg\b[^>]*>/i)?.[0] || '';
    const width = Number(tag.match(/\bwidth=["']([\d.]+)/i)?.[1]) || null;
    const height = Number(tag.match(/\bheight=["']([\d.]+)/i)?.[1]) || null;
    const viewBox = tag.match(/\bviewBox=["'][^"']*?([\d.]+)[ ,]+([\d.]+)["']/i);
    return { width: width || Number(viewBox?.[1]) || null, height: height || Number(viewBox?.[2]) || null, format: 'SVG' };
  }
  return { width: null, height: null, format: ext.slice(1).toUpperCase() };
}

export function parsePdf(buffer) {
  const text = buffer.toString('latin1');
  const pages = [...text.matchAll(/\/Type\s*\/Page\b/g)].length;
  const metadata = {};
  for (const key of ['Title', 'Author', 'Subject']) {
    const match = text.match(new RegExp(`/${key}\\s*\\(([^)]{1,500})\\)`));
    if (match) metadata[key.toLowerCase()] = match[1].replace(/\\([()\\])/g, '$1');
  }
  const snippets = [...text.matchAll(/\(([^()]{4,120})\)\s*Tj/g)].slice(0, 100).map((m) => m[1]);
  return { pages, metadata, text: snippets.join(' ') };
}

export function parsePresentation(buffer) {
  const zip = parseZip(buffer);
  const slides = zip.entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.name));
  const texts = [];
  const colors = [];
  const fonts = [];
  const wanted = zip.entries.filter((e) => /^(ppt\/slides\/slide\d+\.xml|ppt\/theme\/[^/]+\.xml)$/i.test(e.name));
  for (const entry of wanted) {
    try {
      const xml = zip.readEntry(entry).toString('utf8');
      texts.push(extractXmlText(xml));
      colors.push(...[...xml.matchAll(/(?:srgbClr|sysClr)[^>]*(?:val|lastClr)=["']([0-9A-F]{6})["']/gi)].map((m) => normalizeHex(m[1])));
      fonts.push(...[...xml.matchAll(/typeface=["']([^"']+)["']/gi)].map((m) => m[1]).filter((x) => !x.startsWith('+')));
    } catch { /* 单个 XML 损坏不影响其余素材盘点 */ }
  }
  return { slides: slides.length, text: texts.join(' '), colors: unique(colors), fonts: unique(fonts), entries: zip.entries.length };
}

export async function parseFile(file, ext) {
  const buffer = await fs.readFile(file);
  if (['.pptx', '.potx', '.ppsx'].includes(ext)) return parsePresentation(buffer);
  if (ext === '.pdf') return parsePdf(buffer);
  if (ext === '.zip') {
    const zip = parseZip(buffer);
    return { entries: zip.entries.length, files: zip.entries.filter((e) => !e.isDirectory).map((e) => e.name) };
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(ext)) {
    const result = imageMetadata(buffer, ext);
    if (ext === '.svg') {
      const xml = buffer.toString('utf8');
      result.colors = unique([...xml.matchAll(/#[0-9a-f]{3,6}\b/gi)].map((m) => normalizeHex(m[0])));
      result.text = extractXmlText(xml);
    }
    return result;
  }
  if (['.txt', '.md', '.json', '.csv'].includes(ext)) return { text: buffer.toString('utf8').slice(0, 200000) };
  return {};
}
