import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOpenAiCompatibleStreamUsageCollector,
  createMissingUsage,
  extractDashScopeUsage,
  extractOpenAiCompatibleUsage
} from '../../src/v5/usage/normalized-usage.js';
import {
  calculateEstimatedCost,
  matchPricingRule,
  pricingSnapshot
} from '../../src/v5/usage/pricing.js';
import { aggregateUsageRecords } from '../../src/v5/usage/usage-aggregator.js';
import { usageRecordsToCsv } from '../../src/v5/usage/usage-exporter.js';

test('OpenAI-compatible usage maps cache, reasoning, and multimodal details', () => {
  const usage = extractOpenAiCompatibleUsage({
    usage: {
      prompt_tokens: 12000,
      completion_tokens: 4500,
      total_tokens: 16500,
      prompt_tokens_details: { cached_tokens: 2000, image_tokens: 800 },
      completion_tokens_details: { reasoning_tokens: 1800, text_tokens: 2700 }
    }
  });
  assert.equal(usage.inputTokens, 12000);
  assert.equal(usage.outputTokens, 4500);
  assert.equal(usage.totalTokens, 16500);
  assert.equal(usage.cachedInputTokens, 2000);
  assert.equal(usage.reasoningTokens, 1800);
  assert.equal(usage.imageInputTokens, 800);
  assert.equal(usage.textOutputTokens, 2700);
  assert.equal(usage.usageSource, 'provider');
  assert.deepEqual(Object.keys(usage.providerRawUsage).sort(), [
    'completion_tokens',
    'completion_tokens_details',
    'prompt_tokens',
    'prompt_tokens_details',
    'total_tokens'
  ]);
});

test('DashScope native usage keeps missing values as null', () => {
  const usage = extractDashScopeUsage({
    output: {
      usage: {
        input_tokens: 20,
        output_tokens: 5,
        input_tokens_details: { text_tokens: 12, image_tokens: 8 }
      }
    }
  });
  assert.equal(usage.inputTokens, 20);
  assert.equal(usage.outputTokens, 5);
  assert.equal(usage.totalTokens, null);
  assert.equal(usage.textInputTokens, 12);
  assert.equal(usage.imageInputTokens, 8);
  assert.equal(usage.usageSource, 'provider-partial');
  assert.equal(createMissingUsage().inputTokens, null);
});

test('OpenAI-compatible stream collector keeps the final usage-bearing chunk', () => {
  const collector = createOpenAiCompatibleStreamUsageCollector();
  collector.consume({ choices: [{ delta: { content: 'partial' } }] });
  collector.consume({ usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } });
  const usage = collector.finalUsage();
  assert.equal(usage.inputTokens, 10);
  assert.equal(usage.outputTokens, 3);
  assert.equal(usage.totalTokens, 13);
});

test('pricing registry matches provider, model, region, protocol, date, and input tier', () => {
  const rules = [
    {
      id: 'generic',
      provider: 'qwen',
      modelPattern: 'qwen3-*',
      region: null,
      protocol: null,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: null,
      minInputTokensExclusive: null,
      maxInputTokensInclusive: null,
      isEnabled: true
    },
    {
      id: 'specific-tier',
      provider: 'qwen',
      modelPattern: 'qwen3-vl-plus',
      region: 'cn-beijing',
      protocol: 'openai-chat-completions',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: null,
      minInputTokensExclusive: 10000,
      maxInputTokensInclusive: 50000,
      isEnabled: true
    }
  ];
  assert.equal(matchPricingRule(rules, {
    provider: 'QWEN',
    modelId: 'qwen3-vl-plus',
    region: 'cn-beijing',
    protocol: 'openai-chat-completions',
    inputTokens: 12000,
    startedAt: '2026-07-16T00:00:00.000Z'
  }).id, 'specific-tier');
});

test('cost calculator uses integer micros and cached multiplier without double-billing reasoning', () => {
  const rule = {
    id: 'price-v1',
    currency: 'CNY',
    inputPricePerMillionMicros: '1000000',
    outputPricePerMillionMicros: '2000000',
    cachedInputMultiplierPpm: 500000
  };
  const result = calculateEstimatedCost({
    usageSource: 'provider',
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    cachedInputTokens: 200_000,
    reasoningTokens: 300_000
  }, rule);
  assert.equal(result.estimatedCostMicros, 1_900_000);
  assert.equal(result.currency, 'CNY');
  assert.equal(result.costEstimateStatus, 'calculated');
  assert.equal(pricingSnapshot(rule).inputPricePerMillionMicros, '1000000');
});

test('cost calculator clamps invalid cached usage and reports missing pricing', () => {
  assert.equal(calculateEstimatedCost({
    usageSource: 'provider',
    inputTokens: 10,
    outputTokens: 5,
    cachedInputTokens: 20
  }, null).costEstimateStatus, 'pricing-rule-missing');
  const result = calculateEstimatedCost({
    usageSource: 'provider',
    inputTokens: 10,
    outputTokens: 5,
    cachedInputTokens: 20
  }, {
    currency: 'USD',
    inputPricePerMillionMicros: '1000000',
    outputPricePerMillionMicros: '1000000',
    cachedInputMultiplierPpm: 0
  });
  assert.match(result.warnings.join(''), /已按输入 Token 截断/);
  assert.ok(result.estimatedCostMicros >= 0);
});

test('usage aggregation preserves retries, failures, and missing completeness', () => {
  const summary = aggregateUsageRecords([
    {
      analysisRunId: 'run-1',
      projectId: 'project-1',
      projectNameSnapshot: '项目',
      analysisMode: 'brand-dna',
      status: 'success',
      attemptNumber: 1,
      parentCallId: null,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cachedInputTokens: 2,
      reasoningTokens: 1,
      estimatedCostMicros: 100,
      currency: 'CNY',
      usageSource: 'provider',
      startedAt: '2026-07-01T00:00:00.000Z',
      completedAt: '2026-07-01T00:00:01.000Z'
    },
    {
      analysisRunId: 'run-1',
      projectId: 'project-1',
      projectNameSnapshot: '项目',
      analysisMode: 'brand-dna',
      status: 'failed',
      attemptNumber: 2,
      parentCallId: 'call-1',
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cachedInputTokens: null,
      reasoningTokens: null,
      estimatedCostMicros: null,
      currency: null,
      usageSource: 'missing',
      startedAt: '2026-07-01T00:00:02.000Z',
      completedAt: '2026-07-01T00:00:03.000Z'
    }
  ]);
  assert.equal(summary.modelCallCount, 2);
  assert.equal(summary.retryCallCount, 1);
  assert.equal(summary.failedCallCount, 1);
  assert.equal(summary.totalTokens, 15);
  assert.equal(summary.usageCompleteness, 'partial');
});

test('CSV exporter escapes cells and excludes prompts and responses by schema', () => {
  const csv = usageRecordsToCsv([{
    createdAt: '2026-07-16',
    projectNameSnapshot: '项目,甲',
    analysisMode: 'brand-dna',
    pipelineStage: 'brand-dna.evidence-extraction',
    provider: 'qwen',
    modelId: 'qwen3.6-plus',
    apiProfileNameSnapshot: '默认',
    status: 'success',
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
    cachedInputTokens: null,
    reasoningTokens: null,
    imageInputTokens: null,
    durationMs: 100,
    providerRequestId: 'request-1',
    estimatedCostMicros: null,
    currency: null,
    usageSource: 'provider',
    errorCategory: null,
    prompt: '不得导出',
    response: '不得导出'
  }]);
  assert.match(csv, /"项目,甲"/);
  assert.doesNotMatch(csv, /不得导出/);
});
