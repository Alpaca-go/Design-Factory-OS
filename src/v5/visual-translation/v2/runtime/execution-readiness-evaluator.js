// Execution Readiness Evaluator v1 (doc section 七).
//
// Deterministic, offline scoring of a single validated v2 direction. Produces
// nine 1–5 metrics, a 0–100 readiness score, and the `execution_status` gate.
// If the direction fails the hard pass criteria it must NOT proceed to Anchor
// Image Exploration (status = rewrite_required).

import {
  checkAntiConceptArtConstraints,
  detectAbstractOnlyDependency,
  detectRealEstateDrift
} from './anti-concept-art-constraints.js';

export const EXECUTION_READINESS_EVALUATOR_VERSION = 'execution-readiness-evaluator-v1';

// Hard pass criteria (doc section 7). Lower-is-better metrics use `max`.
export const EXECUTION_READINESS_PASS_CRITERIA = Object.freeze({
  industry_recognition_strength: { min: 4 },
  directly_executable_degree: { min: 4 },
  flat_design_conversion_ability: { min: 4 },
  brand_exclusivity: { min: 4 },
  concept_art_risk: { max: 2 },
  real_estate_drift_risk: { max: 2 }
});

const FLAT_DESIGN_TOUCHPOINTS = ['poster', 'packaging_front', 'digital_hero', 'capability_deck', 'exhibition_backdrop'];
const NAMED_DELIVERABLE_TOUCHPOINTS = ['poster', 'packaging_front', 'digital_hero', 'capability_deck'];

function isFull(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function scoreIndustryRecognition(direction) {
  const layer = direction.industry_recognition_layer;
  const populated = [
    layer.industry_visual_objects?.length || 0,
    layer.industry_data_objects?.length || 0,
    layer.industry_process_objects?.length || 0,
    layer.industry_space_and_real_scenes?.length || 0,
    layer.usable_business_objects?.length || 0
  ].filter((n) => n > 0).length;
  let score = Math.min(5, 1 + Math.min(populated, 4));
  const declared = layer.minimum_industry_recognition_strength;
  if (typeof declared === 'number') score = Math.min(score, declared);
  return score;
}

function scoreDirectlyExecutable(direction) {
  let score = 1;
  const templatesOk = (direction.composition_templates?.length || 0) >= 2 &&
    (direction.composition_templates || []).every((t) => isFull(t.subject_position) && isFull(t.information_position) && isFull(t.image_object_rule) && (t.negative_constraints?.length || 0) >= 1);
  if (templatesOk) score += 1;
  const examplesOk = (direction.execution_examples?.length || 0) >= 3 &&
    (direction.execution_examples || []).every((e) => isFull(e.subject) && isFull(e.visual_structure) && isFull(e.information_position) && (e.reused_assets?.length || 0) >= 1);
  if (examplesOk) score += 1;
  const categories = new Set((direction.execution_examples || []).map((e) => e.touchpoint_category));
  if (['core_brand', 'capability_product', 'digital_event'].every((c) => categories.has(c))) score += 1;
  const layoutOk = direction.layout_behavior &&
    isFull(direction.layout_behavior.subject_area) && isFull(direction.layout_behavior.info_area) &&
    isFull(direction.layout_behavior.brand_area) && isFull(direction.layout_behavior.whitespace_area) &&
    isFull(direction.layout_behavior.data_note_area) && isFull(direction.layout_behavior.multi_size_adaptation);
  if (layoutOk) score += 1;
  return Math.min(5, score);
}

function scoreReusableAssets(direction) {
  const n = direction.core_reusable_assets?.length || 0;
  return Math.min(5, Math.max(1, n));
}

function scoreFlatDesign(direction, violationCount) {
  let score = 1;
  const g = direction.graphic_system || {};
  if (isFull(g.how_graphics_form) && isFull(g.brand_fact_mapping) && isFull(g.scale_crop_repeat) && isFull(g.enter_touchpoints) && isFull(g.must_not_become)) score += 1;
  const layoutOk = direction.layout_behavior &&
    isFull(direction.layout_behavior.subject_area) && isFull(direction.layout_behavior.info_area) &&
    isFull(direction.layout_behavior.brand_area) && isFull(direction.layout_behavior.whitespace_area) &&
    isFull(direction.layout_behavior.data_note_area) && isFull(direction.layout_behavior.multi_size_adaptation);
  if (layoutOk) score += 1;
  if ((direction.composition_templates?.length || 0) >= 2) score += 1;
  if (violationCount === 0) score += 1;
  return Math.min(5, score);
}

function scoreTouchpointCoverage(direction) {
  const touchpoints = new Set((direction.composition_templates || []).map((t) => t.touchpoint));
  return Math.min(5, Math.max(1, touchpoints.size));
}

function scoreBrandExclusivity(direction) {
  let score = 1;
  if (isFull(direction.strategic_idea) && direction.strategic_idea.length >= 15) score += 1;
  if ((direction.evidence_ids?.length || 0) >= 1) score += 1;
  if (isFull(direction.brand_evidence) && direction.brand_evidence.length > 20) score += 1;
  if ((direction.execution_examples || []).some((e) => isFull(e.industry_recognition_source) && e.industry_recognition_source.length > 10)) score += 1;
  return Math.min(5, score);
}

function scoreConceptArtRisk(violationCount) {
  if (violationCount <= 0) return 1;
  if (violationCount === 1) return 3;
  if (violationCount === 2) return 4;
  return 5;
}

function scoreRealEstateDrift(direction) {
  const signals = detectRealEstateDrift(direction);
  if (signals.length === 0) return 1;
  if (signals.length === 1) return 3;
  return 5;
}

function scoreAbstractDependency(direction, industryScore) {
  let score = industryScore >= 4 ? 1 : industryScore === 3 ? 2 : industryScore === 2 ? 3 : 4;
  const abstractSignals = detectAbstractOnlyDependency(direction);
  if (abstractSignals.length > 0) score = Math.min(5, score + 1);
  return score;
}

export function evaluateExecutionReadiness(direction, { blockingFailure = false } = {}) {
  const { violations } = checkAntiConceptArtConstraints(direction);
  const industry = scoreIndustryRecognition(direction);
  const metrics = {
    industry_recognition_strength: industry,
    directly_executable_degree: scoreDirectlyExecutable(direction),
    reusable_visual_asset_count: scoreReusableAssets(direction),
    flat_design_conversion_ability: scoreFlatDesign(direction, violations.length),
    real_touchpoint_coverage: scoreTouchpointCoverage(direction),
    brand_exclusivity: scoreBrandExclusivity(direction),
    concept_art_risk: scoreConceptArtRisk(violations.length),
    real_estate_drift_risk: scoreRealEstateDrift(direction),
    abstract_object_dependency: scoreAbstractDependency(direction, industry)
  };

  const failed = [];
  for (const [key, rule] of Object.entries(EXECUTION_READINESS_PASS_CRITERIA)) {
    const value = metrics[key];
    if (rule.min !== undefined && value < rule.min) failed.push({ metric: key, expected: `>= ${rule.min}`, actual: value });
    if (rule.max !== undefined && value > rule.max) failed.push({ metric: key, expected: `<= ${rule.max}`, actual: value });
  }

  const readiness_score = Math.max(0, Math.min(100, Math.round(
    metrics.industry_recognition_strength * 8 +
    metrics.directly_executable_degree * 8 +
    metrics.flat_design_conversion_ability * 8 +
    metrics.brand_exclusivity * 8 +
    metrics.real_touchpoint_coverage * 4 +
    metrics.reusable_visual_asset_count * 4 -
    (metrics.concept_art_risk - 1) * 6 -
    (metrics.real_estate_drift_risk - 1) * 6 -
    (metrics.abstract_object_dependency - 1) * 3
  )));

  const execution_status = failed.length === 0 ? 'ready' : 'rewrite_required';

  // §11 fix: a direction that fails any blocking gate (hard pass criterion) must
  // never display a high/perfect readiness score. Cap at 59 so we can no longer
  // produce `100/100 + rewrite_required`. `blockingFailure` lets the compile
  // step force the cap when a set-level gate (brand identity, etc.) fails too.
  const scoreCapped = failed.length > 0 || blockingFailure === true;
  const cappedScore = scoreCapped ? Math.min(readiness_score, 59) : readiness_score;

  return {
    evaluator_version: EXECUTION_READINESS_EVALUATOR_VERSION,
    direction_id: direction.direction_id,
    direction_name: direction.direction_name,
    metrics,
    readiness_score: cappedScore,
    score_capped: scoreCapped,
    execution_status,
    failed_criteria: failed,
    concept_art_violations: violations,
    real_estate_drift_signals: detectRealEstateDrift(direction)
  };
}
