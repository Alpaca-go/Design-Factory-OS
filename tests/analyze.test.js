import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBenchmarks, buildBrandLock } from '../src/analyze.js';

test('人工确认的 Logo 文件覆盖通用文件名限制', () => {
  const inventory = { root: '/demo', items: [{ name: '未标题-1.png', path: '未标题-1.png', detail: {} }] };
  const brand = buildBrandLock(inventory, { brand: { name: '测试品牌', logoFiles: ['未标题-1.png'] } });
  assert.equal(brand.logo.status, '已识别候选');
  assert.deepEqual(brand.logo.files, ['未标题-1.png']);
});

test('接受已完成的外部联网对标核验记录', async () => {
  const inventory = { root: '/demo', items: [] };
  const result = await analyzeBenchmarks(inventory, { brandName: '测试品牌' }, {
    industry: '餐饮', projectType: '品牌升级', benchmarks: [{ name: '案例 A' }, { name: '案例 B' }, { name: '案例 C' }],
    benchmarkResearch: { verified: true, status: '已联网核验 3 个案例', query: '餐饮品牌案例' }
  }, { online: true });
  assert.equal(result.search.status, '已联网核验 3 个案例');
  assert.equal(result.cases.length >= 3, true);
});

test('已核验的充足对标案例不混入内置通用案例', async () => {
  const inventory = { root: '/demo', items: [] };
  const benchmarks = ['案例 A', '案例 B', '案例 C', '案例 D'].map((name) => ({ name }));
  const result = await analyzeBenchmarks(inventory, { brandName: '测试品牌' }, {
    industry: '餐饮', projectType: '品牌升级', benchmarks, benchmarkLimit: 4,
    benchmarkResearch: { verified: true, status: '已联网核验 4 个案例' }
  }, { online: true });
  assert.deepEqual(result.cases.map((item) => item.name), ['案例 A', '案例 B', '案例 C', '案例 D']);
});
