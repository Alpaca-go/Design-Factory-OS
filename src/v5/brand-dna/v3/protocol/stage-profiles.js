export const V3_STAGE_PROFILES = Object.freeze({
  '01-evidence-map': { thinking: false, thinkingBudget: null, maxOutputTokens: 8000, requestTimeoutMs: 180000, stageBudgetMs: 300000 },
  '02-brand-creative-decision': { thinking: true, thinkingBudget: 6000, maxOutputTokens: 10000, requestTimeoutMs: 300000, stageBudgetMs: 420000 },
  'decision-patch': { thinking: false, thinkingBudget: null, maxOutputTokens: 1500, requestTimeoutMs: 120000, stageBudgetMs: 150000 },
  '05-visual-system-task-plan': { thinking: true, thinkingBudget: 3000, maxOutputTokens: 8000, requestTimeoutMs: 240000, stageBudgetMs: 360000 },
  '06-image-prompt-compiler': { thinking: false, thinkingBudget: null, maxOutputTokens: 8000, requestTimeoutMs: 240000, stageBudgetMs: 360000 },
  '07-final-audit': { thinking: true, thinkingBudget: 2500, maxOutputTokens: 4000, requestTimeoutMs: 240000, stageBudgetMs: 360000 }
});
