// compileExecutionDirectionV2 (doc section 十一 compatibility strategy).
//
// v2 reads the existing v1 Checkpoint inputs — brand facts, Evidence Index,
// Audience Boundary, Asset Boundary and selected touchpoints — and produces a
// validated, readiness-scored set of execution-oriented directions. It must NOT
// re-implement Document Extraction or the v1 pipeline; it only consumes their
// outputs.
//
// The specialized-fix (doc: 专项修复) layers these deterministic gates in the
// evaluation order of doc section 13: Brand Identity → Business Model Coverage
// → Consumer Value Coverage → Direction Family Difference → Compliance Weight →
// E02 Aesthetic → Industry Recognition → Asset Authorization, then Execution
// Readiness.
//
// v2.1 splits the per-direction verdict into `content_readiness_score`
// (0–100, content completeness) and `execution_permission_status`
// (allowed / conditional / blocked). A content-complete direction may still be
// `blocked` by a set-level gate, and a `blocked` direction never displays a
// perfect readiness score (capped at 59, doc section 三 / 十一).
//
// v2.1.1 (P0) — error isolation:
//   - Production pipeline keeps fail-fast (failFast = true): a single invalid
//     direction throws FAILED_SCHEMA and aborts the batch, as before.
//   - A/B Runner passes failFast = false: each direction is compiled safely;
//     an invalid direction is captured as `blocked` with a `validation_error`
//     (code / message / path / issues) instead of crashing the whole project.
//   - The set-level gates only run over the *valid* directions; a project that
//     contains schema-invalid directions is itself `blocked` but does not
//     prevent sibling projects from being evaluated.

import { EXPERIMENT_MODE, isExecutionMode } from '../config/direction-generation-mode.js';
import { validateExecutionDirectionV2 } from '../schemas/direction-contract-v2.js';
import { evaluateExecutionReadiness, EXECUTION_READINESS_EVALUATOR_VERSION } from './execution-readiness-evaluator.js';
import { guardAssetAuthorization, guardAudienceBoundary, guardEvidencePreservation } from './regression-guards.js';
import { evaluateBrandIdentityPreservation } from './brand-identity-preservation-evaluator.js';
import { evaluateBusinessModelCoverage } from './business-model-coverage-evaluator.js';
import { evaluateConsumerValueCoverage } from './consumer-value-coverage-evaluator.js';
import { evaluateDirectionFamilyDifference } from './direction-family-difference-evaluator.js';
import { evaluateComplianceWeight } from './compliance-weight-controller.js';
import { evaluateE02AestheticGate } from './e02-aesthetic-gate.js';
import { evaluateIndustryRecognitionCoverage } from './industry-recognition-classifier.js';
import { evaluateAssetAuthorizationSet } from './asset-authorization-evaluator.js';
import { evaluateSpatialDrift } from './spatial-drift-evaluator.js';
import { validateGlobalAssetIds } from './asset-id-validator.js';
import { evaluateConsumerWeightConsistency } from './consumer-weight-consistency.js';
import { evaluateExecutionExampleCompleteness, hasMeaningfulValue } from './execution-example-completeness-evaluator.js';
import { evaluateExecutionExampleSpecificity } from './execution-example-specificity-evaluator.js';
import { aggregateGateIssues } from './gate-issue-aggregator.js';
import { evaluateGroupVisualAuthorization } from './group-visual-authorization-evaluator.js';
import { evaluateDirectionTouchpointRisk } from './direction-touchpoint-risk-evaluator.js';
import { classifyPlaceholder } from './placeholder-classifier.js';

// v2.1.4 — unified execution example quality computation (doc §三).
// Computes the single source of truth for touchpoint coverage scoring.
function computeExecutionExampleQuality(completeness, specificity) {
  const countCoverageRatio = completeness.total_expected > 0
    ? Math.min(1, completeness.total_examples / completeness.total_expected)
    : 0;
  const fieldCompletenessRatio = completeness.field_completeness || 0;
  const specificityRatio = specificity ? specificity.specificity_score : 1;
  const diversityRatio = specificity ? specificity.diversity_score : 1;

  const finalTouchpointScore5 = Math.round(
    10 * (
      5 * (
        0.25 * countCoverageRatio +
        0.35 * fieldCompletenessRatio +
        0.20 * specificityRatio +
        0.20 * diversityRatio
      )
    )
  ) / 10;

  return {
    count_coverage_ratio: Math.round(countCoverageRatio * 100) / 100,
    field_completeness_ratio: Math.round(fieldCompletenessRatio * 100) / 100,
    specificity_ratio: Math.round(specificityRatio * 100) / 100,
    diversity_ratio: Math.round(diversityRatio * 100) / 100,
    final_touchpoint_score_5: finalTouchpointScore5
  };
}

// v2.1.4 — unified report state resolver (doc §四).
function resolveReportState({ blockingIssues, rewriteIssues, conditionalIssues, infoIssues }) {
  if (blockingIssues.length) {
    return { permission: 'blocked', status: 'blocked' };
  }
  if (rewriteIssues.length) {
    return { permission: 'conditional', status: 'rewrite_required' };
  }
  if (conditionalIssues.length) {
    return { permission: 'conditional', status: 'ready_with_warnings' };
  }
  return { permission: 'allowed', status: 'ready', info_count: infoIssues.length };
}

function issueMessage(code) {
  const labels = {
    schema_validation_failed: '存在未通过结构校验的方向。',
    UNEXPECTED_BRAND_IDENTITY: '检测到非项目品牌身份。',
    brand_name_not_preserved: '项目品牌名称未被完整保留。',
    forgery_detected: '检测到未授权数据或资质仿制风险。',
    duplicate_asset_id: '检测到跨方向重复的资产 ID。',
    set_missing_consumer_value: '方向集合未满足消费者价值覆盖要求。',
    business_model_undercoverage: '方向集合的业务模型覆盖不足。',
    direction_family_difference: '方向家族差异不足。',
    compliance_weight: '方向权重分布不满足约束。',
    industry_recognition: '行业识别覆盖不足。',
    spatial_drift: '方向存在空间或地产视觉漂移。',
    consumer_weight_consistency: '消费者角色与权重不一致。'
  };
  return labels[code] || `Gate 触发：${code}`;
}

function buildStructuredGateIssues({
  blockingIssues,
  rewriteIssues,
  conditionalIssues,
  infoIssues,
  validDirections,
  blockedEntries,
  brandIdentity,
  assetAuthorizationSet,
  spatialDrift,
  e02Aesthetic,
  consumerWeightConsistency,
  executionExampleCompleteness,
  groupVisualAuthorization,
  touchpointRisk
}) {
  const issues = [];
  const directionSpecificCode = (code) => code === 'schema_validation_failed'
    || code === 'UNEXPECTED_BRAND_IDENTITY' || code === 'brand_name_not_preserved'
    || code === 'forgery_detected' || code === 'spatial_drift'
    || code === 'consumer_weight_consistency' || code.startsWith('e02_')
    || code.startsWith('brand_') || code.startsWith('strategic_') || code.startsWith('industry_identity_')
    || code.startsWith('execution_example_');
  for (const [severity, codes] of [
    ['blocking', blockingIssues],
    ['rewrite', rewriteIssues],
    ['warning', conditionalIssues],
    ['info', infoIssues]
  ]) {
    for (const code of codes) {
      if (directionSpecificCode(code)) continue;
      issues.push({
        code,
        severity,
        scope: 'collection',
        issue_scope: 'collection',
        source_direction_ids: [],
        collection_effect: true,
        affected_execution_scope: code === 'duplicate_asset_id' ? 'global_execution' : 'direction_set',
        affected_direction_ids: [],
        matched_rule: code,
        message: issueMessage(code),
        recommendation: '查看对应 Gate 明细和方向级证据后修正。'
      });
    }
  }

  for (const entry of blockedEntries) {
    issues.push({
      code: 'SCHEMA_VALIDATION_FAILED', severity: 'blocking', scope: 'direction',
      direction_id: entry.direction.direction_id,
      field_path: entry.validation_error?.path || 'visualDirectionV2',
      detected_value: entry.validation_error?.code,
      matched_rule: 'direction_contract_v2',
      evidence_excerpt: entry.validation_error?.message,
      confidence: 1, message: '方向未通过 V2 Contract 校验。',
      recommendation: '按字段路径修复结构后重新编译。'
    });
  }

  issues.push(...(brandIdentity.issues || []));
  issues.push(...(groupVisualAuthorization?.issues || []));
  issues.push(...(touchpointRisk?.issues || []));

  for (const item of assetAuthorizationSet.per_direction || []) {
    const sourceDirection = validDirections.find((direction) => direction.direction_id === item.direction_id);
    for (const detection of item.detections || []) {
      const placeholderType = detection.risk_level === 'warning'
        ? classifyPlaceholder(detection, sourceDirection)
        : undefined;
      const safeStructure = placeholderType === 'safe_structure_placeholder';
      issues.push({
        code: detection.risk_level === 'blocked' ? 'FORGERY_DETECTED' : 'ASSET_AUTHORIZATION_WARNING',
        severity: detection.risk_level === 'blocked' ? 'blocking' : safeStructure ? 'info' : 'warning',
        scope: 'direction', direction_id: item.direction_id,
        field_path: detection.field_path || 'visualDirectionV2',
        detected_value: detection.detected_text,
        matched_rule: detection.rule_id || detection.detection_type,
        evidence_excerpt: detection.reason || detection.detected_text,
        confidence: detection.confidence,
        value_source: detection.value_source || 'provider',
        placeholder_type: placeholderType,
        hide_from_user_issues: safeStructure,
        keep_in_audit: true,
        message: detection.reason || '检测到资产授权或数据真实性风险。',
        recommendation: detection.suggested_rewrite || '仅使用有证据支持、已授权或结构化脱敏的内容。'
      });
    }
  }

  if (spatialDrift.warning || spatialDrift.rewrite_required) {
    for (const evidence of spatialDrift.evidence || []) {
      issues.push({
        code: 'SPATIAL_DRIFT',
        severity: spatialDrift.rewrite_required ? 'rewrite' : 'warning',
        scope: 'direction',
        ...evidence,
        message: '检测到空间、展陈或地产视觉语言。',
        recommendation: '空间对象只能作为局部证据，主视觉应回到平面图形与信息系统。'
      });
    }
  }

  if (e02Aesthetic?.evaluated_direction_id && (e02Aesthetic.rewrite_required || e02Aesthetic.positive_quality_status === 'conditional')) {
    issues.push({
      code: e02Aesthetic.resolution_code || 'E02_POSITIVE_QUALITY',
      severity: e02Aesthetic.rewrite_required ? 'rewrite' : 'warning',
      scope: 'direction', direction_id: e02Aesthetic.evaluated_direction_id,
      issue_scope: 'direction', source_direction_ids: [e02Aesthetic.evaluated_direction_id],
      collection_effect: true, affected_execution_scope: 'local_direction',
      field_path: 'visualDirectionV2', matched_rule: 'e02_positive_quality',
      detected_value: (e02Aesthetic.positive_quality_failing_dimensions || []).join(',') || 'conditional',
      message: '产品材料方向的正向质量需要重写或补强。',
      recommendation: '保留平台角色，以产品对象、平台选择标准和品牌专属呈现机制重写。'
    });
  }

  for (const item of consumerWeightConsistency?.per_direction || []) {
    if (item.consistent && !item.present_none_conflict) continue;
    issues.push({
      code: 'CONSUMER_WEIGHT_CONSISTENCY', severity: 'rewrite', scope: 'direction',
      direction_id: item.direction_id, issue_scope: 'direction', source_direction_ids: [item.direction_id],
      collection_effect: true, affected_execution_scope: 'local_direction',
      field_path: 'visualDirectionV2.compliance_weights.consumer_value_weight',
      detected_value: `${item.consumer_value_role}=${item.consumer_value_weight}`,
      matched_rule: item.present_none_conflict ? 'present_true_role_none' : 'consumer_role_weight_mismatch',
      message: '消费者角色与权重不一致。', recommendation: '对齐消费者角色、显式价值闭环和消费者权重。'
    });
  }

  for (const item of executionExampleCompleteness?.per_direction || []) {
    for (const example of item.examples || []) {
      const missing = [...example.critical_missing, ...example.required_missing];
      if (!missing.length) continue;
      issues.push({
        code: 'EXECUTION_EXAMPLE_MISSING', severity: 'rewrite', scope: 'direction',
        direction_id: item.direction_id, issue_scope: 'direction', source_direction_ids: [item.direction_id],
        collection_effect: true, affected_execution_scope: 'local_direction',
        field_path: `visualDirectionV2.execution_examples[${example.touchpoint}]`,
        detected_value: missing.join(','), matched_rule: 'meaningful_execution_example_fields',
        message: `执行示例存在无意义空值或缺失字段：${missing.join('、')}。`,
        recommendation: '补充可直接执行的真实字段值，破折号和占位词不计为完整。'
      });
    }
  }

  return aggregateGateIssues(issues);
}

// v2.1 — required fields that make an Execution Example "complete" (doc section 六).
const REQUIRED_EXAMPLE_FIELDS = [
  'subject', 'visual_structure', 'information_position', 'industry_recognition_source',
  'touchpoint', 'audience', 'communication_goal', 'hero_subject', 'industry_content',
  'layout_structure', 'information_hierarchy', 'brand_specific_detail',
  'supporting_subjects', 'prohibited_content',
  // v2.1.1 — enriched execution-example gate (doc section 六). A complete example
  // must also pin its hero position, information zone and brand zone so a designer
  // can start without guessing.
  'hero_subject_position', 'information_zone', 'brand_zone'
];

function isFull(value) {
  return hasMeaningfulValue(value);
}

// True when the direction outputs exactly 3 complete, touchpoint-distinct
// Execution Examples (doc section 六).
export function hasCompleteExecutionExamples(direction) {
  const examples = direction.execution_examples || [];
  if (examples.length !== 3) return false;
  const touchpoints = new Set();
  for (const example of examples) {
    if (!REQUIRED_EXAMPLE_FIELDS.every((field) => isFull(example[field]))) return false;
    if (example.reused_assets?.length < 1) return false;
    const tp = example.touchpoint || '';
    if (!isFull(tp) || touchpoints.has(tp)) return false;
    touchpoints.add(tp);
  }
  return true;
}

function toIdSet(list, key) {
  return new Set((list || []).map((item) => (typeof item === 'string' ? item : (item[key] || item.asset_id || item.assetId || item.id || item.evidence_id || item.evidenceId))));
}

function resolveLocalDirectionState(directionId, entry, gates) {
  const hard = [];
  const rewrite = [];
  const warnings = [];
  const brandIssues = (gates.brandIdentity.issues || []).filter((issue) => issue.direction_id === directionId);
  hard.push(...brandIssues.filter((issue) => issue.severity === 'blocking').map((issue) => issue.code));
  rewrite.push(...brandIssues.filter((issue) => issue.severity === 'rewrite').map((issue) => issue.code));
  warnings.push(...brandIssues.filter((issue) => issue.severity === 'warning').map((issue) => issue.code));

  if (!entry.assetAuthorization.ok) hard.push('FORGERY_DETECTED');
  if ((entry.assetAuthorization.detections || []).some((item) => item.risk_level === 'warning')) warnings.push('ASSET_AUTHORIZATION_WARNING');
  if ((gates.groupVisualAuthorization?.per_direction || []).some((item) => item.direction_id === directionId)) rewrite.push('UNSUPPORTED_GROUP_VISUAL_AUTHORIZATION');
  warnings.push(...(gates.touchpointRisk?.per_direction || [])
    .filter((item) => item.direction_id === directionId)
    .flatMap((item) => item.risks.map((risk) => risk.code)));

  const completeness = gates.executionExampleCompleteness.per_direction.find((item) => item.direction_id === directionId);
  if (completeness?.blocked || completeness?.conditional) rewrite.push('EXECUTION_EXAMPLE_MISSING');
  else if (completeness?.warning) warnings.push('EXECUTION_EXAMPLE_WARNING');

  const consumer = gates.consumerWeightConsistency.per_direction.find((item) => item.direction_id === directionId);
  if (consumer && (!consumer.consistent || consumer.present_none_conflict)) rewrite.push('CONSUMER_WEIGHT_CONSISTENCY');

  const business = gates.businessModelCoverage.per_direction.find((item) => item.direction_id === directionId);
  if (business && !business.meets_minimum) rewrite.push('BUSINESS_MODEL_UNDERCOVERAGE');
  const industry = gates.industryRecognition.per_direction.find((item) => item.direction_id === directionId);
  if (industry && !industry.meets_minimum) rewrite.push('INDUSTRY_RECOGNITION');

  if (gates.e02Aesthetic.evaluated_direction_id === directionId) {
    if (gates.e02Aesthetic.rewrite_required) rewrite.push(gates.e02Aesthetic.resolution_code || 'E02_POSITIVE_QUALITY');
    else if (gates.e02Aesthetic.positive_quality_status === 'conditional' || gates.e02Aesthetic.positive_quality_pass_with_warning) warnings.push('E02_QUALITY_WARNING');
  }

  const spatialEvidence = (gates.spatialDrift.evidence || []).some((item) => item.direction_id === directionId);
  if (spatialEvidence && gates.spatialDrift.rewrite_required) rewrite.push('SPATIAL_DRIFT');
  else if (spatialEvidence && gates.spatialDrift.warning) warnings.push('SPATIAL_DRIFT_WARNING');

  const specificity = gates.executionExampleSpecificity.per_direction.find((item) => item.direction_id === directionId);
  if (specificity?.within_direction_template_overlap > 0.7) rewrite.push('EXECUTION_TEMPLATE_OVERLAP');
  else if (specificity?.within_direction_template_overlap >= 0.5) warnings.push('EXECUTION_TEMPLATE_WARNING');

  if (entry.readiness.execution_status === 'rewrite_required') rewrite.push('READINESS_REWRITE_REQUIRED');
  else if (entry.readiness.execution_status === 'ready_with_warnings') warnings.push('READINESS_WARNING');

  const uniqueHard = [...new Set(hard)];
  const uniqueRewrite = [...new Set(rewrite)];
  const uniqueWarnings = [...new Set(warnings)];
  if (uniqueHard.length) return { status: 'blocked', permission: 'blocked', hard: uniqueHard, rewrite: uniqueRewrite, warnings: uniqueWarnings };
  if (uniqueRewrite.length) return { status: 'rewrite_required', permission: 'conditional', hard: uniqueHard, rewrite: uniqueRewrite, warnings: uniqueWarnings };
  if (uniqueWarnings.length) return { status: 'ready_with_warnings', permission: 'conditional', hard: uniqueHard, rewrite: uniqueRewrite, warnings: uniqueWarnings };
  return { status: 'ready', permission: 'allowed', hard: [], rewrite: [], warnings: [] };
}

// Build a self-contained "blocked" entry for a direction that failed schema
// validation. It carries the validation_error and a minimal direction stub so
// downstream report/metric consumers never dereference a null direction.
function makeBlockedEntry(raw, validationError) {
  const root = raw?.visualDirectionV2 || raw || {};
  const directionId = raw?.direction_id || root.direction_id || 'unknown';
  const directionName = raw?.direction_name || root.direction_name || '未命名方向';
  return {
    status: 'blocked',
    validation_error: validationError,
    direction: {
      direction_id: directionId,
      direction_name: directionName,
      strategic_idea: '',
      industry_recognition_layer: {
        industry_visual_objects: [], industry_data_objects: [], industry_process_objects: [],
        industry_space_and_real_scenes: [], usable_business_objects: [],
        prohibited_misleading_templates: [], minimum_industry_recognition_strength: 1
      },
      core_reusable_assets: [],
      graphic_system: { how_graphics_form: '', brand_fact_mapping: '', scale_crop_repeat: '', enter_touchpoints: '', must_not_become: '' },
      photography_object_system: {
        needs_photography: 'optional', real_industry_objects: [], subject_and_background: '',
        people_product_packaging: '', graphic_overlay: '',
        real_content_ratio: { real_industry_content_ratio: 0, branded_graphic_ratio: 0, information_layout_ratio: 0 }
      },
      information_system: { core_brand_info: '', capability_product_info: '', data_qualification_info: '', cta_info: '', information_hierarchy: [], fabricated_info_prohibited: [] },
      layout_behavior: { subject_area: '', info_area: '', brand_area: '', whitespace_area: '', data_note_area: '', multi_size_adaptation: '' },
      composition_templates: [],
      material_and_light_support: {},
      execution_examples: [],
      brand_evidence: '',
      execution_constraints: [],
      anti_concept_art_constraints: [],
      template_risks: [],
      readiness_score: null,
      direction_family: undefined,
      family_type: undefined,
      compliance_weights: {},
      industry_recognition_classification: undefined,
      asset_authorization: undefined,
      downstream_consumer_value: undefined
    },
    readiness: {
      evaluator_version: EXECUTION_READINESS_EVALUATOR_VERSION,
      direction_id: directionId,
      direction_name: directionName,
      metrics: {
        industry_recognition_strength: 1, directly_executable_degree: 1, reusable_visual_asset_count: 1,
        flat_design_conversion_ability: 1, real_touchpoint_coverage: 1, brand_exclusivity: 1,
        concept_art_risk: 1, real_estate_drift_risk: 1, abstract_object_dependency: 1
      },
      readiness_score: 0,
      content_readiness_score: 0,
      score_capped: true,
      execution_status: 'rewrite_required',
      failed_criteria: [{ metric: 'schema_validation_failed', expected: 'valid contract', actual: validationError?.code || 'FAILED_SCHEMA' }],
      concept_art_violations: [],
      real_estate_drift_signals: []
    },
    assetAuthorization: {
      direction_id: directionId, ok: false, forgery_violations: [], detections: [],
      data_authorization_level: 'abstracted', document_visualization_mode: 'structure_only',
      credential_usage_mode: 'redacted', generated_data_policy: 'abstracted'
    },
    evidencePreservation: { ok: true, details: {} },
    audienceBoundaryGuard: { ok: true, details: {} },
    examples_complete: false,
    execution_permission_status: 'blocked',
    content_readiness_score: 0
  };
}

export function compileExecutionDirectionV2({
  brandFacts = {},
  evidenceIndex = [],
  audienceBoundary = {},
  assetBoundary = {},
  selectedTouchpoints = [],
  rawDirections = [],
  // v2.1.1 — when true (production pipeline) a single invalid direction throws
  // FAILED_SCHEMA and aborts the batch. When false (A/B Runner) invalid
  // directions are isolated as `blocked` entries (doc section 三 P0).
  failFast = true,
  // specialized-fix gate inputs (all optional; sensible defaults applied)
  expectedBrandName,
  brandRole,
  strategicThesis,
  knownExampleBrandNames = [],
  knownAliases = []
} = {}) {
  const reportLanguage = brandFacts.reportLanguage || 'zh-CN';
  const evidenceBoundOptions = Array.isArray(brandFacts?.evidenceBoundValues)
    ? { evidenceBoundValues: brandFacts.evidenceBoundValues, enforceEvidenceBoundValues: true }
    : {};
  const context = {
    reportLanguage,
    evidenceIds: toIdSet(evidenceIndex, 'evidence_id'),
    allowedAssetIds: toIdSet(assetBoundary.allowed_assets || assetBoundary.allowed, 'asset_id'),
    restrictedAssetIds: toIdSet(assetBoundary.restricted_assets || assetBoundary.restricted, 'asset_id')
  };

  const resolvedBrandName = expectedBrandName || brandFacts?.identity?.brandName || brandFacts?.expectedBrandName || '九州美学';

  // ── per-direction: validate + regression guards (isolated) ───────────────
  // v2.1.4 — readiness is evaluated AFTER set-level gates so that
  // execution_example_quality can be injected (doc §三).  Directions returned
  // by validateExecutionDirectionV2 may be frozen, so we shallow-copy before
  // attaching new properties.
  const rawEntries = rawDirections.map((raw, index) => {
    try {
      const validated = validateExecutionDirectionV2(raw, context);
      const assetAuthorization = evaluateAssetAuthorizationSet([validated], evidenceBoundOptions).per_direction[0];
      const evidencePreservation = guardEvidencePreservation(validated, evidenceIndex);
      const audienceBoundaryGuard = guardAudienceBoundary(validated, audienceBoundary);
      const examplesComplete = hasCompleteExecutionExamples(validated);

      // Per-direction execution permission (doc section 三): `blocked` only on
      // hard failure (forgery); `conditional` on a direction-local quality gate;
      // otherwise `allowed`.
      let permission = 'allowed';
      if (!assetAuthorization.ok) permission = 'blocked';
      else if (!examplesComplete) permission = 'conditional';

      return {
        status: 'compiled',
        direction: validated,
        // readiness will be filled in after set-level gates (see below)
        readiness: null,
        assetAuthorization,
        evidencePreservation,
        audienceBoundaryGuard,
        examples_complete: examplesComplete,
        execution_permission_status: permission,
        validation_error: null
      };
    } catch (error) {
      if (error.code !== 'FAILED_SCHEMA') throw error; // unknown error: fail-fast
      if (failFast) throw error;                       // production: fail-fast
      return makeBlockedEntry(raw, {
        code: error.code,
        message: error.message,
        path: error.path ?? null,
        issues: error.issues ?? []
      });
    }
  });

  const compiledEntries = rawEntries.filter((e) => e.status === 'compiled');
  const blockedEntries = rawEntries.filter((e) => e.status === 'blocked');
  const validDirections = compiledEntries.map((e) => e.direction);

  // ── set-level specialized-fix gates (doc section 13 order) ───────────────
  const brandIdentity = evaluateBrandIdentityPreservation({
    directions: validDirections,
    expectedBrandName: resolvedBrandName,
    brandRole,
    strategicThesis,
    knownExampleBrandNames,
    knownAliases,
    sourceEvidenceText: JSON.stringify({ brandFacts, evidenceIndex })
  });
  const businessModelCoverage = evaluateBusinessModelCoverage(validDirections);
  const consumerValueCoverage = evaluateConsumerValueCoverage(validDirections);
  const directionFamilyDifference = evaluateDirectionFamilyDifference(validDirections);
  const complianceWeight = evaluateComplianceWeight(validDirections);
  const e02Aesthetic = evaluateE02AestheticGate(validDirections);
  if (evidenceBoundOptions.enforceEvidenceBoundValues && e02Aesthetic.evaluated_direction_id) {
    const e02Direction = validDirections.find((direction) => direction.direction_id === e02Aesthetic.evaluated_direction_id);
    const mechanism = e02Direction?.selection_mechanism;
    const selectionMechanismComplete = Boolean(
      mechanism
      && hasMeaningfulValue(mechanism.selection_dimensions)
      && hasMeaningfulValue(mechanism.visual_mapping_rule)
      && hasMeaningfulValue(mechanism.multi_category_rule)
      && hasMeaningfulValue(mechanism.comparison_behavior)
      && hasMeaningfulValue(mechanism.platform_signature)
    );
    e02Aesthetic.selection_mechanism_complete = selectionMechanismComplete;
    if (!selectionMechanismComplete) {
      e02Aesthetic.rewrite_required = true;
      e02Aesthetic.resolution_code = 'ANCHOR_MECHANISM_ENHANCEMENT_REQUIRED';
      e02Aesthetic.blocking_reasons = [...new Set([...(e02Aesthetic.blocking_reasons || []), 'e02_selection_mechanism_incomplete'])];
    }
  }
  const industryRecognition = evaluateIndustryRecognitionCoverage(validDirections);
  const assetAuthorizationSet = evaluateAssetAuthorizationSet(validDirections, evidenceBoundOptions);
  const groupVisualAuthorization = evaluateGroupVisualAuthorization(validDirections, brandFacts?.brandRelationship, resolvedBrandName);
  const touchpointRisk = evaluateDirectionTouchpointRisk(validDirections);
  const assetIdUniqueness = validateGlobalAssetIds(validDirections);
  const spatialDrift = evaluateSpatialDrift(validDirections);
  const consumerWeightConsistency = evaluateConsumerWeightConsistency(validDirections);
  const executionExampleCompleteness = evaluateExecutionExampleCompleteness(validDirections);
  const executionExampleSpecificity = evaluateExecutionExampleSpecificity(validDirections);
  const executionExampleQuality = computeExecutionExampleQuality(executionExampleCompleteness, executionExampleSpecificity);

  // v2.1.4 — attach execution_example_quality to each direction and re-evaluate readiness.
  const directionsWithQuality = validDirections.map((dir) => ({
    ...dir,
    execution_example_quality: executionExampleQuality
  }));

  // Re-evaluate readiness now that execution_example_quality is available.
  for (let i = 0; i < compiledEntries.length; i++) {
    const entry = compiledEntries[i];
    const dirWithQuality = directionsWithQuality[i];
    const blockingFailure = entry.execution_permission_status === 'blocked';
    entry.readiness = evaluateExecutionReadiness(dirWithQuality, { blockingFailure });
    entry.direction = dirWithQuality;
  }

  // ── v2.1.4 unified status resolver (doc §四) ──────────────────────────────
  const blockingIssues = [];
  const rewriteIssues = [];
  const conditionalIssues = [];
  const infoIssues = [];

  // Hard blocks.
  if (blockedEntries.length > 0) blockingIssues.push('schema_validation_failed');
  if (brandIdentity.error_code === 'UNEXPECTED_BRAND_IDENTITY') blockingIssues.push('UNEXPECTED_BRAND_IDENTITY');
  if (!brandIdentity.brand_name_preserved) blockingIssues.push('brand_name_not_preserved');
  if (assetAuthorizationSet.forgery_detected) blockingIssues.push('forgery_detected');
  if (assetIdUniqueness.duplicate_detected) blockingIssues.push('duplicate_asset_id');

  // Rewrite-level issues.
  if (consumerValueCoverage.set_missing_consumer_value) rewriteIssues.push('set_missing_consumer_value');
  if (executionExampleCompleteness.any_blocked) rewriteIssues.push('execution_example_critical_missing');
  else if (executionExampleCompleteness.any_conditional) rewriteIssues.push('execution_example_required_missing');
  if (businessModelCoverage.business_model_undercoverage) rewriteIssues.push('business_model_undercoverage');
  if (directionFamilyDifference.rewrite_required) rewriteIssues.push('direction_family_difference');
  if (complianceWeight.rewrite_required) rewriteIssues.push('compliance_weight');
  if (e02Aesthetic.rewrite_required) rewriteIssues.push(...e02Aesthetic.blocking_reasons);
  if (industryRecognition.rewrite_required) rewriteIssues.push('industry_recognition');
  if (brandIdentity.blocking_reasons.length > 0) rewriteIssues.push(...brandIdentity.blocking_reasons);
  if (assetAuthorizationSet.blocking_reasons.length > 0) rewriteIssues.push(...assetAuthorizationSet.blocking_reasons);
  if (groupVisualAuthorization.rewrite_required) rewriteIssues.push('unsupported_group_visual_authorization');
  if (spatialDrift.rewrite_required) rewriteIssues.push('spatial_drift');
  if (consumerWeightConsistency.rewrite_required) rewriteIssues.push('consumer_weight_consistency');

  // Conditional issues (warnings that affect execution permission).
  if (e02Aesthetic.positive_quality_status === 'conditional') conditionalIssues.push('e02_positive_quality_conditional');
  if (spatialDrift.spatial_drift_status === 'warning') conditionalIssues.push('spatial_drift_warning');
  if (executionExampleCompleteness.touchpoint_coverage_score > 0 && executionExampleCompleteness.touchpoint_coverage_score <= 0.6) {
    conditionalIssues.push('touchpoint_coverage_low');
  }
  if (executionExampleSpecificity.template_overuse) conditionalIssues.push('execution_example_template_overuse');

  // Info issues (non-blocking observations).
  if (executionExampleCompleteness.warning) infoIssues.push('execution_example_optional_missing');
  if (e02Aesthetic.positive_quality_pass_with_warning) infoIssues.push('e02_pass_with_warning');
  if (executionExampleSpecificity.template_warning) infoIssues.push('execution_example_template_warning');

  const reportState = resolveReportState({ blockingIssues, rewriteIssues, conditionalIssues, infoIssues });
  const executionPermissionStatus = reportState.permission;
  const overallStatus = reportState.status;

  // Per-direction content readiness is capped at 59 when the set is blocked or
  // the direction itself is not permitted (doc section 三).
  // v2.1.4.1 — also update content_readiness_explanation with permission cap (doc §3.3).
  const compiledFinal = compiledEntries.map((item) => {
    const localGateState = resolveLocalDirectionState(item.direction.direction_id, item, {
      brandIdentity, businessModelCoverage, consumerWeightConsistency,
      executionExampleCompleteness, industryRecognition, e02Aesthetic,
      spatialDrift, executionExampleSpecificity,
      groupVisualAuthorization, touchpointRisk
    });
    const localExecutionPermissionStatus = localGateState.permission;
    const localStatus = localGateState.status;
    const blocked = executionPermissionStatus === 'blocked' || localExecutionPermissionStatus === 'blocked';
    const capAt = blocked && item.readiness.content_readiness_score > 59 ? 59 : item.readiness.content_readiness_score;
    // Build updated content_readiness_explanation with set-level permission cap.
    const explanation = item.readiness.content_readiness_explanation || {};
    const updatedExplanation = blocked
      ? {
          ...explanation,
          permission_cap: 59,
          permission_cap_reasons: [
            ...(explanation.permission_cap_reasons || []),
            ...(blockingIssues.length > 0 ? [`集合级阻断：${blockingIssues.join('、')}`] : []),
            ...(rewriteIssues.length > 0 ? [`集合级重写：${rewriteIssues.join('、')}`] : [])
          ].filter((v, i, a) => a.indexOf(v) === i),
          final_score: Math.min(explanation.quality_cap || explanation.raw_score || capAt, 59)
        }
      : { ...explanation, final_score: explanation.quality_cap || capAt };
    return {
      ...item,
      local_execution_permission_status: localExecutionPermissionStatus,
      local_status: localStatus,
      local_gate_reasons: {
        hard_blocks: localGateState.hard,
        rewrite_required: localGateState.rewrite,
        warnings: localGateState.warnings
      },
      collection_status: overallStatus,
      collection_execution_permission_status: executionPermissionStatus,
      structural_completeness_score: explanation.quality_cap ?? explanation.raw_score ?? item.readiness.content_readiness_score,
      content_readiness_score: capAt,
      readiness_score: {
        raw_structural_readiness: updatedExplanation.raw_score ?? capAt,
        execution_cap: updatedExplanation.permission_cap ?? null,
        final_content_readiness: capAt,
        cap_reasons: [...new Set([
          ...(updatedExplanation.quality_cap_reasons || []),
          ...(updatedExplanation.permission_cap_reasons || [])
        ])]
      },
      readiness: {
        ...item.readiness,
        content_readiness_score: capAt,
        readiness_score: capAt,
        content_readiness_explanation: updatedExplanation
      },
      execution_permission_status: executionPermissionStatus
    };
  });
  const directionsFinal = [...compiledFinal, ...blockedEntries];

  const guardsOk = directionsFinal.every((item) =>
    item.assetAuthorization.ok && item.evidencePreservation.ok && item.audienceBoundaryGuard.ok);
  const allReady = directionsFinal.every((item) => item.local_status === 'ready');

  const gates = {
    brand_identity_preservation: brandIdentity,
    business_model_coverage: businessModelCoverage,
    consumer_value_coverage: consumerValueCoverage,
    direction_family_difference: directionFamilyDifference,
    compliance_weight_control: complianceWeight,
    e02_aesthetic_gate: e02Aesthetic,
    industry_recognition_coverage: industryRecognition,
    asset_authorization: assetAuthorizationSet,
    group_visual_authorization: groupVisualAuthorization,
    direction_touchpoint_risk: touchpointRisk,
    asset_id_uniqueness: assetIdUniqueness,
    spatial_drift: spatialDrift,
    consumer_weight_consistency: consumerWeightConsistency,
    execution_example_completeness: executionExampleCompleteness,
    execution_example_specificity: executionExampleSpecificity,
    execution_example_quality: executionExampleQuality
  };

  // v2.1.4 — blocking reasons use the resolved issue lists.
  const allBlockingReasons = [...new Set([
    ...blockingIssues,
    ...rewriteIssues,
    ...conditionalIssues
  ])];

  const gateIssues = buildStructuredGateIssues({
    blockingIssues,
    rewriteIssues,
    conditionalIssues,
    infoIssues,
    validDirections,
    blockedEntries,
    brandIdentity,
    assetAuthorizationSet,
    spatialDrift,
    e02Aesthetic,
    consumerWeightConsistency,
    executionExampleCompleteness,
    groupVisualAuthorization,
    touchpointRisk
  });

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
    directions: directionsFinal,
    gates,
    execution_permission_status: executionPermissionStatus,
    anchor_readiness: overallStatus === 'ready' && directionsFinal.filter((item) => ['ready', 'ready_with_warnings'].includes(item.local_status)).length >= 2 ? 'ready' : 'blocked',
    blocking_reasons: allBlockingReasons,
    gate_issues: gateIssues,
    gate_issue_schema_version: 'gate-issue-v1.1',
    overall_status: overallStatus,
    info_issues: infoIssues
  };
}
