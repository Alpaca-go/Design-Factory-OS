import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildThinkingReview, loadThinkingFramework } from '../src/thinking-framework.js';

test('Thinking Framework 从五个文件读取设计问题而不是答案', async () => {
  const framework = await loadThinkingFramework(path.resolve('knowledge', 'thinking'));
  assert.equal(framework.categories.length, 5);
  assert.deepEqual(framework.warnings, []);
  assert.ok(framework.categories.every((category) => category.questions.length >= 3));
  assert.ok(framework.categories.flatMap((category) => category.questions).every((question) => /[？?]$/.test(question)));
});

test('Knowledge Review 为具体项目生成五类开放问题', async () => {
  const framework = await loadThinkingFramework(path.resolve('knowledge', 'thinking'));
  const result = {
    brandLock: { brandName: '匿名品牌' },
    benchmarks: { industry: { value: '文化生活' } },
    creativeReasoning: {
      brandIdentity: { statement: '以真实体验连接人的品牌。' },
      brandPositioning: { statement: '当代生活方式品牌。' },
      emotionalDirection: { statement: '温暖可信。' }
    }
  };
  const review = buildThinkingReview(result, framework, {
    thinkingQuestions: { identity: ['如果移除名称，品牌还能被认出吗？', '品牌应该使用红色'] }
  });
  assert.match(review.statement, /问题，而不是项目答案/);
  assert.deepEqual(Object.keys(review.projectQuestions), ['identity', 'emotion', 'visual', 'brand', 'portfolio']);
  assert.ok(Object.values(review.projectQuestions).every((questions) => questions.length >= 3));
  assert.ok(review.projectQuestions.identity.includes('如果移除名称，品牌还能被认出吗？'));
  assert.ok(!review.projectQuestions.identity.includes('品牌应该使用红色'));
});
