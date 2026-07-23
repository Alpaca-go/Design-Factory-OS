import { assetId, deepFreeze } from '../schemas/sprint-2-schema-utils.js';
import { validateSprint2RuntimeCheckpoint } from './sprint-2-runtime-checkpoint-store.js';

const GRAMMAR_MODULES = Object.freeze([
  'shape_composition_grammar',
  'material_lighting_grammar',
  'motion_information_grammar'
]);

export function buildSprint2QualitySummary(checkpoint) {
  const value = validateSprint2RuntimeCheckpoint(checkpoint);
  const anchorFindings = value.anchor_evaluation_results.flatMap((evaluation) => evaluation.findings || []);
  const grammarFindings = GRAMMAR_MODULES.flatMap((module) => value.semantic_evaluation_results[module]?.findings || []);
  const dnaUnits = value.visual_dna ? [...value.visual_dna.primary_dna, ...value.visual_dna.supporting_dna] : [];
  const restrictedIds = new Set(value.input_contract.restricted_assets.map((asset, index) => assetId(asset, `restrictedAssets[${index}]`)));
  const executable = new Set(value.generation_boundary?.executable_assets || []);
  const nonExecutable = new Set(value.generation_boundary?.non_executable_assets || []);
  const restrictedAssetExclusion = value.generation_boundary
    ? [...restrictedIds].every((id) => !executable.has(id) && nonExecutable.has(id))
    : null;
  const retryCount = value.retry_history.filter((entry) => entry.attempt > 1).length + value.candidate_retry_history.length;
  const semanticNotEvaluated = [
    ...value.anchor_evaluation_results,
    ...Object.values(value.semantic_evaluation_results)
  ].filter((evaluation) => evaluation?.status === 'not_evaluated').length;
  return deepFreeze({
    quality_summary_version: 'sprint-2-quality-summary-v1',
    project_id: value.project_id,
    run_id: value.run_id,
    anchor_candidate_count: value.anchor_candidates.length,
    valid_anchor_candidate_count: value.anchor_evaluation_results.filter((evaluation) => evaluation.passed === true).length,
    candidate_difference_status: value.anchor_candidate_difference_matrix?.status || 'not_available',
    candidate_difference_minimum: value.anchor_candidate_difference_matrix?.minimum_total_score ?? 7,
    anchor_anti_patterns: detectedIds(anchorFindings),
    confirmed_anchor_status: value.confirmed_anchor ? 'confirmed' : 'not_confirmed',
    visual_dna_count: dnaUnits.length,
    visual_dna_status: value.module_status.visual_dna.status,
    grammar_stage_status: Object.fromEntries(GRAMMAR_MODULES.map((module) => [module, value.module_status[module].status])),
    grammar_conflicts: detectedIds(grammarFindings.filter((finding) => ['AP-GRA-003', 'CAL-GRA-CROSS-CONFLICT', 'CAL-GRA-ANCHOR-INHERITANCE'].includes(finding.anti_pattern_id))),
    restricted_asset_exclusion_status: restrictedAssetExclusion === null ? 'not_compiled' : (restrictedAssetExclusion ? 'pass' : 'fail'),
    retry_count: retryCount,
    semantic_not_evaluated_count: semanticNotEvaluated,
    overall_status: overallStatus(value, restrictedAssetExclusion, anchorFindings, grammarFindings)
  });
}

function detectedIds(findings) {
  return [...new Set(findings.filter((finding) => finding.detected).map((finding) => finding.anti_pattern_id))];
}

function overallStatus(checkpoint, restrictedAssetExclusion, anchorFindings, grammarFindings) {
  if (checkpoint.status === 'failed' || restrictedAssetExclusion === false) return 'reject';
  if (checkpoint.status === 'awaiting_anchor_confirmation') return 'awaiting_human_review';
  if (checkpoint.status !== 'completed') return 'in_progress';
  if ([...anchorFindings, ...grammarFindings].some((finding) => finding.detected)) return 'repair';
  return 'pass';
}
