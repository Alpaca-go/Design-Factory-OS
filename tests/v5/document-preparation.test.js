import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDocumentRole, splitTextAtNaturalBoundaries } from '../../src/v5/shared/analysis/document-preparation.js';

test('document preparation prefers market research over generic brand strategy labels', () => {
  const role = classifyDocumentRole({
    filename: '名济堂-品牌市场调研报告.docx',
    title: '名济堂品牌市场调研报告',
    rawText: '品牌定位与竞品调研'
  });
  assert.equal(role.role, 'market-research');
});

test('document preparation splits long text at a natural sentence boundary', () => {
  const first = '市场分析显示敏感肌护理需求持续增长。';
  const second = '用户首要诉求是深层修护屏障，其次是快速缓解敏感不适。';
  const chunks = splitTextAtNaturalBoundaries(`${first.repeat(260)}${second}`, 4000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 4000));
  assert.ok(chunks[0].endsWith('。'));
  assert.ok(chunks.some((chunk) => chunk.includes('用户首要诉求是深层修护屏障')));
  assert.ok(!chunks.some((chunk, index) => chunk.endsWith('首要诉') && chunks[index + 1]?.startsWith('求是')));
});
