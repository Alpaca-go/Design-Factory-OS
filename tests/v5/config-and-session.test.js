import test from 'node:test';
import assert from 'node:assert/strict';
import { createV5ProjectConfig } from '../../src/v5/config/schema.js';
import { ReasoningSessionGuard } from '../../src/v5/creative-director/session-guard.js';

test('v5 defaults to Deep Mode, Maximum authority, one output and Logo lock', () => {
  const config = createV5ProjectConfig({ projectName: 'Demo', industry: '食品' });
  assert.equal(config.runtime.analysisMode, 'deep');
  assert.equal(config.runtime.creativeAuthority, 'maximum');
  assert.deepEqual(config.runtime.lockedVisualAssets, ['logo']);
  assert.equal(config.runtime.officialOutputFile, '视觉方案升级报告.md');
  assert.equal(config.runtime.useCompilerPipeline, false);
  assert.equal(config.runtime.useCreativeFreedomRecommendation, false);
  assert.equal(config.runtime.useModeRecommendation, false);
  assert.equal(config.performance.targetMinutes, 10);
  assert.equal(config.performance.maximumMinutes, 15);
  assert.equal(config.performance.maxDetailAssets, 5);
  assert.equal(config.performance.maxReportCharacters, 8000);
});

test('v5 rejects a performance maximum below the target', () => {
  assert.throws(() => createV5ProjectConfig({
    projectName: 'Demo',
    performance: { targetMinutes: 10, maximumMinutes: 9 }
  }), { code: 'CONFIG_INVALID' });
  assert.throws(() => createV5ProjectConfig({
    projectName: 'Demo',
    performance: { maxReportCharacters: 5999 }
  }), { code: 'CONFIG_INVALID' });
});

test('v5 only changes the Logo lock through an explicit project override', () => {
  const locked = createV5ProjectConfig({
    projectName: 'Demo',
    overrides: { additionalLockedAssets: ['mascot'] }
  });
  assert.deepEqual(locked.runtime.lockedVisualAssets, ['logo', 'mascot']);

  const redesign = createV5ProjectConfig({
    projectName: 'Demo',
    overrides: { allowLogoRedesign: true }
  });
  assert.deepEqual(redesign.runtime.lockedVisualAssets, []);
});

test('Reasoning Session Guard rejects a second full creative reasoning run', () => {
  const guard = new ReasoningSessionGuard();
  guard.begin('run-1');
  assert.throws(() => guard.begin('run-2'), { code: 'MULTIPLE_REASONING_RUNS' });
  assert.throws(() => guard.continueSameSession('run-2'), { code: 'SESSION_MISMATCH' });
  assert.equal(guard.continueSameSession('run-1').continuations, 1);
  assert.throws(() => guard.continueSameSession('run-1'), { code: 'REPAIR_LIMIT_EXCEEDED' });
});
