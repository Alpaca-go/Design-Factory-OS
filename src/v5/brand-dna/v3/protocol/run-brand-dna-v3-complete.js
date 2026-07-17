import { parseBrandDnaResponse } from '../../response-parser.js';
import { runBrandDnaV3Core } from './run-brand-dna-v3.js';
import { runV3VisualExtension } from './run-visual-extension.js';
import { buildImagePromptCompilerPrompt, IMAGE_PROMPT_COMPILER_PROMPT_VERSION } from '../visual/image-prompt-compiler-prompt.js';
import { validateCompiledImageTasks } from '../visual/validate-image-prompts.js';
import { buildFinalAuditPrompt, FINAL_AUDIT_PROMPT_VERSION } from '../audit/final-audit-prompt.js';
import { validateFinalAudit } from '../audit/validate-final-audit.js';
import { applyAuditPatch, buildAuditPatchRequest, validateAuditPatch } from '../audit/audit-patch.js';
import { validateBrandCreativeDecision } from '../decision/validate-decision.js';
import { validateVisualSystemTaskPlan } from '../visual/validate-visual-system-task-plan.js';
import { compileV3FullReport } from '../report/compile-full-report.js';
import { V3_STAGE_PROFILES } from './stage-profiles.js';
import { buildCheckpoint, canResumeCheckpoint, valueHash } from '../runtime/checkpoint-store.js';
import { BRAND_DNA_V3 } from './stage-definitions.js';

async function modelStage(input, result, options) {
  const { stageId, profileKey = stageId, promptVersion, schemaVersion, outputFile, upstream, messages, validate, reasoner = input.reasoner } = options;
  const profile = V3_STAGE_PROFILES[profileKey];
  const upstreamHash = valueHash(upstream);
  const expected = { stageId, documentSetHash: result.prepared.documentSetHash, upstreamHash, promptVersion, schemaVersion };
  const saved = input.checkpoints?.[stageId];
  if (saved && canResumeCheckpoint(saved.checkpoint, expected, saved.output)) {
    const output = validate(saved.output);
    result.metrics.push({ stageId, kind: 'checkpoint', durationMs: 0, resumed: true });
    return output;
  }
  input.onProgress?.(stageId);
  const attempts = options.validationAttempts || 1;
  let attemptMessages = messages;
  for (let attemptNumber = 1; attemptNumber <= attempts; attemptNumber += 1) {
    const started = Date.now();
    let response;
    try {
      response = await reasoner(attemptMessages, { signal: input.abortSignal, enableThinking: profile.thinking, thinkingBudget: profile.thinkingBudget, maxOutputTokens: profile.maxOutputTokens, requestTimeoutMs: profile.requestTimeoutMs });
    } catch (error) {
      if (error.code === 'OUTPUT_TRUNCATED') throw error;
      throw Object.assign(new Error(`${stageId}：${error.message}`), { code: options.errorCode || 'FAILED_SCHEMA', stageId, cause: error });
    }
    try {
      const output = validate(parseBrandDnaResponse(response.text));
      result.metrics.push({ stageId, kind: 'model', validationStatus: 'passed', durationMs: Date.now() - started, resumed: false, attemptNumber, finishReason: response.finishReason || null, usage: response.usage || null, thinkingEnabled: profile.thinking, modelId: response.model, provider: response.provider });
      const checkpoint = buildCheckpoint({ projectId: input.projectId, analysisRunId: result.analysisRunId, stageId, documentSetHash: result.prepared.documentSetHash, upstreamHash, promptVersion, schemaVersion, profile: { ...profile, provider: options.provider || input.provider, modelId: options.modelId || input.modelId }, outputFile, output, usageRecordIds: [] });
      await input.onCheckpoint?.(stageId, { checkpoint, output });
      return output;
    } catch (error) {
      result.metrics.push({ stageId, kind: 'model', validationStatus: 'failed', durationMs: Date.now() - started, resumed: false, attemptNumber, finishReason: response.finishReason || null, usage: response.usage || null, thinkingEnabled: profile.thinking, modelId: response.model, provider: response.provider });
      if (attemptNumber >= attempts) throw Object.assign(new Error(`${stageId}：${error.message}`), { code: options.errorCode || 'FAILED_SCHEMA', stageId, cause: error });
      attemptMessages = [...messages, { role: 'user', content: `上一次输出未通过结构化解析或校验：${error.message}。请重新返回完整、严格合法且只包含所需对象的 JSON，不要使用 Markdown。` }];
    }
  }
}

export async function runBrandDnaV3(input) {
  const pipelineStarted = Date.now();
  const core = await runBrandDnaV3Core(input);
  const extended = await runV3VisualExtension(input, core);
  if (Date.now() - pipelineStarted >= BRAND_DNA_V3.pipelineBudgetMs) throw Object.assign(new Error('完整流程达到 20 分钟预算；核心报告和视觉 Checkpoint 已保留'), { code: 'PIPELINE_TIME_BUDGET_EXCEEDED', coreCompleted: true });
  let decision = core.decision;
  let visualSystemTaskPlan = extended.visualSystemTaskPlan;
  let compiledImageTasks = await modelStage(input, extended, { stageId: '06-image-prompt-compiler', promptVersion: IMAGE_PROMPT_COMPILER_PROMPT_VERSION, schemaVersion: 'compiled-image-tasks-v3', outputFile: 'compiled-image-tasks.json', upstream: { decision, visual: visualSystemTaskPlan }, messages: buildImagePromptCompilerPrompt(decision, visualSystemTaskPlan), validate: (value) => validateCompiledImageTasks(value, visualSystemTaskPlan), errorCode: 'VISUAL_EXTENSION_FAILED' });
  const auditReasoner = input.auditReasoner || input.reasoner;
  let finalAudit = await modelStage(input, extended, { stageId: '07-final-audit', validationAttempts: 2, promptVersion: FINAL_AUDIT_PROMPT_VERSION, schemaVersion: 'final-brand-dna-audit-v3', outputFile: 'final-audit.json', upstream: { decision, visual: visualSystemTaskPlan, compiledImageTasks }, messages: buildFinalAuditPrompt({ ...core, decision }, visualSystemTaskPlan, compiledImageTasks), validate: validateFinalAudit, reasoner: auditReasoner, provider: input.auditProvider || input.provider, modelId: input.auditModelId || input.modelId, errorCode: 'FINAL_AUDIT_FAILED' });
  if (finalAudit.status === 'needs-patch' && input.enableModelPatch !== false) {
    const previousAuditIssues = finalAudit.issues;
    const payload = { decision, visualSystemTaskPlan, compiledImageTasks };
    const request = buildAuditPatchRequest(payload, finalAudit);
    const patched = await modelStage(input, extended, { stageId: '07-audit-patch', profileKey: 'audit-patch', promptVersion: 'audit-issue-patch-v3.3', schemaVersion: 'audit-issue-patch-v3', outputFile: 'audit-patch.json', upstream: { payload, audit: finalAudit }, messages: request.messages, validate: (value) => validateAuditPatch(value, request.allowedPaths), errorCode: 'FINAL_AUDIT_FAILED' });
    const repaired = applyAuditPatch(payload, patched);
    decision = validateBrandCreativeDecision(repaired.decision, core.evidenceMap);
    visualSystemTaskPlan = validateVisualSystemTaskPlan(repaired.visualSystemTaskPlan, decision);
    compiledImageTasks = validateCompiledImageTasks(repaired.compiledImageTasks, visualSystemTaskPlan);
    finalAudit = await modelStage(input, extended, { stageId: '07-final-audit-recheck', profileKey: '07-final-audit', validationAttempts: 2, promptVersion: `${FINAL_AUDIT_PROMPT_VERSION}-recheck-1`, schemaVersion: 'final-brand-dna-audit-v3', outputFile: 'final-audit-recheck.json', upstream: { decision, visual: visualSystemTaskPlan, compiledImageTasks }, messages: buildFinalAuditPrompt({ ...core, decision }, visualSystemTaskPlan, compiledImageTasks, { recheck: true, previousIssues: previousAuditIssues }), validate: validateFinalAudit, reasoner: auditReasoner, provider: input.auditProvider || input.provider, modelId: input.auditModelId || input.modelId, errorCode: 'FINAL_AUDIT_FAILED' });
  }
  if (finalAudit.status !== 'pass') throw Object.assign(new Error(`最终独立审计未通过：${finalAudit.issues.map((item) => `${item.path} ${item.reason}`).join('；')}`), { code: 'FINAL_AUDIT_FAILED', stageId: '07-final-audit', audit: finalAudit, coreCompleted: true });
  const reportCore = { ...core, decision };
  const fullReportMarkdown = compileV3FullReport(reportCore, visualSystemTaskPlan, compiledImageTasks, finalAudit);
  const stageId = '08-final-report';
  const checkpoint = buildCheckpoint({ projectId: input.projectId, analysisRunId: core.analysisRunId, stageId, documentSetHash: core.prepared.documentSetHash, upstreamHash: valueHash({ decision, visualSystemTaskPlan, compiledImageTasks, finalAudit }), promptVersion: BRAND_DNA_V3.fullReportVersion, schemaVersion: BRAND_DNA_V3.fullReportVersion, outputFile: 'brand-dna-full-report-v3.md', output: fullReportMarkdown, usageRecordIds: [] });
  await input.onCheckpoint?.(stageId, { checkpoint, output: fullReportMarkdown });
  return { ...extended, decision, visualSystemTaskPlan, compiledImageTasks, finalAudit, fullReportMarkdown, modelCallCount: extended.metrics.filter((item) => item.kind === 'model').length };
}
