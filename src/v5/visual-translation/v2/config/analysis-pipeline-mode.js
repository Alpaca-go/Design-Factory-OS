export const ANALYSIS_PIPELINE_MODES = Object.freeze({
  LEGACY_DEEP_ANALYSIS: 'legacy_deep_analysis',
  VISUAL_FACT_FIRST: 'visual_fact_first'
});

// Core API calls remain backward compatible. The experiment Desktop selects
// Visual Fact First through its persisted default setting.
export const DEFAULT_ANALYSIS_PIPELINE_MODE = ANALYSIS_PIPELINE_MODES.LEGACY_DEEP_ANALYSIS;

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
  return normalizeAnalysisPipelineMode(value) === ANALYSIS_PIPELINE_MODES.VISUAL_FACT_FIRST;
}
