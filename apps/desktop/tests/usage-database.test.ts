import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createUsageDatabase } from '../src/main/usage-database.ts';

test('usage SQLite repository persists calls, price snapshots, summaries, filters, and interruption recovery', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-usage-db-'));
  const database = createUsageDatabase(path.join(root, 'usage.sqlite'));
  try {
    database.savePricingRule({
      provider: 'qwen',
      modelPattern: 'qwen3*',
      region: null,
      protocol: 'openai-chat-completions',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: null,
      currency: 'CNY',
      minInputTokensExclusive: null,
      maxInputTokensInclusive: null,
      inputPricePerMillionMicros: '1000000',
      outputPricePerMillionMicros: '2000000',
      cachedInputMultiplierPpm: 500000,
      batchMultiplierPpm: null,
      sourceName: 'test',
      sourceUpdatedAt: '2026-07-01T00:00:00.000Z',
      notes: null,
      isEnabled: true
    });
    database.insertPending({
      id: 'call-1',
      analysisRunId: 'run-1',
      projectId: 'project-1',
      projectNameSnapshot: '测试项目',
      analysisMode: 'brand-dna',
      pipelineStage: 'brand-dna.evidence-extraction',
      attemptNumber: 1,
      parentCallId: null,
      apiProfileId: 'profile-1',
      apiProfileNameSnapshot: '千问',
      provider: 'qwen',
      protocol: 'openai-chat-completions',
      region: null,
      modelId: 'qwen3.6-plus',
      localRequestId: 'local-1',
      thinkingEnabled: false,
      thinkingBudgetTokens: null,
      structuredOutputMode: 'json-object',
      maxOutputTokens: 8000,
      startedAt: '2026-07-16T00:00:00.000Z',
      createdAt: '2026-07-16T00:00:00.000Z'
    });
    const completed = database.complete('call-1', {
      status: 'success',
      completedAt: '2026-07-16T00:00:01.000Z',
      durationMs: 1000,
      providerRequestId: 'provider-1',
      httpStatus: 200,
      finishReason: 'stop',
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1600,
        cachedInputTokens: 200,
        reasoningTokens: 100,
        textInputTokens: 800,
        imageInputTokens: 200,
        videoInputTokens: null,
        audioInputTokens: null,
        textOutputTokens: 500,
        audioOutputTokens: null,
        usageSource: 'provider',
        providerRawUsage: { prompt_tokens: 1000, completion_tokens: 500 }
      }
    });
    assert.equal(completed.estimatedCostMicros, 1900);
    assert.equal(completed.pricingRuleId?.startsWith('pricing-'), true);
    assert.match(completed.pricingSnapshotJson || '', /inputPricePerMillionMicros/);
    assert.match(completed.validationWarningsJson || '', /totalTokens/);
    assert.equal(completed.finishReason, 'stop');
    assert.equal(completed.thinkingEnabled, false);
    assert.equal(completed.structuredOutputMode, 'json-object');
    assert.equal(completed.maxOutputTokens, 8000);
    assert.equal(database.runSummary('run-1').totalTokens, 1600);
    assert.equal(database.listRecords({ modelId: 'qwen3.6-plus' }).total, 1);
    assert.equal(database.monthSummary('2026-07').callCount, 1);

    database.insertPending({
      id: 'call-pending',
      analysisRunId: 'run-2',
      projectId: null,
      projectNameSnapshot: null,
      analysisMode: 'unknown',
      pipelineStage: 'unknown',
      attemptNumber: 1,
      parentCallId: null,
      apiProfileId: 'profile-1',
      apiProfileNameSnapshot: '千问',
      provider: 'qwen',
      protocol: 'openai-chat-completions',
      region: null,
      modelId: 'qwen3.6-plus',
      localRequestId: 'local-2',
      startedAt: '2026-07-16T00:00:00.000Z',
      createdAt: '2026-07-16T00:00:00.000Z'
    });
    assert.equal(database.markInterruptedPending(), 1);
    assert.equal(database.record('call-pending')?.errorCategory, 'interrupted');
  } finally {
    database.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
