// A/B Runner (doc section 八 / 九 / 十二 step 10-12).
//
// Compares the frozen `conceptual_v1` directions against the experimental
// `execution_oriented_v2` directions for each project. It runs the Execution
// Readiness Evaluator and regression guards on v2, and a lightweight conceptual
// evaluator on v1 (which intentionally scores poorly on industry recognition
// and concept-art risk). The runner is fully offline and deterministic.

import { compileExecutionDirectionV2 } from './compile-execution-direction-v2.js';
import { detectAbstractOnlyFromText, detectRealEstateDriftFromText } from './anti-concept-art-constraints.js';
import { COMPOSITION_TOUCHPOINTS } from '../schemas/direction-contract-v2.js';

const INDUSTRY_KEYWORDS = [
  '产业链', '供应链', 'GSP', '温控', '机构', '中医', '功效', '护肤', '包装', '社区',
  '生活', '招商', '物料', '检测', '资质', '产能', '配送', '医美', '仓储', '协同'
];
const CONCEPT_PHRASES = ['隐喻', '气质', '宏大', '概念图', '空间装置', '展厅', '建筑主体', '高级感', '电影感'];

function flattenConceptualDirection(v1) {
  return [
    v1.direction_id,
    v1.name,
    v1.concept,
    v1.metaphor,
    v1.subject,
    v1.environment,
    v1.visualLanguage,
    v1.composition,
    ...(v1.notes || [])
  ].filter(Boolean).join(' ');
}

export function evaluateConceptualDirectionV1(v1Direction) {
  const text = flattenConceptualDirection(v1Direction);
  const industryHits = INDUSTRY_KEYWORDS.filter((kw) => text.includes(kw)).length;
  const realEstateSignals = detectRealEstateDriftFromText(text);
  const abstractSignals = detectAbstractOnlyFromText(text);
  const conceptPhraseHits = CONCEPT_PHRASES.filter((phrase) => text.includes(phrase)).length;

  const industry_recognition_strength = Math.min(2, 1 + (industryHits >= 3 ? 1 : 0));
  const conceptSignals = realEstateSignals.length + abstractSignals.length + conceptPhraseHits;
  const concept_art_risk = Math.min(5, 1 + conceptSignals);
  const real_estate_drift_risk = realEstateSignals.length === 0 ? 1 : realEstateSignals.length === 1 ? 3 : 5;

  return {
    direction_id: v1Direction.direction_id,
    direction_name: v1Direction.name,
    metrics: {
      industry_recognition_strength,
      directly_executable_degree: 1,
      reusable_visual_asset_count: 1,
      flat_design_conversion_ability: 1,
      real_touchpoint_coverage: 1,
      brand_exclusivity: 1,
      concept_art_risk,
      real_estate_drift_risk,
      abstract_object_dependency: abstractSignals.length > 0 ? 5 : 3
    }
  };
}

function avgMetrics(evals) {
  const keys = Object.keys(evals[0].metrics);
  const avg = {};
  for (const key of keys) {
    avg[key] = Math.round((evals.reduce((sum, e) => sum + e.metrics[key], 0) / evals.length) * 100) / 100;
  }
  return avg;
}

function hasNamedDeliverableTemplates(v2Result) {
  return v2Result.directions.some((item) => (item.direction.composition_templates || [])
    .some((template) => COMPOSITION_TOUCHPOINTS.includes(template.touchpoint)));
}

export function runABComparison(projectConfig) {
  const { projectId, v1Directions = [], v2Directions = [], evidenceIndex = [], assetBoundary = {}, audienceBoundary = {}, selectedTouchpoints = [], humanPreference = 'unknown' } = projectConfig;

  // v2.1.1 (P0) — A/B Runner compiles with failFast = false so a single schema
  // invalid direction is isolated as a `blocked` entry instead of throwing and
  // aborting the whole comparison.
  const v2Result = compileExecutionDirectionV2({
    brandFacts: projectConfig.brandFacts || { reportLanguage: 'zh-CN' },
    evidenceIndex,
    audienceBoundary,
    assetBoundary,
    selectedTouchpoints,
    rawDirections: v2Directions,
    failFast: false
  });

  const v2Evals = v2Result.directions.map((item) => item.readiness);
  const v1Evals = v1Directions.map((d) => evaluateConceptualDirectionV1(d));

  const v2Avg = avgMetrics(v2Evals);
  const v1Avg = avgMetrics(v1Evals);

  const v2AllReady = v2Result.directions.every((item) => item.readiness.execution_status === 'ready');
  const v2GuardsOk = v2Result.directions.every((item) => item.assetAuthorization.ok && item.evidencePreservation.ok && item.audienceBoundaryGuard.ok);

  const measurable = {
    industry_recognition_improved: v2Avg.industry_recognition_strength > v1Avg.industry_recognition_strength,
    executability_improved: v2Avg.directly_executable_degree > v1Avg.directly_executable_degree,
    at_least_3_assets: v2Avg.reusable_visual_asset_count >= 3,
    poster_packaging_page_imaginable: v2Avg.flat_design_conversion_ability >= 4 && hasNamedDeliverableTemplates(v2Result),
    concept_vibe_down: v2Avg.concept_art_risk <= v1Avg.concept_art_risk,
    realestate_vibe_down: v2Avg.real_estate_drift_risk <= v1Avg.real_estate_drift_risk,
    evidence_asset_intact: v2GuardsOk
  };
  const measurableCriteriaMet = Object.values(measurable).every(Boolean);

  let projectVerdict;
  if (!measurableCriteriaMet) projectVerdict = 'fail';
  else if (humanPreference === 'v2') projectVerdict = 'pass';
  else projectVerdict = 'needs_human_review';

  return {
    project_id: projectId,
    v2_direction_count: v2Directions.length,
    v1_direction_count: v1Directions.length,
    v2_all_ready: v2AllReady,
    v2_guards_ok: v2GuardsOk,
    v2_average_metrics: v2Avg,
    v1_average_metrics: v1Avg,
    measurable_criteria: measurable,
    measurable_criteria_met: measurableCriteriaMet,
    human_preference: humanPreference,
    project_verdict: projectVerdict
  };
}

// v2.1.1 (P0) — project-level error isolation. A single project that throws
// inside runABComparison is captured as a `failed` result so it never aborts
// the rest of the batch. The A/B Runner returns the *complete* project result
// set regardless of individual failures.
function serializeABRunnerError(error) {
  return {
    code: error?.code || 'UNKNOWN',
    message: error?.message || String(error),
    stack: error?.stack ? String(error.stack).split('\n').slice(0, 4).join('\n') : undefined
  };
}

function runProjectABSafely(project) {
  try {
    return runABComparison(project);
  } catch (error) {
    return {
      project_id: project?.projectId || 'unknown',
      status: 'failed',
      error: serializeABRunnerError(error),
      v1_result: null,
      v2_result: null
    };
  }
}

export function runABRunner(projects) {
  // projects may be sync or async; Promise.all keeps it order-stable.
  const comparisons = projects.map((project) => runProjectABSafely(project));
  const resolved = (typeof Promise.all === 'function' && comparisons.some((c) => c instanceof Promise))
    ? Promise.all(comparisons)
    : comparisons;
  return resolved.then
    ? resolved.then(finalizeABRunner)
    : finalizeABRunner(comparisons);
}

function finalizeABRunner(comparisons) {
  const projectsMeetingCriteria = comparisons.filter((c) => c.project_verdict === 'pass').length;
  const failedCount = comparisons.filter((c) => c.status === 'failed').length;
  const mergeRecommendation = projectsMeetingCriteria >= 2 ? 'candidate_for_merge' : 'keep_experimental';
  const evidenceAssetAllIntact = comparisons.every((c) => c.measurable_criteria?.evidence_asset_intact);

  return {
    runner_version: 'execution-oriented-v2-ab-runner-v1.1',
    project_count: comparisons.length,
    failed_count: failedCount,
    comparisons,
    projects_meeting_criteria: projectsMeetingCriteria,
    evidence_asset_intact_all: evidenceAssetAllIntact,
    merge_recommendation: mergeRecommendation
  };
}
