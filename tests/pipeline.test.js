import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipeline } from '../src/pipeline.js';

const projects = ['匿名文旅Demo', '匿名食品Demo', '匿名文创Demo'];
const outputFiles = ['01-项目分析报告.md', '02-Creative-Brief.md', '03-Knowledge-Review.md', '04-Design-Review.md'];
const briefSections = [
  'Brand Identity', 'Brand Positioning', 'Design Language', 'Emotional Direction', 'Visual DNA',
  'Photography Direction', 'Design Risks', 'Must Keep', 'Can Explore', 'Design Goal'
];

for (const project of projects) {
  test(`v3.1 长期回归：${project}`, async () => {
    const root = path.resolve('examples', project);
    const output = await fs.mkdtemp(path.join(os.tmpdir(), `design-factory-${project}-`));
    const { result } = await runPipeline(root, { output });

    assert.equal(result.version, '3.1.0');
    assert.equal(result.mode, 'brief');
    assert.equal(result.brandLock.brandName, project);
    assert.match(result.brandLock.primaryColor, /^#[0-9A-F]{6}$/);
    assert.ok(result.brandLock.logo.files.length >= 1);
    assert.equal(result.imagePlan, undefined);
    assert.equal(result.gaps, undefined);
    assert.equal(result.knowledgeAnalysis, undefined);
    assert.equal(result.growth, undefined);
    assert.deepEqual(result.outputFiles, outputFiles);

    const brief = await fs.readFile(path.join(output, '02-Creative-Brief.md'), 'utf8');
    assert.match(brief, new RegExp(project));
    for (const section of briefSections) assert.match(brief, new RegExp(`## \\d+\\. ${section}`));
    assert.doesNotMatch(brief, /PKG-|VI-|POS-|图片任务|生图任务|画幅|比例计划|Chat 执行|Prompt 指令/);

    const analysis = await fs.readFile(path.join(output, '01-项目分析报告.md'), 'utf8');
    assert.match(analysis, /## Brand Lock/);
    assert.match(analysis, /## Benchmark Analysis/);
    assert.match(analysis, /## Creative Reasoning/);
    assert.doesNotMatch(analysis, /## Image Planning|缺图矩阵|图片任务卡/);

    const knowledge = await fs.readFile(path.join(output, '03-Knowledge-Review.md'), 'utf8');
    assert.match(knowledge, /Knowledge 保存的是可复用的设计思考问题/);
    assert.match(knowledge, /Brand Identity/);
    assert.match(knowledge, /Portfolio Coherence/);
    assert.match(knowledge, /本次运行不会把项目结论写成通用答案/);

    const review = await fs.readFile(path.join(output, '04-Design-Review.md'), 'utf8');
    assert.match(review, /评审 Creative Brief 是否具备进入创意发展的证据与边界/);
    assert.match(review, /## 十项简报检查/);
    assert.match(review, /不生成图片任务、Prompt、数量或比例方案/);
    assert.equal((await fs.readdir(output)).filter((name) => name.endsWith('.md')).length, 4);
    await assert.rejects(fs.access(path.join(output, 'design-factory-result.json')), { code: 'ENOENT' });
  });
}

test('重复运行保持幂等且固定输出四份文档', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-factory-idempotent-'));
  await fs.cp(path.resolve('examples', '匿名文旅Demo'), root, { recursive: true });
  const output = path.join(root, 'reports', 'latest');
  const first = await runPipeline(root, { output });
  const second = await runPipeline(root, { output });
  assert.equal(second.result.inventory.totalFiles, first.result.inventory.totalFiles);
  assert.ok(!second.result.inventory.items.some((item) => item.path.startsWith('reports/')));
  assert.deepEqual(second.result.outputFiles, outputFiles);
  assert.equal((await fs.readdir(output)).filter((name) => name.endsWith('.md')).length, 4);
});

test('默认运行清理 v3.0 生图任务包并生成 v3.1 四份文件', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-factory-default-output-'));
  await fs.cp(path.resolve('examples', '匿名食品Demo'), root, { recursive: true });
  await fs.mkdir(path.join(root, 'outputs'), { recursive: true });
  await fs.writeFile(path.join(root, 'outputs', '02-Chat生图任务包.md'), 'stale');
  await fs.writeFile(path.join(root, 'outputs', 'Chat生图任务包.md'), 'stale');
  const { result, output } = await runPipeline(root);
  assert.equal(output, path.join(root, 'outputs'));
  assert.deepEqual(result.outputFiles, outputFiles);
  for (const name of outputFiles) await assert.doesNotReject(fs.access(path.join(output, name)));
  await assert.rejects(fs.access(path.join(output, '02-Chat生图任务包.md')), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(output, 'Chat生图任务包.md')), { code: 'ENOENT' });
});

test('v3.0 模式参数兼容映射到唯一 Creative Brief 工作流', async () => {
  for (const mode of ['fast', 'review', 'research']) {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), `design-factory-mode-${mode}-`));
    const { result } = await runPipeline(path.resolve('examples', '匿名文创Demo'), { output, mode });
    assert.equal(result.mode, 'brief');
    assert.deepEqual(result.outputFiles, outputFiles);
  }
});

test('未知分析模式会被拒绝', async () => {
  await assert.rejects(runPipeline(path.resolve('examples', '匿名文创Demo'), { mode: 'slow' }), /未知分析模式/);
});

test('调试模式额外生成 v3.1 结构化 JSON', async () => {
  const root = path.resolve('examples', '匿名食品Demo');
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'design-factory-debug-output-'));
  await runPipeline(root, { output, debug: true });
  const json = JSON.parse(await fs.readFile(path.join(output, 'design-factory-result.json'), 'utf8'));
  assert.equal(json.version, '3.1.0');
  assert.equal(json.mode, 'brief');
  assert.ok(json.creativeReasoning.brandIdentity.statement);
  assert.equal(json.briefReview.checks.length, 10);
  assert.equal(json.thinkingReview.categories.length, 5);
});
