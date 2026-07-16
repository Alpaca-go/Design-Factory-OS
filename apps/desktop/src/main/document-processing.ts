import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type {
  BrandStrategyCorpus,
  DocumentSection,
  DocumentTable,
  NormalizedDocument
} from '../shared/types';

const MAX_DOCUMENT_CHARACTERS = 500_000;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripXml(value: string): string {
  return decodeXml(value.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')).trim();
}

function titleFromSections(filename: string, sections: DocumentSection[]): string {
  return sections.find((section) => section.heading)?.heading || path.parse(filename).name;
}

function parseMarkdownSections(rawText: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let current: DocumentSection = { content: '' };
  for (const line of rawText.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      if (current.heading || current.content.trim()) sections.push({ ...current, content: current.content.trim() });
      current = { heading: heading[2]?.trim(), level: heading[1]?.length, content: '' };
    } else {
      current.content += `${line}\n`;
    }
  }
  if (current.heading || current.content.trim()) sections.push({ ...current, content: current.content.trim() });
  return sections;
}

function decodeText(buffer: Buffer): { text: string; warning?: string } {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    return { text: buffer.subarray(3).toString('utf8') };
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    return { text: buffer.subarray(2).toString('utf16le') };
  }
  const utf8 = buffer.toString('utf8');
  const utf8ReplacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (!utf8ReplacementCount) return { text: utf8 };
  try {
    const gb18030 = new TextDecoder('gb18030').decode(buffer);
    const gbReplacementCount = (gb18030.match(/\uFFFD/g) || []).length;
    if (gbReplacementCount < utf8ReplacementCount) {
      return { text: gb18030, warning: '文本已按 GB18030 编码读取' };
    }
  } catch { /* UTF-8 fallback below */ }
  return { text: utf8, warning: '文本包含无法确认的字符编码' };
}

async function parseTextDocument(filename: string, extension: string): Promise<NormalizedDocument> {
  const decoded = decodeText(await fs.readFile(filename));
  const rawText = decoded.text.trim();
  if (!rawText) throw new Error(`未从文档中提取到有效文本：${path.basename(filename)}`);
  const markdown = extension === '.md' || extension === '.markdown';
  const sections = markdown ? parseMarkdownSections(rawText) : [{ content: rawText }];
  return {
    id: crypto.randomUUID(),
    filename: path.basename(filename),
    mimeType: markdown ? 'text/markdown' : 'text/plain',
    sourceType: markdown ? 'markdown' : 'text',
    title: titleFromSections(filename, sections),
    rawText,
    sections,
    tables: [],
    characterCount: rawText.length,
    parseWarnings: decoded.warning ? [decoded.warning] : []
  };
}

function paragraphText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1] || ''))
    .join('')
    .trim();
}

function docxSections(xml: string): { sections: DocumentSection[]; tables: DocumentTable[]; rawText: string } {
  const sections: DocumentSection[] = [];
  const tables: DocumentTable[] = [];
  const blocks = [...xml.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g)].map((match) => match[0]);
  const rawParts: string[] = [];
  let current: DocumentSection = { content: '' };
  for (const block of blocks) {
    if (block.startsWith('<w:tbl')) {
      const rows = [...block.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((rowMatch) =>
        [...(rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g))]
          .map((cell) => paragraphText(cell[0]).replace(/\s+/g, ' ').trim())
      ).filter((row) => row.some(Boolean));
      if (rows.length) {
        const markdown = [
          `| ${rows[0]!.map((cell) => cell || ' ').join(' | ')} |`,
          `| ${rows[0]!.map(() => '---').join(' | ')} |`,
          ...rows.slice(1).map((row) => `| ${row.map((cell) => cell || ' ').join(' | ')} |`)
        ].join('\n');
        tables.push({ rows, markdown });
        current.content += `${markdown}\n\n`;
        rawParts.push(markdown);
      }
      continue;
    }
    const value = paragraphText(block);
    if (!value) continue;
    const style = block.match(/<w:pStyle[^>]*w:val="([^"]+)"/)?.[1] || '';
    const headingMatch = style.match(/(?:Heading|标题)([1-6])/i);
    if (headingMatch) {
      if (current.heading || current.content.trim()) sections.push({ ...current, content: current.content.trim() });
      current = { heading: value, level: Number(headingMatch[1]), content: '' };
    } else {
      const listItem = /<w:numPr>/.test(block);
      current.content += `${listItem ? '- ' : ''}${value}\n`;
    }
    rawParts.push(value);
  }
  if (current.heading || current.content.trim()) sections.push({ ...current, content: current.content.trim() });
  return { sections, tables, rawText: rawParts.join('\n\n').trim() };
}

async function parseDocx(filename: string): Promise<NormalizedDocument> {
  let zip: AdmZip;
  try { zip = new AdmZip(filename); } catch { throw new Error(`无法读取 DOCX 内容\n文件：${path.basename(filename)}\n原因：文档损坏或格式不受支持`); }
  const entry = zip.getEntry('word/document.xml');
  if (!entry) throw new Error(`无法读取 DOCX 内容\n文件：${path.basename(filename)}\n原因：缺少 word/document.xml`);
  const parsed = docxSections(entry.getData().toString('utf8'));
  if (!parsed.rawText) throw new Error(`未从文档中提取到有效文本：${path.basename(filename)}`);
  return {
    id: crypto.randomUUID(),
    filename: path.basename(filename),
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sourceType: 'docx',
    title: titleFromSections(filename, parsed.sections),
    rawText: parsed.rawText,
    sections: parsed.sections,
    tables: parsed.tables,
    characterCount: parsed.rawText.length,
    parseWarnings: []
  };
}

async function parsePdf(filename: string): Promise<NormalizedDocument> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = new Uint8Array(await fs.readFile(filename));
  const loadingTask = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
  const pdf = await loadingTask.promise.catch(() => {
    throw new Error(`无法读取 PDF 内容\n文件：${path.basename(filename)}\n原因：文档损坏、加密或格式不受支持`);
  });
  const sections: DocumentSection[] = [];
  const warnings: string[] = [];
  const rawParts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] || 0);
      const x = Number(item.transform[4] || 0);
      const line = lines.get(y) || [];
      line.push({ x, text: item.str.trim() });
      lines.set(y, line);
    }
    const pageText = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, line]) => line.sort((a, b) => a.x - b.x).map((item) => item.text).join(' '))
      .join('\n')
      .trim();
    if (pageText) {
      sections.push({ heading: `第 ${pageNumber} 页`, level: 2, content: pageText, page: pageNumber });
      rawParts.push(`[第 ${pageNumber} 页]\n${pageText}`);
    } else {
      warnings.push(`第 ${pageNumber} 页未提取到文本，可能是扫描页或纯视觉页面`);
    }
  }
  const rawText = rawParts.join('\n\n').trim();
  if (!rawText) {
    throw new Error(`未从文档中提取到有效文本。\n文件：${path.basename(filename)}\n请检查文档是否为扫描件，或更换支持视觉输入的分析方式。`);
  }
  return {
    id: crypto.randomUUID(),
    filename: path.basename(filename),
    mimeType: 'application/pdf',
    sourceType: 'pdf',
    title: path.parse(filename).name,
    rawText,
    sections,
    tables: [],
    pageCount: pdf.numPages,
    characterCount: rawText.length,
    parseWarnings: warnings
  };
}

export async function parseBrandDocument(filename: string): Promise<NormalizedDocument> {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.pdf') return parsePdf(filename);
  if (extension === '.docx') return parseDocx(filename);
  if (extension === '.md' || extension === '.markdown' || extension === '.txt') {
    return parseTextDocument(filename, extension);
  }
  throw new Error(`不支持的品牌策划文档格式：${path.basename(filename)}`);
}

function truncateAtSectionBoundary(document: NormalizedDocument): { text: string; warning?: string } {
  if (document.rawText.length <= MAX_DOCUMENT_CHARACTERS) return { text: document.rawText };
  const parts: string[] = [];
  let length = 0;
  for (const section of document.sections) {
    const rendered = `${section.heading ? `## ${section.heading}\n` : ''}${section.content}\n`;
    if (length + rendered.length > MAX_DOCUMENT_CHARACTERS) break;
    parts.push(rendered);
    length += rendered.length;
  }
  return {
    text: parts.join('\n').trim(),
    warning: `${document.filename} 内容较长，系统已按章节分段并在 ${MAX_DOCUMENT_CHARACTERS.toLocaleString('zh-CN')} 字符边界内合并`
  };
}

export function buildBrandStrategyCorpus(documents: NormalizedDocument[]): BrandStrategyCorpus {
  const warnings = documents.flatMap((document) => document.parseWarnings);
  const sourceIndex = documents.flatMap((document) =>
    document.sections.map((section, index) => ({
      documentId: document.id,
      filename: document.filename,
      section: section.heading || `段落 ${index + 1}`,
      page: section.page,
      characterCount: section.content.length
    }))
  );
  const merged: string[] = [];
  for (const document of documents) {
    const bounded = truncateAtSectionBoundary(document);
    if (bounded.warning) warnings.push(bounded.warning);
    merged.push(`===== 文档开始 =====
文档 ID：${document.id}
文件名：${document.filename}
文档标题：${document.title || '未识别'}
类型：${document.sourceType}
页数：${document.pageCount || '未知'}
字符数：${document.characterCount}

${bounded.text}
===== 文档结束 =====`);
  }
  return { documents, sourceIndex, mergedText: merged.join('\n\n'), warnings };
}
