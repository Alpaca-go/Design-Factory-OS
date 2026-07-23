import { adaptBrandContext } from './brand-context-adapter.js';
import { availability } from './availability.js';
import { buildQualityContext } from './quality-context.js';
import { NO_EVALUATOR_VERSION, VISUAL_DIRECTION_ADAPTER_VERSION } from './versions.js';

export function adaptVisualDirectionQualityContext({
  source,
  brandSource = source,
  projectId,
  runId,
  evaluatorVersion = NO_EVALUATOR_VERSION,
  generatedAt
}) {
  const input = structuredClone(source ?? {});
  const extracted = extractDirectionParts(input);
  const directionsAvailable = Array.isArray(extracted.directions);
  const recommendationAvailable = Boolean(extracted.recommendation && typeof extracted.recommendation === 'object');
  const normalizedOutput = {
    field_availability: {
      directions: availability(extracted.directions, Boolean(source)),
      recommendation: availability(extracted.recommendation, Boolean(source)),
      assets: availability(extracted.assets, Boolean(source)),
      claims: availability(extracted.claims, Boolean(source)),
      suggested_assets: availability(extracted.suggestedAssets, Boolean(source))
    },
    ...(directionsAvailable ? { directions: extracted.directions.map(normalizeDirection) } : {}),
    ...(recommendationAvailable ? { recommendation: normalizeDirectionRecommendation(extracted.recommendation) } : {}),
    ...(extracted.differenceMatrix ? { difference_matrix: structuredClone(extracted.differenceMatrix) } : {}),
    ...(Array.isArray(extracted.assets) ? { assets: extracted.assets } : {}),
    ...(Array.isArray(extracted.claims) ? { claims: extracted.claims } : {}),
    ...(Array.isArray(extracted.suggestedAssets) ? { suggested_assets: extracted.suggestedAssets } : {})
  };
  const checkpoint = extracted.checkpoint;
  return buildQualityContext({
    module: 'visual_direction',
    source: input,
    output: normalizedOutput,
    brandContext: adaptBrandContext(brandSource),
    sourceContext: {
      source_type: checkpoint ? 'visual_translation_checkpoint' : 'visual_translation_result',
      source_stage: availability(checkpoint?.stageId || extracted.sourceStage, Boolean(source)),
      checkpoint_version: availability(checkpoint?.version, Boolean(checkpoint)),
      protocol_version: availability(checkpoint?.protocolVersion || input.protocolVersion, Boolean(source)),
      fixture_id: availability(input.fixture_id, Boolean(source))
    },
    adapterVersion: VISUAL_DIRECTION_ADAPTER_VERSION,
    evaluatorVersion,
    projectId: projectId || checkpoint?.projectId || input.projectId,
    runId: runId || checkpoint?.analysisRunId || input.analysisRunId,
    generatedAt
  });
}

function extractDirectionParts(source) {
  const directionsCheckpoint = checkpointEntry(source, '04-three-creative-directions');
  const recommendationCheckpoint = checkpointEntry(source, '05-direction-recommendation');
  const run = source.result || source;
  const directionsValue = directionsCheckpoint?.output || run.directions || run.visualCreativeDirections || run.output?.directions;
  const recommendation = recommendationCheckpoint?.output || run.recommendation || run.output?.recommendation;
  const evidenceMap = run.evidenceMap || source.evidenceMap || source.output?.evidenceMap;
  return {
    directions: directionsValue?.directions || (Array.isArray(directionsValue) ? directionsValue : undefined),
    recommendation,
    assets: run.assets || source.assets,
    claims: run.claims || source.claims,
    suggestedAssets: evidenceMap?.suggestedAssets || run.suggestedAssets || source.suggestedAssets,
    differenceMatrix: directionsValue?.differenceMatrix || run.differenceMatrix || source.differenceMatrix,
    checkpoint: directionsCheckpoint?.checkpoint,
    sourceStage: directionsCheckpoint ? '04-three-creative-directions' : 'completed-directions'
  };
}

function checkpointEntry(source, stageId) {
  return source.checkpoints?.[stageId] || source[stageId] || (source.checkpoint?.stageId === stageId ? source : null);
}

function normalizeDirection(direction, index) {
  const explicitFingerprint = direction.visual_fingerprint;
  const fingerprint = explicitFingerprint ? structuredClone(explicitFingerprint) : compact({
    composition: direction.compositionLanguage,
    graphic_mechanism: direction.distinctiveMechanism,
    material_family: direction.materialLanguage
  });
  return compact({
    id: direction.directionId || direction.id || `unknown-${index + 1}`,
    name: direction.name,
    visual_fingerprint: fingerprint,
    visual_fingerprint_availability: {
      silhouette: availability(explicitFingerprint?.silhouette),
      composition: availability(explicitFingerprint?.composition ?? direction.compositionLanguage),
      graphic_mechanism: availability(explicitFingerprint?.graphic_mechanism ?? direction.distinctiveMechanism),
      material_family: availability(explicitFingerprint?.material_family ?? direction.materialLanguage),
      emotional_role: availability(explicitFingerprint?.emotional_role)
    },
    subject_policy: direction.subject_policy || direction.subjectPolicy,
    brand_fit: direction.brandFit,
    inspiration_value: direction.inspirationValue,
    distinctiveness: direction.distinctiveness,
    scalability: direction.scalability,
    reason_basis: direction.reason_basis,
    evidence_confidence: direction.evidence_confidence,
    evidence_ids: direction.evidence_ids || direction.evidenceIds,
    risk_breakdown: direction.risk_breakdown,
    risks: direction.risks,
    executable_asset_ids: direction.executable_asset_ids || direction.executableAssetIds
  });
}

function normalizeDirectionRecommendation(recommendation) {
  return compact({
    direction_id: recommendation.direction_id || recommendation.recommendedDirectionId || recommendation.id,
    selection_method: recommendation.selection_method,
    strategic_factors: recommendation.strategic_factors,
    rationale: recommendation.rationale,
    comparison: recommendation.comparison,
    reason_basis: recommendation.reason_basis,
    evidence_confidence: recommendation.evidence_confidence,
    evidence_ids: recommendation.evidence_ids,
    weak_evidence_warning: recommendation.weak_evidence_warning,
    human_selection_required: recommendation.humanSelectionRequired
  });
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
