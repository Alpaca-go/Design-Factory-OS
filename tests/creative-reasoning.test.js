import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreativeReasoning } from '../src/creative-reasoning.js';

const inventory = { imageCount: 2, totalFiles: 2, items: [] };
const brand = {
  brandName: '匿名品牌', logo: { files: ['logo.svg'] }, primaryColor: '#112233', secondaryColors: ['#FFFFFF'],
  fonts: [], fontTemperament: '克制、现代', packaging: ['纸盒'], coreVisualAssets: ['圆形符号']
};
const benchmarks = { projectType: { value: '品牌视觉升级' }, industry: { value: '文化生活' } };

test('v3.1 Creative Reasoning 保留人工核验后的十部分 Brief 事实', () => {
  const result = buildCreativeReasoning(inventory, brand, benchmarks, {
    visualInspection: { verified: true, inspectedImageCount: 2, findings: ['两张画面均采用大面积留白'] },
    creativeReasoning: {
      brandIdentity: { statement: '以克制美学连接当代生活的文化品牌。', evidence: ['两张品牌画面的共同视觉表达'] },
      brandPositioning: { statement: '面向重视文化质感的当代生活方式品牌。', evidence: ['产品、渠道与同类案例'] },
      designLanguage: { statement: '克制、温和、结构清晰。', rationale: ['大面积留白与稳定层级'], principles: ['单一视觉重心', '稳定网格'] },
      emotionalDirection: { statement: '安静但不疏离。', desiredFeelings: ['可信', '温暖'], avoidFeelings: ['浮夸'], evidence: ['低饱和摄影'] },
      visualDNA: {
        logo: '只使用授权标志。', color: '深蓝为主、白色为底', typography: '字重克制、层级清晰',
        composition: '单一主体居中', whitespace: '保留稳定呼吸区', photography: '自然侧光与真实阴影',
        materials: '纸张与木材', packaging: '纸盒结构不变', craft: '无涂布纸与压凹'
      },
      photographyDirection: { lighting: '柔和侧光', framing: '50mm 平视', depth: '中等景深', materials: '纸张与木材', atmosphere: '安静温和' },
      designRisks: [{ problem: '主体容易过小', reason: '留白比例较高', prevention: '确保主体承担第一视觉' }],
      mustKeep: ['圆形符号', '深蓝主色'],
      canExplore: ['真实空间中的材质组合'],
      designGoal: '建立能跨触点稳定表达的文化品牌视觉体系。'
    }
  });
  assert.equal(result.visualInspection.verified, true);
  assert.equal(result.brandIdentity.statement, '以克制美学连接当代生活的文化品牌。');
  assert.equal(result.brandPositioning.statement, '面向重视文化质感的当代生活方式品牌。');
  assert.equal(result.designLanguage.principles.length, 2);
  assert.deepEqual(result.emotionalDirection.avoidFeelings, ['浮夸']);
  assert.equal(result.visualDNA.whitespace, '保留稳定呼吸区');
  assert.equal(result.photographyDirection.framing, '50mm 平视');
  assert.deepEqual(result.designRisks[0], { problem: '主体容易过小', reason: '留白比例较高', prevention: '确保主体承担第一视觉' });
  assert.deepEqual(result.mustKeep, ['圆形符号', '深蓝主色']);
  assert.deepEqual(result.canExplore, ['真实空间中的材质组合']);
  assert.equal(result.designGoal, '建立能跨触点稳定表达的文化品牌视觉体系。');
});

test('兼容 v3.0 Creative Reasoning 配置但转换到 v3.1 数据契约', () => {
  const result = buildCreativeReasoning(inventory, brand, benchmarks, {
    visualInspection: { verified: true, inspectedImageCount: 2, findings: ['已逐张核验'] },
    creativeReasoning: {
      positioning: { summary: '当代文化生活品牌', evidence: ['包装与空间画面'] },
      temperament: { summary: '温和、理性', evidence: ['低饱和摄影'] },
      visualDNA: { composition: '单一视觉重心', mustKeep: ['圆形符号'] },
      photographyLanguage: { lighting: '柔和侧光', lens: '平视镜头' },
      creativeDirection: '用克制关系建立长期识别。'
    }
  });
  assert.equal(result.brandPositioning.statement, '当代文化生活品牌');
  assert.equal(result.designLanguage.statement, '温和、理性');
  assert.equal(result.photographyDirection.framing, '平视镜头');
  assert.deepEqual(result.mustKeep, ['圆形符号']);
  assert.equal(result.designGoal, '用克制关系建立长期识别。');
});

test('缺少逐张视觉核验时明确待确认且不伪造画面事实', () => {
  const result = buildCreativeReasoning(inventory, brand, benchmarks, {});
  assert.equal(result.visualInspection.verified, false);
  assert.match(result.evidenceStatus, /视觉核验未闭环/);
  assert.match(result.visualDNA.composition, /待确认/);
  assert.match(result.visualDNA.photography, /待确认/);
  assert.equal(result.designRisks[0].problem, '品牌理解缺少完整逐张视觉核验');
});
