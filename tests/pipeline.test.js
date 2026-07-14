import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipeline } from '../src/pipeline.js';

const projects = ['匿名文旅Demo', '匿名食品Demo', '匿名文创Demo'];

for (const project of projects) {
  test(`长期回归：${project}`, async () => {
    const root = path.resolve('examples', project);
    const output = await fs.mkdtemp(path.join(os.tmpdir(), `design-factory-${project}-`));
    const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), `design-factory-history-${project}-`));
    const { result } = await runPipeline(root, { output, historyDir });
    assert.equal(result.brandLock.brandName, project);
    assert.match(result.brandLock.primaryColor, /^#[0-9A-F]{6}$/);
    assert.ok(!result.brandLock.secondaryColors.includes(result.brandLock.primaryColor));
    assert.ok(result.brandLock.logo.files.length >= 1);
    assert.equal(result.imagePlan.count, 13);
    assert.equal(result.gaps.topThree.length, 3);
    const taskPackage = await fs.readFile(path.join(output, '02-Chat生图任务包.md'), 'utf8');
    assert.match(taskPackage, new RegExp(project));
    assert.match(taskPackage, /## 1\. Brand Lock/);
    assert.match(taskPackage, /## 2\. Chat 执行规则/);
    assert.match(taskPackage, /## 3\. 图片队列/);
    assert.match(taskPackage, /## 4\. 图片任务卡/);
    assert.match(taskPackage, /## 5\. 全局验收标准/);
    assert.doesNotMatch(taskPackage, /\\n\+?>/);
    const projectAnalysis = await fs.readFile(path.join(output, '01-项目分析报告.md'), 'utf8');
    const knowledgeReview = await fs.readFile(path.join(output, '03-Knowledge-Review.md'), 'utf8');
    const designReview = await fs.readFile(path.join(output, '04-Design-Review.md'), 'utf8');
    assert.match(projectAnalysis, /## 9\. 下一阶段成长建议/);
    assert.match(knowledgeReview, /未经人工审核不得写入 knowledge\/approved\//);
    assert.match(knowledgeReview, /本次项目未发现新的通用设计规律，仅产生项目级经验/);
    assert.match(knowledgeReview, /建议动作：Project Only/);
    assert.match(designReview, /首次项目，暂无历史数据。/);
    assert.match(designReview, /## 14\. Action Items/);
    assert.deepEqual(result.knowledgeAnalysis.statistics, { new: 0, update: 0, duplicate: 0, projectOnly: 4 });
    await assert.rejects(fs.access(path.join(output, 'design-factory-result.json')), { code: 'ENOENT' });
    assert.equal(result.designReview.radar.length, 8);
    assert.ok(result.designReview.strengths.length >= 3);
    assert.ok(result.designReview.improvements.length >= 5);
  });
}

test('重复运行不会把自定义输出当作素材', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-factory-idempotent-'));
  await fs.cp(path.resolve('examples', '匿名文旅Demo'), root, { recursive: true });
  const output = path.join(root, 'reports', 'latest');
  const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-factory-idempotent-history-'));
  const first = await runPipeline(root, { output, historyDir });
  const second = await runPipeline(root, { output, historyDir });
  assert.equal(second.result.inventory.totalFiles, first.result.inventory.totalFiles);
  assert.ok(!second.result.inventory.items.some((x) => x.path.startsWith('reports/')));
});

test('正式模式每次只生成四份规范报告且不会回扫', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-factory-default-output-'));
  await fs.cp(path.resolve('examples', '匿名食品Demo'), root, { recursive: true });
  const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-factory-default-history-'));
  const first = await runPipeline(root, { historyDir });
  const second = await runPipeline(root, { historyDir });
  assert.equal(first.output, path.join(root, 'outputs'));
  assert.equal(second.result.inventory.totalFiles, first.result.inventory.totalFiles);
  for (const name of ['01-项目分析报告.md', '02-Chat生图任务包.md', '03-Knowledge-Review.md', '04-Design-Review.md']) {
    await assert.doesNotReject(fs.access(path.join(root, 'outputs', name)));
  }
  await assert.rejects(fs.access(path.join(root, 'outputs', 'design-factory-result.json')), { code: 'ENOENT' });
});

test('调试模式额外生成结构化 JSON', async () => {
  const root = path.resolve('examples', '匿名食品Demo');
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'design-factory-debug-output-'));
  const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-factory-debug-history-'));
  await runPipeline(root, { output, historyDir, debug: true });
  const json = JSON.parse(await fs.readFile(path.join(output, 'design-factory-result.json'), 'utf8'));
  assert.equal(json.version, '2.0.0');
  assert.equal(json.designReview.radar.length, 8);
});
