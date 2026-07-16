import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicSettings } from '../src/shared/types';
import type { UsageDatabase } from '../src/main/usage-database';
import { createUsageTracker } from '../src/main/usage-tracker.ts';

const settings: PublicSettings = {
  profiles: [],
  defaultProfileId: null,
  provider: '',
  baseUrl: '',
  model: '',
  hasApiKey: false,
  defaultDataPath: 'D:\\data',
  cacheEnabled: true,
  logLevel: 'info',
  usageTrackingEnabled: true,
  showUsageSummary: true,
  showCostEstimate: true,
  connectionStatus: 'untested'
};

test('usage tracker database failures remain non-blocking', async () => {
  const warnings: string[] = [];
  const database = {
    insertPending() {
      throw new Error('database unavailable');
    },
    complete() {
      throw new Error('database unavailable');
    }
  } as unknown as UsageDatabase;
  const tracker = createUsageTracker(database, async () => settings, (message) => warnings.push(message));
  const handle = await tracker.startCall({
    analysisRunId: 'run-1',
    projectId: 'project-1',
    projectName: '测试项目',
    analysisMode: 'visual-evolution',
    pipelineStage: 'visual.deep-reasoning',
    credentials: {
      profileId: 'profile-1',
      profileName: 'Test',
      provider: 'qwen',
      baseUrl: 'https://example.invalid/v1',
      model: 'qwen3-vl-plus',
      apiKey: 'not-persisted',
      qualityTier: 'experimental'
    }
  });
  assert.equal(handle, null);
  await assert.doesNotReject(tracker.completeCall({
    id: 'call-1',
    startedAt: new Date().toISOString(),
    startedPerformance: performance.now()
  }, {
    status: 'success',
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      cachedInputTokens: null,
      reasoningTokens: null,
      textInputTokens: null,
      imageInputTokens: null,
      videoInputTokens: null,
      audioInputTokens: null,
      textOutputTokens: null,
      audioOutputTokens: null,
      usageSource: 'provider'
    }
  }));
  assert.equal(warnings.length, 2);
});
