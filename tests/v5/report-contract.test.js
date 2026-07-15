import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_HEADINGS = Object.freeze([
  '## 0. GPT Execution Core',
  '## 1. 原始方案与品牌意图理解',
  '## 2. 当前视觉问题',
  '## 3. 视觉资产决策',
  '## 4. Benchmark 与可迁移启示',
  '## 5. 唯一视觉升级命题',
  '## 6. 全新视觉系统',
  '## 7. 应用系统',
  '## 8. 图片生成规划',
  '## 9. 建议执行顺序',
  '## 10. 最终锁定、开放与禁止清单'
]);

test('report template preserves the fixed v5 heading order', async () => {
  const template = await fs.readFile(path.resolve('templates', 'creative-upgrade-report.md'), 'utf8');
  let previous = -1;
  for (const heading of REQUIRED_HEADINGS) {
    const index = template.indexOf(heading);
    assert.ok(index > previous, `${heading} 必须存在且顺序正确`);
    previous = index;
  }
});

test('report schema requires the five action decisions and forbids v4 three-state decisions', async () => {
  const schema = await fs.readFile(path.resolve('prompts', 'v5', 'report-schema.md'), 'utf8');
  assert.match(schema, /\| 视觉资产 \| 决策 \| 当前问题 \| 新动作 \|/);
  assert.match(schema, /决策值只允许：保留、升级、替换、删除、新增/);
  assert.match(schema, /不得使用 Locked \/ Evolve \/ Flexible 作为主要资产决策结构/);
  assert.match(schema, /不得附加 Creative Brief、Design Decisions、Design Review 或 Runtime Protocol/);
});

test('Execution Core template remains concise and contains all execution fields', async () => {
  const core = await fs.readFile(path.resolve('prompts', 'v5', 'execution-core-template.md'), 'utf8');
  for (const field of [
    '品牌：', '行业：', '原始 Logo：', 'Creative Authority：', '当前核心问题', '唯一视觉升级命题',
    '核心视觉锚点', '新视觉关键词', 'Anchor Image', '图片生成顺序', '关键禁止事项'
  ]) assert.ok(core.includes(field), `Execution Core 缺少 ${field}`);
  assert.ok(core.length < 1600, 'Execution Core 模板不得膨胀为完整分析');
});
