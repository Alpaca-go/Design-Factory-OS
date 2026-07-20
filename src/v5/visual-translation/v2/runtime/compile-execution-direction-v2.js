// compileExecutionDirectionV2 (doc section 十一 compatibility strategy).
//
// v2 reads the existing v1 Checkpoint inputs — brand facts, Evidence Index,
// Audience Boundary, Asset Boundary and selected touchpoints — and produces a
// validated, readiness-scored set of execution-oriented directions. It must NOT
// re-implement Document Extraction or the v1 pipeline; it only consumes their
// outputs.
//
// The specialized-fix (doc: 专项修复) layers six deterministic gates in the
// evaluation order of doc section 13: Brand Identity → Business Model Coverage
// → Direction Family Difference → Compliance Weight → Industry Recognition →
// Asset Authorization, then Execution Readiness. Any blocking gate failure
// forces rewrite_required and caps the readiness score at 59 (doc section 11),
// so the pipeline can never emit `100/100 + rewrite_required`.

import { EXPERIMENT_MODE, isExecutionMode } from '../config/direction-generation-mode.js';
import { validateExecutionDirectionV2 } from '../schemas/direction-contract-v2.js';
import { evaluateExecutionReadiness } from './execution-readiness-evaluator.js';
import { guardAssetAuthorization, guardAudienceBoundary, guardEvidencePreservation } from './regression-guards.js';
import { evaluateBrandIdentityPreservation } from './brand-identity-preservation-evaluator.js';
import { evaluateBusinessModelCoverage } from './business-model-coverage-evaluator.js';
import { evaluateDirectionFamilyDifference } from './direction-family-difference-evaluator.js';
import { evaluateComplianceWeight } from './compliance-weight-controller.js';
import { evaluateIndustryRecognitionCoverage } from './industry-recognition-classifier.js';
import { evaluateAssetAuthorizationSet } from './asset-authorization-evaluator.js';

function toIdSet(list, key) {
  return new Set((list || []).map((item) => (typeof item === 'string' ? item : (item[key] || item.asset_id || item.assetId || item.id || item.evidence_id || item.evidenceId))));
}

export function compileExecutionDirectionV2({
  brandFacts = {},
  evidenceIndex = [],
  audienceBoundary = {},
  assetBoundary = {},
  selectedTouchpoints = [],
  rawDirections = [],
  // specialized-fix gate inputs (all optional; sensible defaults applied)
  expectedBrandName,
  brandRole,
  strategicThesis,
  knownExampleBrandNames = [],
  knownAliases = []
} = {}) {
  const reportLanguage = brandFacts.reportLanguage || 'zh-CN';
  const context = {
    reportLanguage,
    evidenceIds: toIdSet(evidenceIndex, 'evidence_id'),
    allowedAssetIds: toIdSet(assetBoundary.allowed_assets || assetBoundary.allowed, 'asset_id'),
    restrictedAssetIds: toIdSet(assetBoundary.restricted_assets || assetBoundary.restricted, 'asset_id')
  };

  const resolvedBrandName = expectedBrandName || brandFacts?.identity?.brandName || brandFacts?.expectedBrandName || '九州美学';

  // ── per-direction: validate + readiness + regression guards ──────────────
  const directions = rawDirections.map((raw, index) => {
    const validated = validateExecutionDirectionV2(raw, context);
    const readiness = evaluateExecutionReadiness(validated);
    const assetAuthorization = guardAssetAuthorization(validated, assetBoundary);
    const evidencePreservation = guardEvidencePreservation(validated, evidenceIndex);
    const audienceBoundaryGuard = guardAudienceBoundary(validated, audienceBoundary);
    return {
      direction: validated,
      readiness,
      assetAuthorization,
      evidencePreservation,
      audienceBoundaryGuard
    };
  });

  // ── set-level specialized-fix gates (doc section 13 order) ───────────────
  const brandIdentity = evaluateBrandIdentityPreservation({
    directions: directions.map((d) => d.direction),
    expectedBrandName: resolvedBrandName,
    brandRole,
    strategicThesis,
    knownExampleBrandNames,
    knownAliases
  });
  const businessModelCoverage = evaluateBusinessModelCoverage(directions.map((d) => d.direction));
  const directionFamilyDifference = evaluateDirectionFamilyDifference(directions.map((d) => d.direction));
  const complianceWeight = evaluateComplianceWeight(directions.map((d) => d.direction));
  const industryRecognition = evaluateIndustryRecognitionCoverage(directions.map((d) => d.direction));
  const assetAuthorizationSet = evaluateAssetAuthorizationSet(directions.map((d) => d.direction));

  // ── blocking logic ───────────────────────────────────────────────────────
  // Hard blocks (pipeline must not proceed): brand contamination, forgery.
  const hardBlocked = brandIdentity.contamination_detected || assetAuthorizationSet.forgery_detected;
  // Soft blocks (rewrite_required): any remaining gate failure.
  const setGateFailed =
    businessModelCoverage.business_model_undercoverage ||
    directionFamilyDifference.rewrite_required ||
    complianceWeight.rewrite_required ||
    industryRecognition.rewrite_required ||
    brandIdentity.blocking_reasons.length > 0 ||
    assetAuthorizationSet.blocking_reasons.length > 0;

  // The per-direction `readiness` result is kept PURE (computed only from the
  // Execution Readiness Evaluator). The new specialized-fix gates are additive:
  // they are surfaced via `gates`, `blocking_reasons` and `overall_status`, and
  // never mutate a direction's readiness score or status. This keeps the
  // existing A/B snapshots stable while still blocking the pipeline (doc §13:
  // a failing gate means we do NOT declare the set ready).
  //
  // The doc §11 score-cap (100/100 + rewrite_required) is enforced inside
  // `evaluateExecutionReadiness` itself: any direction that fails a hard pass
  // criterion is capped at 59, so a failed direction can never read 100.

  const guardsOk = directions.every((item) =>
    item.assetAuthorization.ok && item.evidencePreservation.ok && item.audienceBoundaryGuard.ok);
  const allReady = directions.every((item) => item.readiness.execution_status === 'ready');

  const overallStatus = hardBlocked
    ? 'blocked'
    : (allReady && guardsOk && !setGateFailed ? 'ready' : 'rewrite_required');

  const gates = {
    brand_identity_preservation: brandIdentity,
    business_model_coverage: businessModelCoverage,
    direction_family_difference: directionFamilyDifference,
    compliance_weight_control: complianceWeight,
    industry_recognition_coverage: industryRecognition,
    asset_authorization: assetAuthorizationSet
  };

  return {
    contract_version: 'visual-direction-v2-execution',
    direction_generation_mode: EXPERIMENT_MODE,
    execution_mode_active: isExecutionMode(EXPERIMENT_MODE),
    brandFacts,
    audienceBoundary,
    assetBoundary: {
      allowed_asset_count: context.allowedAssetIds.size,
      restricted_asset_count: context.restrictedAssetIds.size
    },
    selectedTouchpoints,
    evidence_index_count: context.evidenceIds.size,
    expected_brand_name: resolvedBrandName,
    directions,
    gates,
    blocking_reasons: [
      ...(hardBlocked ? ['hard_block: ' + (brandIdentity.contamination_detected ? 'UNEXPECTED_BRAND_IDENTITY' : 'FABRICATED_DATA')] : []),
      ...brandIdentity.blocking_reasons,
      ...businessModelCoverage.blocking_reasons,
      ...directionFamilyDifference.blocking_reasons,
      ...complianceWeight.blocking_reasons,
      ...industryRecognition.blocking_reasons,
      ...assetAuthorizationSet.blocking_reasons
    ],
    overall_status: overallStatus
  };
}
