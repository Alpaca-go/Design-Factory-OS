import { adaptBrandContext } from './brand-context-adapter.js';
import { availability } from './availability.js';
import { buildQualityContext } from './quality-context.js';
import { NO_EVALUATOR_VERSION, REPORT_ADAPTER_VERSION } from './versions.js';

export function adaptReportQualityContext({
  source,
  brandSource = source,
  projectId,
  runId,
  evaluatorVersion = NO_EVALUATOR_VERSION,
  generatedAt
}) {
  const input = structuredClone(source ?? {});
  const checkpointEntry = reportCheckpoint(input);
  const run = input.result || input;
  const markdown = typeof checkpointEntry?.output === 'string'
    ? checkpointEntry.output
    : firstDefined(run.reportMarkdown, run.markdown, run.report);
  const recommendation = run.recommendation || input.recommendation;
  const comparison = Array.isArray(recommendation?.comparison) ? recommendation.comparison : undefined;
  const scores = Array.isArray(run.scores)
    ? run.scores
    : comparison?.map((item) => ({ id: item.directionId, score: item.final_score ?? item.comparisonScore }));
  const ranking = Array.isArray(run.ranking)
    ? run.ranking
    : comparison?.slice().sort((left, right) => left.rank - right.rank).map((item) => item.directionId);
  const normalizedOutput = compact({
    sections: markdown === undefined ? undefined : [markdown],
    report_language_metadata: run.languageMetadata || input.languageMetadata,
    direction_names: run.directions?.directions?.map((item) => item.name),
    comparison,
    scores,
    ranking,
    recommendation: recommendation ? compact({
      direction_id: recommendation.direction_id || recommendation.recommendedDirectionId || recommendation.id,
      status: recommendation.status,
      reason_basis: recommendation.reason_basis,
      evidence_confidence: recommendation.evidence_confidence,
      evidence_ids: recommendation.evidence_ids,
      weak_evidence_warning: recommendation.weak_evidence_warning,
      rationale: recommendation.rationale
    }) : undefined,
    claims: run.claims,
    assets: run.assets,
    provenance: run.provenance,
    asset_changes: run.asset_changes,
    packaging_changes: run.packaging_changes,
    suggested_assets: run.suggestedAssets || run.suggested_assets,
    field_availability: {
      report_markdown: availability(markdown, Boolean(source)),
      scores: availability(scores, Boolean(source)),
      ranking: availability(ranking, Boolean(source)),
      recommendation: availability(recommendation, Boolean(source)),
      claims: availability(run.claims, Boolean(source))
    }
  });
  const checkpoint = checkpointEntry?.checkpoint;
  return buildQualityContext({
    module: 'report',
    source: input,
    output: normalizedOutput,
    brandContext: adaptBrandContext(brandSource),
    sourceContext: {
      source_type: checkpoint ? 'visual_translation_checkpoint' : 'report',
      source_stage: availability(checkpoint?.stageId || (markdown !== undefined ? '10-local-report-compiler' : undefined), Boolean(source)),
      checkpoint_version: availability(checkpoint?.version, Boolean(checkpoint)),
      protocol_version: availability(checkpoint?.protocolVersion || input.protocolVersion, Boolean(source)),
      fixture_id: availability(input.fixture_id, Boolean(source))
    },
    adapterVersion: REPORT_ADAPTER_VERSION,
    evaluatorVersion,
    projectId: projectId || checkpoint?.projectId || input.projectId,
    runId: runId || checkpoint?.analysisRunId || input.analysisRunId,
    generatedAt
  });
}

function reportCheckpoint(source) {
  return source.checkpoints?.['10-local-report-compiler']
    || source['10-local-report-compiler']
    || (source.checkpoint?.stageId === '10-local-report-compiler' ? source : null);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
