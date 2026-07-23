import { VISUAL_TRANSLATION_V2_RUNTIME_CONFIG } from '../../v2/config/visual-translation-v2-runtime-config.js';

export const VISUAL_TRANSLATION_V1 = Object.freeze({
  protocolVersion: 'visual-translation-v1',
  checkpointVersion: 'visual-translation-v1-checkpoint-1.3',
  directionsReportVersion: 'visual-directions-report-v1.2',
  pipelineBudgetMs: 18 * 60 * 1000
});

export const STAGES = Object.freeze([
  ['00-document-preparation', 0],
  ['01-visual-evidence', 1],
  ['02-visual-signal-opportunity', 2],
  ['04-three-creative-directions', 4],
  ['05-direction-recommendation', 5],
  ['10-local-report-compiler', 10]
]);

export const STAGE_SEQUENCE = Object.freeze(Object.fromEntries(STAGES));

export const STAGE_PROFILES = Object.freeze({
  '01-visual-evidence': { thinking: false, thinkingBudget: null, maxOutputTokens: 6000, requestTimeoutMs: 180000 },
  '02-visual-signal-opportunity': { thinking: true, thinkingBudget: 3500, maxOutputTokens: 6000, requestTimeoutMs: 240000 },
  '04-three-creative-directions': { thinking: true, thinkingBudget: 5000, maxOutputTokens: 8000, requestTimeoutMs: 300000 },
  // v2 execution-oriented direction generation (doc: v2 Stage 04 输出截断修复).
  // Deliberately distinct from the v1 04 profile: the v2 direction schema is
  // ~2-3x larger, so it needs a 20k output budget and a smaller thinking budget.
  // v1.3.4 frozen behaviour is preserved by keeping the entry above unchanged.
  '04-execution-oriented-directions-v2': {
    thinking: true,
    thinkingBudget: VISUAL_TRANSLATION_V2_RUNTIME_CONFIG.step4.thinkingBudget,
    maxOutputTokens: VISUAL_TRANSLATION_V2_RUNTIME_CONFIG.step4.maxOutputTokens,
    requestTimeoutMs: VISUAL_TRANSLATION_V2_RUNTIME_CONFIG.step4.mainHardTimeoutMs,
    truncationRetry: { enabled: false, maxAttempts: 0, multiplier: 1.5 }
  }
});

export function getStageProfile(stageId) {
  const profile = STAGE_PROFILES[stageId];
  if (!profile) throw new Error(`Unknown visual translation stage profile: ${stageId}`);
  return profile;
}
