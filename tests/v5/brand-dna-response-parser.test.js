import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBrandDnaResponse } from '../../src/v5/brand-dna/response-parser.js';

test('Brand DNA response parser repairs missing commas between array elements', () => {
  const parsed = parseBrandDnaResponse(`{
    "atomicEvidence": [
      {"id":"one","claim":"第一条"}
      {"id":"two","claim":"第二条"}
      {"id":"three","claim":"第三条"}
    ]
  }`);
  assert.deepEqual(parsed.atomicEvidence.map((item) => item.id), ['one', 'two', 'three']);
});

test('Brand DNA response parser repairs missing commas between object properties', () => {
  const parsed = parseBrandDnaResponse('{"brandName":"九州美学" "category":"东方美学"}');
  assert.equal(parsed.brandName, '九州美学');
  assert.equal(parsed.category, '东方美学');
});

test('Brand DNA response parser removes trailing commas without changing string content', () => {
  const parsed = parseBrandDnaResponse('```json\n{"claim":"保留文本中的, }符号","items":[1,2,],}\n```');
  assert.equal(parsed.claim, '保留文本中的, }符号');
  assert.deepEqual(parsed.items, [1, 2]);
});

test('Brand DNA response parser escapes raw line breaks inside strings', () => {
  const parsed = parseBrandDnaResponse('{"claim":"第一行\n第二行"}');
  assert.equal(parsed.claim, '第一行\n第二行');
});

test('Brand DNA response parser reports truncated objects clearly', () => {
  assert.throws(
    () => parseBrandDnaResponse('{"atomicEvidence":[{"id":"one"}'),
    /JSON 对象不完整.*输出长度限制/
  );
});
