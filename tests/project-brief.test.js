import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PROJECT_BRIEF, loadProjectBrief } from '../src/project-brief.js';

test('没有项目级文件时自动使用 docs/Project Brief.md', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-os-brief-default-'));
  const brief = await loadProjectBrief(root);
  assert.equal(brief.path, DEFAULT_PROJECT_BRIEF);
  assert.equal(brief.source, 'workspace-default');
  assert.equal(brief.defaultMode, 'standard');
  assert.equal(brief.requirements.visualInspection, true);
  assert.equal(brief.requirements.onlineBenchmarks, true);
  assert.equal(brief.requirements.sameIndustryBenchmarks, true);
  assert.equal(brief.requirements.minBenchmarks, 3);
  assert.equal(brief.requirements.validationReport, true);
  assert.deepEqual(brief.requirements.performanceTarget, { minMinutes: 10, maxMinutes: 11 });
  assert.equal(brief.sha256.length, 64);
});

test('项目根目录 Project Brief 优先于默认文档', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-os-brief-project-'));
  const input = path.join(projectRoot, 'input');
  await fs.mkdir(input);
  const projectBrief = path.join(projectRoot, 'Project Brief.md');
  await fs.writeFile(projectBrief, '# Local\n\n- Quick（默认）\n- 联网分析至少三个同品类案例\n- 必须实际查看全部图片\n- 不得跨行业\n');
  const brief = await loadProjectBrief(input);
  assert.equal(brief.path, projectBrief);
  assert.equal(brief.source, 'project');
  assert.equal(brief.defaultMode, 'quick');
  assert.equal(brief.requirements.minBenchmarks, 3);
});

test('显式 Project Brief 路径具有最高优先级', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-os-brief-explicit-'));
  const explicit = path.join(root, 'custom.md');
  await fs.writeFile(explicit, '# Explicit Brief');
  const brief = await loadProjectBrief(root, { projectBrief: explicit });
  assert.equal(brief.path, explicit);
  assert.equal(brief.source, 'explicit');
});
