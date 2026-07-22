// Central runtime budget for execution-oriented Visual Translation V2.
// Keep every Step 4 timeout in one place so the hierarchy can be audited.

export const VISUAL_TRANSLATION_V2_RUNTIME_CONFIG = Object.freeze({
  pipelineTimeoutMs: 22 * 60 * 1000,
  step4: Object.freeze({
    firstActivityTimeoutMs: 90_000,
    streamIdleTimeoutMs: 90_000,
    mainHardTimeoutMs: 420_000,
    repairHardTimeoutMs: 240_000,
    totalTimeoutMs: 720_000,
    processingReserveMs: 60_000,
    minimumRepairBudgetMs: 120_000,
    heartbeatIntervalMs: 30_000,
    thinkingBudget: 1_000,
    maxOutputTokens: 20_000
  })
});

const { step4 } = VISUAL_TRANSLATION_V2_RUNTIME_CONFIG;
if (step4.totalTimeoutMs < step4.mainHardTimeoutMs + step4.repairHardTimeoutMs + step4.processingReserveMs) {
  throw new Error('Visual Translation V2 Step 4 timeout hierarchy is invalid');
}

const upstreamWorstCaseMs = 180_000 + 240_000;
if (VISUAL_TRANSLATION_V2_RUNTIME_CONFIG.pipelineTimeoutMs
  < upstreamWorstCaseMs + step4.totalTimeoutMs + step4.processingReserveMs) {
  throw new Error('Visual Translation V2 pipeline timeout does not leave a processing reserve');
}
