import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildBriefReview } from '../src/brief-review.js';
import { runPipeline } from '../src/pipeline.js';

function completeReasoning() {
  const approvedBrandDNA = {
    logo: '授权标志', color: '深红与米白', typography: '清晰层级', composition: '非对称网格', whitespace: '稳定留白',
    photography: '真实生活摄影', materials: '真实纸张', packaging: '已确认盒型', craft: '压凹工艺'
  };
  return {
    visualInspection: { verified: true, inspectedImageCount: 3, totalImages: 3 },
    brandIdentity: { statement: '以真实日常建立关系的生活品牌。', evidence: ['三张视觉素材'] },
    brandPositioning: { statement: '面向重视体验的当代生活方式品牌。', evidence: ['同类案例与渠道'] },
    designLanguage: { statement: '克制、温暖、清晰。', rationale: ['稳定网格与真实材质'], principles: ['单一重心'] },
    emotionalDirection: { statement: '温暖而可信。', desiredFeelings: ['温暖'], avoidFeelings: ['浮夸'], evidence: ['柔和光线'] },
    brandDnaDecision: { status: 'Approved', approvedBrandDNA, approval: { blockers: [] } },
    approvedBrandDNA,
    visualDNA: approvedBrandDNA,
    photographyDirection: { lighting: '柔和侧光', framing: '平视', depth: '中景深', materials: '真实纸张', atmosphere: '温暖可信' },
    designRisks: [{ problem: '容易模板化', reason: '依赖行业惯例', prevention: '回到品牌独有资产' }],
    mustKeep: ['授权标志', '深红主色', '已确认盒型'],
    canExplore: ['摄影场景', '空间尺度'],
    designGoal: '建立跨触点一致的品牌体验。'
  };
}

test('Brief Review 检查十部分并在证据完整时允许进入创意发展', () => {
  const review = buildBriefReview({
    creativeReasoning: completeReasoning(),
    benchmarks: { cases: [{}, {}, {}] }
  });
  assert.equal(review.checks.length, 10);
  assert.equal(review.completeness, 100);
  assert.equal(review.readiness, 'Ready for Creative Development');
  assert.ok(review.checks.every((item) => item.status === 'Ready'));
  assert.ok(review.strengths.length >= 4);
  assert.deepEqual(review.openQuestions, []);
});

test('Brief Review 对待确认内容标记 Needs Evidence', () => {
  const reasoning = completeReasoning();
  reasoning.approvedBrandDNA.photography = '摄影方向待确认';
  reasoning.emotionalDirection.avoidFeelings = [];
  const review = buildBriefReview({ creativeReasoning: reasoning, benchmarks: { cases: [{}, {}, {}] } });
  assert.ok(review.completeness < 100);
  assert.equal(review.readiness, 'Needs Evidence Before Creative Development');
  assert.equal(review.checks.find((item) => item.section === 'Approved Brand DNA').status, 'Needs Evidence');
  assert.equal(review.checks.find((item) => item.section === 'Emotional Direction').status, 'Needs Evidence');
  assert.ok(review.openQuestions.some((item) => item.startsWith('Approved Brand DNA：')));
});

test('v3.2 流水线不再写入成长历史或使用 reviewScores', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'brief-review-root-'));
  await fs.cp(path.resolve('examples', '匿名文创Demo'), root, { recursive: true });
  const configFile = path.join(root, 'masterpiece-os.json');
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  config.reviewScores = { 摄影: 99 };
  await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'brief-review-output-'));
  const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brief-review-history-'));
  const { result } = await runPipeline(root, { output, historyDir });
  assert.equal(result.growth, undefined);
  assert.equal(result.designReview, undefined);
  assert.equal(result.briefReview.checks.length, 10);
  assert.deepEqual(await fs.readdir(historyDir), []);
});
