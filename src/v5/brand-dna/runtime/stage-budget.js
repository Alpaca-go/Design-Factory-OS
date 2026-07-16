export const BRAND_DNA_PIPELINE_BUDGET_MS = 30 * 60 * 1000;

export const BRAND_DNA_STAGE_PROFILES = Object.freeze({
  'atomic-evidence': Object.freeze({
    modelRole: 'structure',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 8_000,
    requestTimeoutMs: 180_000,
    stageBudgetMs: 300_000
  }),
  'normalized-facts': Object.freeze({
    modelRole: 'structure',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 6_000,
    requestTimeoutMs: 180_000,
    stageBudgetMs: 300_000
  }),
  'fact-reconciliation': Object.freeze({
    modelRole: 'structure',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 4_000,
    requestTimeoutMs: 180_000,
    stageBudgetMs: 300_000
  }),
  'strategic-model': Object.freeze({
    modelRole: 'deep-reasoning',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 5_000,
    requestTimeoutMs: 300_000,
    stageBudgetMs: 420_000
  }),
  'strategic-critic': Object.freeze({
    modelRole: 'deep-reasoning',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 5_000,
    requestTimeoutMs: 300_000,
    stageBudgetMs: 420_000
  }),
  'dna-synthesis': Object.freeze({
    modelRole: 'deep-reasoning',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 6_000,
    requestTimeoutMs: 300_000,
    stageBudgetMs: 420_000
  }),
  'creative-thesis-decision': Object.freeze({
    modelRole: 'deep-reasoning',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 4_000,
    requestTimeoutMs: 300_000,
    stageBudgetMs: 420_000
  }),
  'visual-causal-translation': Object.freeze({
    modelRole: 'deep-reasoning',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 6_000,
    requestTimeoutMs: 300_000,
    stageBudgetMs: 420_000
  }),
  'gpt-image-task-compiler': Object.freeze({
    modelRole: 'compiler',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 10_000,
    requestTimeoutMs: 240_000,
    stageBudgetMs: 360_000
  }),
  'structured-patch-repair': Object.freeze({
    modelRole: 'structure',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 1_500,
    requestTimeoutMs: 90_000,
    stageBudgetMs: 120_000
  }),
  'quality-auditor': Object.freeze({
    modelRole: 'auditor',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 4_000,
    requestTimeoutMs: 240_000,
    stageBudgetMs: 360_000
  }),
  'quality-auditor-recheck': Object.freeze({
    modelRole: 'auditor',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 4_000,
    requestTimeoutMs: 240_000,
    stageBudgetMs: 360_000
  }),
  'targeted-repair': Object.freeze({
    modelRole: 'deep-reasoning',
    thinking: { enabled: false, budgetTokens: null },
    maxOutputTokens: 4_000,
    requestTimeoutMs: 240_000,
    stageBudgetMs: 360_000
  })
});

export class BrandDnaTimeoutError extends Error {
  constructor(code, stageId, message) {
    super(message);
    this.name = 'BrandDnaTimeoutError';
    this.code = code;
    this.stageId = stageId;
    this.abortReason = code === 'STAGE_TIMEOUT' ? 'stage-timeout' : 'pipeline-budget';
  }
}

export function stageProfile(stageId, overrides = {}) {
  const base = BRAND_DNA_STAGE_PROFILES[stageId] || BRAND_DNA_STAGE_PROFILES['strategic-model'];
  const override = overrides?.[stageId] || {};
  return {
    ...base,
    ...override,
    thinking: { ...base.thinking, ...(override.thinking || {}) }
  };
}

export function assertPipelineBudget(startedAtMs, budgetMs = BRAND_DNA_PIPELINE_BUDGET_MS) {
  if (Date.now() - startedAtMs >= budgetMs) {
    throw new BrandDnaTimeoutError(
      'PIPELINE_TIME_BUDGET_EXCEEDED',
      null,
      'Brand DNA Pipeline 已超过总时间预算。'
    );
  }
}

export function remainingPipelineBudget(startedAtMs, budgetMs = BRAND_DNA_PIPELINE_BUDGET_MS) {
  return Math.max(0, budgetMs - (Date.now() - startedAtMs));
}
