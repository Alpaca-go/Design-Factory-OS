export const PIPELINE_COMPLETENESS = Object.freeze({
  COMPLETE: 'complete',
  PARTIAL: 'partial',
  FALLBACK: 'fallback',
  FAILED: 'failed'
});

export const VISUAL_FACT_FIRST_REQUIRED_ARTIFACTS = Object.freeze([
  '01-Visual-Brief.json',
  '01-Visual-Brief.md',
  '02-Visual-Asset-Evidence.json',
  '02-Visual-Asset-Evidence.md',
  '03-Benchmark-Query-Plan.json',
  '03-Benchmark-Cases.json',
  '04-Visual-Opportunity-Synthesis.json',
  '04-Visual-Opportunity-Synthesis.md',
  '05-Step4-Input-Context.json',
  '06-Visual-Directions.json',
  '06-Visual-Directions-Report.md',
  '06-Visual-Directions-Audit.md'
]);

export function evaluatePipelineCompleteness({
  artifactNames = [], visualFacts, benchmarkRetrieval, visualOpportunitySynthesis,
  step4Context, usedLegacyFallback = false, step4InputValid = true
} = {}) {
  if (usedLegacyFallback) return PIPELINE_COMPLETENESS.FALLBACK;
  if (!step4InputValid || !step4Context) return PIPELINE_COMPLETENESS.FAILED;
  const names = new Set(artifactNames);
  const upstreamArtifacts = VISUAL_FACT_FIRST_REQUIRED_ARTIFACTS.slice(0, 9);
  const upstreamFilesExist = upstreamArtifacts.every((name) => names.has(name));
  const benchmarkExists = Array.isArray(benchmarkRetrieval?.cases)
    && benchmarkRetrieval.cases.length > 0
    && ['completed', 'partial', 'fixture'].includes(benchmarkRetrieval.retrieval_status);
  const opportunitiesExist = Array.isArray(visualOpportunitySynthesis?.differentiation_opportunities)
    && visualOpportunitySynthesis.differentiation_opportunities.length >= 3;
  return visualFacts && upstreamFilesExist && benchmarkExists && opportunitiesExist
    ? PIPELINE_COMPLETENESS.COMPLETE
    : PIPELINE_COMPLETENESS.PARTIAL;
}
