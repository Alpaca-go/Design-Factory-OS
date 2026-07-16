import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertInside,
  buildFusionEnhancedTask,
  buildReportFilename,
  desktopFactualConstraints,
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

test('Fusion Enhanced is a single-call prompt profile and locks the confirmed industry', () => {
  const task = buildFusionEnhancedTask('审计现有方案');
  assert.match(task, /只调用一次模型/);
  assert.match(task, /材质、微结构、负形/);
  assert.match(task, /不得先生成多份报告再融合/);
  assert.deepEqual(desktopFactualConstraints('医学美学', ['品牌名不得修改']), [
    '行业属性“医学美学”为用户确认事实，不得重新推断、覆盖或修改。',
    '品牌名不得修改'
  ]);
});

test('report title is project-specific and final decision check fails closed', () => {
  const body = ['# 项目视觉方案升级报告', ...Array.from({ length: 11 }, (_, index) => `## ${index}. ${index === 5 ? '唯一视觉升级命题' : '章节'}`), '保留 升级 替换 删除 新增'].join('\n\n');
  const normalized = normalizeReportTitle(body, '九州美学');
  assert.match(normalized, /^# 九州美学视觉方案升级报告/);
  assert.doesNotThrow(() => validateDesktopReport(normalized));
  assert.throws(() => validateDesktopReport('# incomplete'), /缺少章节/);
});

test('path boundary and secret redaction fail safely', () => {
  assert.match(assertInside('C:/data/projects', 'C:/data/projects/demo/input'), /demo[\\/]input$/);
  assert.throws(() => assertInside('C:/data/projects', 'C:/data/outside'), /超出项目数据目录/);
  assert.equal(redactSecret('request failed for secret-key', 'secret-key'), 'request failed for [REDACTED]');
});
