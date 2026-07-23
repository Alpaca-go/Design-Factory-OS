import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { buildVisualStrategyCorpus, parseStrategyDocument } from '../src/main/document-processing.ts';

function makePdf(text: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length + 34} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, 'ascii')); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output, 'ascii'); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, 'ascii');
}

test('visual translation document preparation reads Markdown, text, DOCX tables and PDF text', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-translation-docs-'));
  try {
    const markdownPath = path.join(temporary, 'brand.md'); const textPath = path.join(temporary, 'notes.txt');
    const docxPath = path.join(temporary, 'strategy.docx'); const pdfPath = path.join(temporary, 'research.pdf');
    await fs.writeFile(markdownPath, '# 九州美学\n\n## 品牌定位\n可信的医美供应链伙伴');
    await fs.writeFile(textPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('补充研究：客户需要透明履约', 'utf8')]));
    const zip = new AdmZip();
    zip.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>视觉边界</w:t></w:r></w:p><w:p><w:r><w:t>严谨而有温度</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>允许</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>安心轨迹</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`));
    zip.writeZip(docxPath); await fs.writeFile(pdfPath, makePdf('Visual strategy PDF source'));
    const documents = await Promise.all([markdownPath, textPath, docxPath, pdfPath].map(parseStrategyDocument));
    const corpus = buildVisualStrategyCorpus(documents);
    assert.equal(documents[0]!.title, '九州美学');
    assert.match(documents[1]!.rawText, /透明履约/);
    assert.match(documents[2]!.tables[0]!.markdown, /安心轨迹/);
    assert.match(documents[3]!.rawText, /Visual strategy PDF source/);
    assert.ok(corpus.sourceIndex.some((item) => item.filename === 'brand.md' && item.section === '品牌定位'));
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
