export const ANALYSIS_PIPELINE_MODES = Object.freeze({
  RETRIEVAL_FIRST: 'retrieval_first',
  VISUAL_FACT_FIRST_LEGACY: 'visual_fact_first_legacy',
  DEEP_ANALYSIS_LEGACY: 'deep_analysis_legacy',
  // Backward-compatible persisted values. They remain internal-only.
  VISUAL_FACT_FIRST: 'visual_fact_first',
  LEGACY_DEEP_ANALYSIS: 'legacy_deep_analysis'
});

export const DEFAULT_ANALYSIS_PIPELINE_MODE = ANALYSIS_PIPELINE_MODES.RETRIEVAL_FIRST;

export function normalizeAnalysisPipelineMode(value) {
  const selected = value || process.env.MASTERPIECE_VISUAL_PIPELINE_MODE || DEFAULT_ANALYSIS_PIPELINE_MODE;
  if (!Object.values(ANALYSIS_PIPELINE_MODES).includes(selected)) {
    throw Object.assign(new Error(`Unknown analysis_pipeline_mode: ${selected}`), {
      code: 'UNKNOWN_ANALYSIS_PIPELINE_MODE', path: 'analysis_pipeline_mode'
    });
  }
  return selected;
}

export function isVisualFactFirstMode(value) {
  return [
    ANALYSIS_PIPELINE_MODES.RETRIEVAL_FIRST,
    ANALYSIS_PIPELINE_MODES.VISUAL_FACT_FIRST_LEGACY,
    ANALYSIS_PIPELINE_MODES.VISUAL_FACT_FIRST
  ].includes(normalizeAnalysisPipelineMode(value));
}

export function isRetrievalFirstMode(value) {
  return normalizeAnalysisPipelineMode(value) === ANALYSIS_PIPELINE_MODES.RETRIEVAL_FIRST;
}
