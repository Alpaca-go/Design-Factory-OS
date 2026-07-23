// Stage 04 v2 output-budget estimator (doc: v2 Stage 04 输出截断修复, §7).
//
// Rough token budget for the execution-oriented direction schema so callers can
// sanity-check the requested maxOutputTokens before paying for a truncated run.
// The estimate is intentionally conservative (×1.35 safety margin) and must
// always be capped by the provider's real maxOutputTokens.

const TOKEN_WEIGHTS = Object.freeze({
  base: 800,
  directionBase: 1500,
  asset: 150,
  template: 220,
  example: 220
});

export function estimateStage04V2OutputBudget({
  directionCount = 3,
  reusableAssetsPerDirection = 4,
  compositionTemplatesPerDirection = 2,
  executionExamplesPerDirection = 3
} = {}) {
  const perDirection =
    TOKEN_WEIGHTS.directionBase +
    reusableAssetsPerDirection * TOKEN_WEIGHTS.asset +
    compositionTemplatesPerDirection * TOKEN_WEIGHTS.template +
    executionExamplesPerDirection * TOKEN_WEIGHTS.example;
  return Math.ceil((TOKEN_WEIGHTS.base + directionCount * perDirection) * 1.35);
}

// Utilisation of the requested output budget for a completed generation.
export function outputUtilization({ completionTokens, requestedMaxOutputTokens }) {
  if (!requestedMaxOutputTokens || requestedMaxOutputTokens <= 0) return 0;
  return completionTokens / requestedMaxOutputTokens;
}
