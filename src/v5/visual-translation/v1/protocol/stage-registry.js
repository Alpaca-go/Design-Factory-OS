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
  '04-three-creative-directions': { thinking: true, thinkingBudget: 5000, maxOutputTokens: 8000, requestTimeoutMs: 300000 }
});
