import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrandDnaReportFilename } from '../src/main/brand-dna-contract.ts';

test('Brand DNA report filename contains project name, report type, and actual model ID', () => {
  assert.equal(
    buildBrandDnaReportFilename('九州美学', 'qwen3.6-plus/preview'),
    '九州美学-品牌DNA与创意转译报告-qwen3.6-plus-preview.md'
  );
});
