import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { buildBrandStrategyCorpus, parseBrandDocument } from '../src/main/document-processing.ts';
import { createProjectStore } from '../src/main/project-store.ts';
import type { PublicSettings } from '../src/shared/types.ts';

function makePdf(text: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length + 34} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, 'ascii');
}

function settings(dataRoot: string): PublicSettings {
  return {
    profiles: [{
      id: 'profile-test',
      displayName: 'Text Model',
      provider: 'generic',
      baseUrl: 'https://example.invalid/v1',
      modelId: 'text-only-model',
      credentialKey: 'masterpiece-os/profile-test',
      hasApiKey: true,
      isDefault: true,
      isEnabled: true,
      qualityTier: 'experimental',
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z'
    }],
    defaultProfileId: 'profile-test',
    provider: 'generic',
    baseUrl: 'https://example.invalid/v1',
    model: 'text-only-model',
    hasApiKey: true,
    defaultDataPath: dataRoot,
    cacheEnabled: true,
    logLevel: 'info',
    connectionStatus: 'untested'
  };
}

test('document processing extracts Markdown, DOCX tables, PDF text, and source indexes', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-brand-docs-'));
  try {
    const markdownPath = path.join(temporary, 'brand.md');
    const textPath = path.join(temporary, 'notes.txt');
    const docxPath = path.join(temporary, 'strategy.docx');
    const pdfPath = path.join(temporary, 'research.pdf');
    await fs.writeFile(markdownPath, '# 九州美学\n\n## 品牌定位\n可信的东方生活方式品牌');
    await fs.writeFile(textPath, Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('补充用户研究：城市青年需要可信的文化依据', 'utf8')
    ]));
    const zip = new AdmZip();
    zip.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>目标人群</w:t></w:r></w:p>
      <w:p><w:r><w:t>重视文化审美的城市青年</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>维度</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>内容</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>价值</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>克制</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      </w:body></w:document>`));
    zip.writeZip(docxPath);
    await fs.writeFile(pdfPath, makePdf('Brand DNA PDF source'));

    const markdown = await parseBrandDocument(markdownPath);
    const text = await parseBrandDocument(textPath);
    const docx = await parseBrandDocument(docxPath);
    const pdf = await parseBrandDocument(pdfPath);
    const corpus = buildBrandStrategyCorpus([markdown, docx, pdf]);

    assert.equal(markdown.title, '九州美学');
    assert.match(markdown.rawText, /品牌定位/);
    assert.match(text.rawText, /补充用户研究/);
    assert.equal(docx.tables.length, 1);
    assert.match(docx.tables[0]!.markdown, /克制/);
    assert.match(pdf.rawText, /Brand DNA PDF source/);
    assert.equal(pdf.pageCount, 1);
    assert.ok(corpus.sourceIndex.some((item) => item.filename === 'brand.md' && item.section === '品牌定位'));
    assert.match(corpus.mergedText, /文档 ID/);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('brand DNA project imports, parses, deduplicates, and deletes local documents', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-brand-store-'));
  try {
    const dataRoot = path.join(temporary, 'data');
    const documentPath = path.join(temporary, '品牌策划.md');
    await fs.writeFile(documentPath, '# 九州美学\n\n## 品牌定位\n可信的东方生活方式品牌');
    const store = createProjectStore(async () => settings(dataRoot));
    const project = await store.create({
      mode: 'brand-dna',
      sourcePaths: [documentPath],
      apiProfileId: 'profile-test'
    });
    const summary = await store.scanDocuments(project.id);
    const importedAgain = await store.importDocuments(project.id, [documentPath]);
    const corpus = await store.loadBrandCorpus(project.id);
    const paths = await store.paths(project.id);
    const sourcePath = path.join(paths.input, summary.items[0]!.relativePath);

    assert.equal(project.mode, 'brand-dna');
    assert.equal(project.analysisProfile, 'brand-dna');
    assert.equal(summary.parsedCount, 1);
    assert.equal(importedAgain.summary.totalFiles, 1);
    assert.equal(importedAgain.skipped.length, 1);
    assert.match(corpus.mergedText, /可信的东方生活方式品牌/);
    assert.equal(await fs.stat(sourcePath).then(() => true).catch(() => false), true);

    const cleared = await store.removeDocument(project.id, summary.items[0]!.id);
    assert.equal(cleared.totalFiles, 0);
    assert.equal(await fs.stat(sourcePath).then(() => true).catch(() => false), false);
    assert.equal((await store.get(project.id)).status, 'draft');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
