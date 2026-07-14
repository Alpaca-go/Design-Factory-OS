import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipeline } from '../src/pipeline.js';

test('首次评审包含完整依据、建议、能力雷达和历史记录', async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'design-review-first-output-'));
  const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-review-first-history-'));
  const { result } = await runPipeline(path.resolve('examples', '匿名文旅Demo'), { output, historyDir });

  assert.equal(result.growth.status, '首次项目，暂无历史数据。');
  assert.equal(result.growth.historyCount, 0);
  assert.equal(result.designReview.radar.length, 8);
  assert.deepEqual(result.designReview.radar.map((item) => item.dimension), ['品牌识别', '包装设计', '版式', '字体', '色彩', '摄影', 'VI', '作品集表现']);
  assert.ok(result.designReview.radar.every((item) => Number.isInteger(item.score) && item.reason && item.suggestion));
  assert.ok(result.designReview.strengths.length >= 3);
  assert.ok(result.designReview.strengths.every((item) => item.strength && item.reason && item.keep));
  assert.ok(result.designReview.improvements.length >= 5);
  assert.ok(result.designReview.improvements.every((item) => item.problem && item.impact && item.suggestion && item.expectedEffect));
  assert.equal(result.designReview.modules.brand.checks.length, 4);
  assert.equal(result.designReview.modules.packaging.checks.length, 6);
  assert.equal(result.designReview.modules.visualSystem.checks.length, 6);
  assert.equal(result.actionItems.length, 6);

  const names = await fs.readdir(historyDir);
  assert.equal(names.filter((name) => name.endsWith('.review.json')).length, 1);
  assert.equal(names.filter((name) => name.endsWith('.review.md')).length, 1);
  const recordName = names.find((name) => name.endsWith('.review.json'));
  const record = JSON.parse(await fs.readFile(path.join(historyDir, recordName), 'utf8'));
  assert.equal(record.overallScore, result.designReview.overallScore);
  assert.equal(record.radar.length, 8);
  assert.equal(record.actionItems.length, 6);
});

test('第二个项目读取历史并输出七项成长趋势', async () => {
  const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-review-trend-history-'));
  const firstOutput = await fs.mkdtemp(path.join(os.tmpdir(), 'design-review-trend-first-'));
  const secondOutput = await fs.mkdtemp(path.join(os.tmpdir(), 'design-review-trend-second-'));
  await runPipeline(path.resolve('examples', '匿名文旅Demo'), { output: firstOutput, historyDir });
  const { result } = await runPipeline(path.resolve('examples', '匿名食品Demo'), { output: secondOutput, historyDir });

  assert.equal(result.growth.historyCount, 1);
  assert.match(result.growth.status, /已读取 1 个历史项目记录/);
  assert.equal(result.growth.trends.length, 7);
  assert.ok(result.growth.trends.every((item) => ['↑', '→', '↓'].includes(item.direction)));
  assert.equal(result.growth.training.length, 3);
  assert.ok(result.growth.training.every((item) => item.reason && item.improves.length && item.recommendedProjects >= 2));
});

test('人工 reviewScores 可覆盖评分但仍保留评分依据', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-review-override-root-'));
  await fs.cp(path.resolve('examples', '匿名文创Demo'), root, { recursive: true });
  const configFile = path.join(root, 'design-factory.json');
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  config.reviewScores = { 摄影: 91, 版式: 77 };
  await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'design-review-override-output-'));
  const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-review-override-history-'));
  const { result } = await runPipeline(root, { output, historyDir });
  const byName = Object.fromEntries(result.designReview.radar.map((item) => [item.dimension, item]));
  assert.equal(byName.摄影.score, 91);
  assert.equal(byName.版式.score, 77);
  assert.ok(byName.摄影.reason);
});
