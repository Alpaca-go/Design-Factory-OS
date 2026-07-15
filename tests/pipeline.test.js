import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipeline } from '../src/pipeline.js';

const projects = ['匿名文旅Demo', '匿名食品Demo', '匿名文创Demo'];
const standardFiles = ['01-Analysis.md', '02-Creative-Brief.md', '03-Design-Decisions.md', '04-Design-Review.md'];
const briefSections = [
  'Creative Vision', 'Brand Personality', 'Approved Brand DNA', 'Creative Principles',
  'Must Keep', 'Can Explore', 'Photography Direction', 'Design Goal'
];
const performanceStages = [
  'readAssets', 'brandUnderstanding', 'industryBenchmark', 'creativeDecision',
  'compilerPipeline', 'creativeBrief', 'review', 'total'
];
const performanceProfileKeys = ['schemaVersion', 'units', ...performanceStages, 'context'];

for (const project of projects) {
  test(`v3.3 Standard 长期回归：${project}`, async () => {
    const root = path.resolve('examples', project);
    const output = await fs.mkdtemp(path.join(os.tmpdir(), `masterpiece-os-${project}-`));
    const { result } = await runPipeline(root, { output });

    assert.equal(result.version, '3.3.0');
    assert.equal(result.mode, 'standard');
    assert.ok(result.projectBrief.path.endsWith(path.join('docs', 'Project Brief.md')));
    assert.equal(result.projectBrief.requirements.minBenchmarks, 3);
    assert.equal(result.brandLock.brandName, project);
    assert.equal(result.brandDnaDecision.status, 'Approved');
    assert.deepEqual(result.outputFiles, standardFiles);
    assert.ok(result.analysis.originalIntent.statement);
    assert.ok(result.creativeBrief.creativeVision.statement);
    assert.ok(result.designDecisions.creativeDecision.statement);
    assert.equal(result.thinkingReview, undefined);
    assert.equal(result.imagePlan, undefined);
    for (const stage of performanceStages) assert.equal(typeof result.performance[stage], 'number');

    const brief = await fs.readFile(path.join(output, '02-Creative-Brief.md'), 'utf8');
    assert.match(brief, new RegExp(project));
    for (const section of briefSections) assert.match(brief, new RegExp(`## \\d+\\. ${section}`));
    assert.equal((brief.match(/^## \d+\./gm) || []).length, 8);
    assert.doesNotMatch(brief, /判断依据|定位依据|推导过程|## .*Reasoning|## .*Industry Benchmark|## .*Competitor|## .*Evidence/);
    assert.doesNotMatch(brief, /PKG-|VI-|POS-|图片任务|生图任务|画幅|比例计划|Prompt 指令/);
    assert.ok(result.briefReview.briefCharacters <= 3000);
    assert.ok(result.creativeBrief.runtimeGptBrief.length <= 1500);

    const analysis = await fs.readFile(path.join(output, '01-Analysis.md'), 'utf8');
    for (const section of ['Original Intent', 'Industry Benchmark', 'Competitor Analysis', 'Evidence', 'Reasoning', 'Creative Decision', 'Design Risks']) {
      assert.match(analysis, new RegExp(`## ${section}`));
    }

    const decisions = await fs.readFile(path.join(output, '03-Design-Decisions.md'), 'utf8');
    assert.match(decisions, /## Creative Decision/);
    assert.match(decisions, /### Reasons/);
    assert.match(decisions, /## Approved Brand DNA/);
    assert.doesNotMatch(decisions, /Knowledge Review|Thinking Framework/);

    const review = await fs.readFile(path.join(output, '04-Design-Review.md'), 'utf8');
    assert.match(review, /## Eight-Part Brief Check/);
    assert.match(review, /Analysis 与 Brief 分离：通过/);
    assert.match(review, /GPT Runtime Brief：已在内存生成，未保存为正式文件/);
    assert.equal((await fs.readdir(output)).filter((name) => name.endsWith('.md')).length, 4);
    await assert.rejects(fs.access(path.join(output, 'Creative-Brief-GPT.md')), { code: 'ENOENT' });
  });
}

test('Quick 模式只保留 02-Creative-Brief.md', async () => {
  const root = path.resolve('examples', '匿名食品Demo');
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-os-quick-'));
  await runPipeline(root, { output, mode: 'standard' });
  const { result } = await runPipeline(root, { output, mode: 'quick' });
  assert.equal(result.mode, 'quick');
  assert.deepEqual(result.outputFiles, ['02-Creative-Brief.md']);
  assert.deepEqual((await fs.readdir(output)).filter((name) => name.endsWith('.md')), ['02-Creative-Brief.md']);
});

test('Standard 与 Studio 始终生成四份正式输出', async () => {
  for (const mode of ['standard', 'studio']) {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), `masterpiece-os-${mode}-`));
    const { result } = await runPipeline(path.resolve('examples', '匿名文创Demo'), { output, mode });
    assert.equal(result.mode, mode);
    assert.deepEqual(result.outputFiles, standardFiles);
  }
});

test('旧模式参数映射到 v3.3 对应模式', async () => {
  const mappings = { fast: 'quick', brief: 'standard', review: 'standard', research: 'studio' };
  for (const [legacy, expected] of Object.entries(mappings)) {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), `masterpiece-os-mode-${legacy}-`));
    const { result } = await runPipeline(path.resolve('examples', '匿名文创Demo'), { output, mode: legacy });
    assert.equal(result.mode, expected);
  }
});

test('重复运行幂等并清理 v3.2 与更早输出', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-os-idempotent-'));
  await fs.cp(path.resolve('examples', '匿名文旅Demo'), root, { recursive: true });
  const output = path.join(root, 'reports', 'latest');
  await fs.mkdir(output, { recursive: true });
  for (const stale of ['01-项目分析报告.md', '03-Knowledge-Review.md', '02-Chat生图任务包.md', 'Creative-Brief-GPT.md']) {
    await fs.writeFile(path.join(output, stale), 'stale');
  }
  const first = await runPipeline(root, { output });
  const second = await runPipeline(root, { output });
  assert.equal(second.result.inventory.totalFiles, first.result.inventory.totalFiles);
  assert.ok(!second.result.inventory.items.some((item) => item.path.startsWith('reports/')));
  assert.deepEqual(second.result.outputFiles, standardFiles);
  assert.deepEqual((await fs.readdir(output)).filter((name) => name.endsWith('.md')).sort(), [...standardFiles].sort());
});

test('--profile 写入 debug/performance.json 且不增加正式输出', async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-os-profile-'));
  const { result } = await runPipeline(path.resolve('examples', '匿名食品Demo'), { output, profile: true });
  const profile = JSON.parse(await fs.readFile(path.join(output, 'debug', 'performance.json'), 'utf8'));
  assert.deepEqual(Object.keys(profile), performanceProfileKeys);
  assert.equal(profile.schemaVersion, '4.0.0');
  assert.equal(profile.units, 'seconds');
  assert.equal(profile.context.inputImages, result.inventory.imageCount);
  assert.deepEqual(result.outputFiles, standardFiles);
  assert.equal((await fs.readdir(output)).filter((name) => name.endsWith('.md')).length, 4);
});

test('默认运行不保留 profiling 文件', async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-os-no-profile-'));
  await runPipeline(path.resolve('examples', '匿名食品Demo'), { output, profile: true });
  await runPipeline(path.resolve('examples', '匿名食品Demo'), { output });
  await assert.rejects(fs.access(path.join(output, 'debug', 'performance.json')), { code: 'ENOENT' });
});

test('未知分析模式会被拒绝', async () => {
  await assert.rejects(runPipeline(path.resolve('examples', '匿名文创Demo'), { mode: 'slow' }), /未知分析模式/);
});

test('调试模式输出 v3.3 结构化运行数据', async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-os-debug-output-'));
  await runPipeline(path.resolve('examples', '匿名食品Demo'), { output, debug: true });
  const json = JSON.parse(await fs.readFile(path.join(output, 'masterpiece-os-result.json'), 'utf8'));
  assert.equal(json.version, '3.3.0');
  assert.equal(json.mode, 'standard');
  assert.equal(json.briefReview.checks.length, 8);
  assert.ok(json.analysis.originalIntent.statement);
  assert.ok(json.creativeBrief.runtimeGptBrief);
  assert.deepEqual(json.outputFiles, standardFiles);
  const profile = JSON.parse(await fs.readFile(path.join(output, 'debug', 'performance.json'), 'utf8'));
  assert.deepEqual(Object.keys(profile), performanceProfileKeys);
  assert.deepEqual(json.performance, profile);
});
