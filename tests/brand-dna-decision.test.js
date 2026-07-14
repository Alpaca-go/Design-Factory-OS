import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrandDnaDecision } from '../src/brand-dna-decision.js';

const brand = { brandName: '匿名品牌' };
const benchmarks = {
  industry: { value: '文化生活' },
  projectType: { value: '品牌升级' },
  commonTraits: ['成熟案例以稳定资产跨触点表达'],
  cases: ['案例 A', '案例 B', '案例 C'].map((name) => ({ name }))
};

const approvedBrandDNA = {
  logo: '只使用授权标志母版。',
  color: '深蓝为识别锚点，米白承担呼吸空间。',
  typography: '字重克制，信息层级清晰。',
  composition: '单一视觉重心与稳定网格。',
  whitespace: '保留稳定呼吸区。',
  photography: '自然侧光与真实接触阴影。',
  materials: '纸张与木材保留真实纹理。',
  packaging: '沿用已确认纸盒结构。',
  craft: '局部工艺只服务信息层级。'
};

function completeConfig() {
  return {
    brandDnaDecision: {
      originalIntent: { statement: '以克制美学连接当代生活。', evidence: ['创始人访谈与项目目标'] },
      industryBenchmark: {
        observations: ['同类品牌普遍依赖装饰性文化符号'],
        opportunities: ['以结构与真实材质建立差异'],
        references: ['案例 A', '案例 B', '案例 C']
      },
      creativeDecision: {
        statement: '用结构、留白与真实材质表达当代文化感。',
        rationale: ['回应原始意图，并避开行业符号堆叠'],
        tradeoffs: ['不使用仿古装饰']
      },
      approvedBrandDNA,
      approval: { status: 'approved', approvedBy: 'Creative Director', approvedAt: '2026-07-14' }
    }
  };
}

test('完整四阶段决策链产生 Approved Brand DNA', () => {
  const decision = buildBrandDnaDecision(brand, benchmarks, completeConfig());
  assert.equal(decision.status, 'Approved');
  assert.deepEqual(decision.approval.blockers, []);
  assert.equal(decision.approvedBrandDNA.composition, approvedBrandDNA.composition);
  assert.ok(Object.values(decision.stageReadiness).every(Boolean));
});

test('旧 visualDNA 只作为候选，不能直接进入 Creative Brief', () => {
  const decision = buildBrandDnaDecision(brand, benchmarks, {
    creativeReasoning: { visualDNA: approvedBrandDNA }
  });
  assert.equal(decision.status, 'Needs Decision');
  assert.equal(decision.migration.legacyVisualDnaDetected, true);
  assert.equal(decision.candidateBrandDNA.color, approvedBrandDNA.color);
  assert.match(decision.approvedBrandDNA.color, /Brand DNA Decision 未完成/);
});

test('只有 approvedBrandDNA 与批准标记但缺少上游决策时仍会被阻止', () => {
  const decision = buildBrandDnaDecision(brand, benchmarks, {
    brandDnaDecision: { approvedBrandDNA, approval: { status: 'approved' } }
  });
  assert.equal(decision.status, 'Needs Decision');
  assert.ok(decision.approval.blockers.some((item) => item.startsWith('Original Intent')));
  assert.ok(decision.approval.blockers.some((item) => item.startsWith('Creative Decision')));
  assert.match(decision.approvedBrandDNA.logo, /未完成/);
});

test('Approved Brand DNA 中的变体待定措辞不能绕过完整性检查', () => {
  const config = completeConfig();
  config.brandDnaDecision.approvedBrandDNA.craft = '具体工艺仍需打样确认';
  const decision = buildBrandDnaDecision(brand, benchmarks, config);
  assert.equal(decision.status, 'Needs Decision');
  assert.ok(decision.approval.blockers.some((item) => item.startsWith('Approved Brand DNA')));
});
