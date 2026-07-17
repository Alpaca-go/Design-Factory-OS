import { parseBrandDnaResponse } from '../../response-parser.js';
import { buildVisualSystemTaskPlanPrompt, VISUAL_SYSTEM_TASK_PLAN_PROMPT_VERSION } from '../visual/visual-system-task-plan-prompt.js';
import { validateVisualSystemTaskPlan } from '../visual/validate-visual-system-task-plan.js';
import { V3_STAGE_PROFILES } from './stage-profiles.js';
import { buildCheckpoint, canResumeCheckpoint, valueHash } from '../runtime/checkpoint-store.js';

export async function runV3VisualExtension(input, core) {
  const stageId = '05-visual-system-task-plan';
  const profile = V3_STAGE_PROFILES[stageId];
  const upstreamHash = valueHash(core.decision);
  const expected = { stageId, documentSetHash: core.prepared.documentSetHash, upstreamHash, promptVersion: VISUAL_SYSTEM_TASK_PLAN_PROMPT_VERSION, schemaVersion: 'visual-system-task-plan-v3' };
  const saved = input.checkpoints?.[stageId];
  if (saved && canResumeCheckpoint(saved.checkpoint, expected, saved.output)) {
    const visualSystemTaskPlan = validateVisualSystemTaskPlan(saved.output, core.decision);
    core.metrics.push({ stageId, kind: 'checkpoint', durationMs: 0, resumed: true });
    return { ...core, visualSystemTaskPlan };
  }
  const started = Date.now();
  input.onProgress?.(stageId);
  let response;
  try {
    response = await input.reasoner(buildVisualSystemTaskPlanPrompt(core.decision, input.lockedAssets), { signal: input.abortSignal, enableThinking: profile.thinking, thinkingBudget: profile.thinkingBudget, maxOutputTokens: profile.maxOutputTokens, requestTimeoutMs: profile.requestTimeoutMs });
    const visualSystemTaskPlan = validateVisualSystemTaskPlan(parseBrandDnaResponse(response.text), core.decision);
    core.metrics.push({ stageId, kind: 'model', durationMs: Date.now() - started, resumed: false, attemptNumber: 1, finishReason: response.finishReason || null, usage: response.usage || null, thinkingEnabled: profile.thinking, modelId: response.model, provider: response.provider });
    const checkpoint = buildCheckpoint({ projectId: input.projectId, analysisRunId: core.analysisRunId, stageId, documentSetHash: core.prepared.documentSetHash, upstreamHash, promptVersion: expected.promptVersion, schemaVersion: expected.schemaVersion, profile: { ...profile, provider: input.provider, modelId: input.modelId }, outputFile: 'visual-system-task-plan.json', output: visualSystemTaskPlan, usageRecordIds: [] });
    await input.onCheckpoint?.(stageId, { checkpoint, output: visualSystemTaskPlan });
    return { ...core, visualSystemTaskPlan };
  } catch (error) {
    throw Object.assign(new Error(`${stageId}：${error.message}`), { code: error.code === 'OUTPUT_TRUNCATED' ? error.code : 'VISUAL_EXTENSION_FAILED', stageId, cause: error });
  }
}
