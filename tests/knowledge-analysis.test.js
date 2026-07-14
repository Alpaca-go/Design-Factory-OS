import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeKnowledge, loadApprovedRules, renderKnowledgeAnalysis, similarity } from '../src/knowledge-analysis.js';

const rules = [
  { id: 'RULE-PKG-001', title: '包装展示图片结构', category: 'Packaging', content: '包装展示应包含正面、产品组合、工艺细节和开盒展示。' },
  { id: 'RULE-BRAND-001', title: '品牌色使用', category: 'Brand', content: '品牌主色应在核心触点保持一致。' }
];

const candidates = [
  { id: 'KC-001', title: '包装展示图片结构', category: 'Packaging', content: '包装展示应包含正面、产品组合、工艺细节和开盒展示。', reason: '两个项目验证', evidenceCount: 2 },
  { id: 'KC-002', title: '品牌色补充规则', category: 'Brand', content: '辅助色应标明使用比例。', reason: '补充边界', targetRule: 'RULE-BRAND-001', evidenceCount: 2 },
  { id: 'KC-003', title: '无字海报系列规则', category: 'Poster', content: '无字海报应通过主视觉、细节、情绪和陈列形成系列。', reason: '三个项目验证', verifiedProjects: ['A', 'B', 'C'], evidenceCount: 3 },
  { id: 'KC-004', title: '客户主色', category: 'Brand', content: '本项目使用 #AABBCC。', reason: '品牌设定', projectOnly: true, projectOnlyReason: '客户品牌色', evidenceCount: 1 }
];

test('知识分析正确分类四种建议动作', () => {
  const analysis = analyzeKnowledge(candidates, rules, '匿名测试项目');
  assert.deepEqual(analysis.statistics, { new: 1, update: 1, duplicate: 1, projectOnly: 1 });
  assert.equal(analysis.duplicates[0].rule.id, 'RULE-PKG-001');
  assert.equal(analysis.updateSuggestions[0].rule.id, 'RULE-BRAND-001');
  assert.equal(analysis.newSuggestions[0].priority, 'P1');
  assert.equal(analysis.projectOnly[0].priority, 'P3');
});

test('知识库健康度覆盖五个固定分类', () => {
  const analysis = analyzeKnowledge(candidates, rules, '匿名测试项目');
  assert.deepEqual(analysis.health.map((x) => x.category), ['Packaging', 'Brand', 'VI', 'Poster', 'Portfolio']);
  assert.equal(analysis.health.find((x) => x.category === 'Packaging').status, '稳定');
  assert.equal(analysis.health.find((x) => x.category === 'Poster').status, '建议补充');
});

test('无通用建议时输出规范声明', () => {
  const analysis = analyzeKnowledge([candidates[3]], [], '匿名测试项目');
  const report = renderKnowledgeAnalysis(analysis, { brandLock: { brandName: '匿名测试项目' } });
  assert.match(report, /本次项目未发现新的通用设计规律，仅产生项目级经验/);
  assert.match(report, /## 八、人工审核清单/);
  assert.match(report, /不会修改 knowledge\/approved\//);
});

test('Approved Rule 支持 JSON 与 Markdown 且保持只读', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'approved-rules-'));
  const markdown = `---\nid: RULE-VI-001\ntitle: VI 一致性\ncategory: VI\n---\n\nVI 核心资产应跨触点保持一致。\n`;
  await fs.writeFile(path.join(root, 'vi.md'), markdown, 'utf8');
  await fs.writeFile(path.join(root, 'poster.json'), JSON.stringify({ id: 'RULE-POSTER-001', title: '海报系列', category: 'Poster', content: '海报应形成系列。' }), 'utf8');
  const before = await Promise.all((await fs.readdir(root)).map(async (name) => [name, await fs.readFile(path.join(root, name), 'utf8')]));
  const loaded = await loadApprovedRules(root);
  const after = await Promise.all((await fs.readdir(root)).map(async (name) => [name, await fs.readFile(path.join(root, name), 'utf8')]));
  assert.deepEqual(loaded.map((x) => x.id).sort(), ['RULE-POSTER-001', 'RULE-VI-001']);
  assert.deepEqual(after, before);
});

test('文本相似度对相同规则显著高于无关规则', () => {
  assert.ok(similarity('包装展示需要工艺细节和开盒展示', '包装展示包含工艺细节与开盒展示') > similarity('包装展示需要工艺细节', '品牌字体保持一致'));
});

test('人工可将新增或更新建议提升为 P0，但重复项固定为 P3', () => {
  const urgent = analyzeKnowledge([{ id: 'KC-U', title: '紧急品牌规则', category: 'Brand', content: '品牌核心资产需要立即建立使用边界。', priority: 'P0', evidenceCount: 2 }], [], '匿名测试项目');
  const duplicate = analyzeKnowledge([{ ...candidates[0], priority: 'P0' }], rules, '匿名测试项目');
  assert.equal(urgent.newSuggestions[0].priority, 'P0');
  assert.equal(duplicate.duplicates[0].priority, 'P3');
});
