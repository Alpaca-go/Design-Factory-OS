import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertInside,
  buildFusionEnhancedTask,
  buildReportFilename,
  desktopFactualConstraints,
  extractProjectNameFromReport,
  normalizeReportTitle,
  redactSecret,
  sanitizeFilenamePart,
  validateDesktopReport
} from '../src/main/analysis-contract.ts';

test('Windows-safe report filename includes project and model', () => {
  assert.equal(sanitizeFilenamePart(' 九州:美学 / 2026? '), '九州-美学 - 2026');
  assert.equal(
    buildReportFilename('九州:美学', 'qwen3/vl-plus'),
    '九州-美学-视觉方案升级报告-qwen3-vl-plus.md'
  );
});

test('Fusion Enhanced is a single-call prompt profile and preserves confidence boundaries', () => {
  const task = buildFusionEnhancedTask('审计现有方案');
  assert.match(task, /只调用一次模型/);
  assert.match(task, /材质、微结构、负形/);
  assert.match(task, /不得先生成多份报告再融合/);
  assert.deepEqual(desktopFactualConstraints('医学美学', ['品牌名不得修改']), [
    '行业线索“医学美学”来自现有素材自动识别（置信度 1.00），分析不得擅自改写，并须说明识别来源。',
    '品牌名不得修改'
  ]);
  assert.match(desktopFactualConstraints('待确认', [], 0)[0]!, /不得将行业猜测写成确定事实/);
});

test('report title is project-specific and final decision check fails closed', () => {
  const sections = Array.from({ length: 11 }, (_, index) => {
    if (index === 3) return [
      '## 3. 视觉资产决策',
      '| 视觉资产 | 决策 | 当前问题 | 新动作 |',
      '|---|---|---|---|',
      '| Logo | 保留 | 识别有效 | 保持原样 |',
      '| 辅助图形 | 替换 | 语言混乱 | 建立统一图形语言 |'
    ].join('\n');
    return `## ${index}. ${index === 5 ? '唯一视觉升级命题' : '章节'}`;
  });
  const body = ['# 项目视觉方案升级报告', ...sections].join('\n\n');
  const normalized = normalizeReportTitle(body, '九州美学');
  assert.match(normalized, /^# 九州美学视觉方案升级报告/);
  assert.doesNotThrow(() => validateDesktopReport(normalized));
  assert.doesNotThrow(() => validateDesktopReport(normalized.replace('| 辅助图形 | 替换 |', '| 辅助图形 | 删除 |')));
  assert.throws(
    () => validateDesktopReport(normalized.replace('| 辅助图形 | 替换 |', '| 辅助图形 | 观察 |')),
    /资产决策值无效/
  );
  assert.throws(() => validateDesktopReport('# incomplete'), /缺少章节/);
  assert.equal(extractProjectNameFromReport('# 九州美学视觉方案升级报告\n\n正文'), '九州美学');
  assert.equal(extractProjectNameFromReport('# input视觉方案升级报告\n\n正文'), null);
  assert.equal(extractProjectNameFromReport('# 站酷作品集视觉方案升级报告\n\n正文'), null);
});

test('path boundary and secret redaction fail safely', () => {
  assert.match(assertInside('C:/data/projects', 'C:/data/projects/demo/input'), /demo[\\/]input$/);
  assert.throws(() => assertInside('C:/data/projects', 'C:/data/outside'), /超出项目数据目录/);
  assert.equal(redactSecret('request failed for secret-key', 'secret-key'), 'request failed for [REDACTED]');
});
