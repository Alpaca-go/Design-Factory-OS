export const CROSS_INDUSTRY_FREEZE_SCHEMA_VERSION = 'cross-industry-freeze-v1';

export const FROZEN_COMPONENT_PATHS = Object.freeze([
  'src/v5/visual-translation/v2/visual-fact-first/prompts.js',
  'src/v5/visual-translation/v2/visual-fact-first/schemas.js',
  'src/v5/visual-translation/v2/visual-fact-first/benchmark-query-compiler.js',
  'src/v5/visual-translation/v2/visual-fact-first/benchmark-retrieval.js',
  'src/v5/visual-translation/v2/visual-fact-first/run-upstream.js',
  'src/v5/visual-translation/v2/visual-fact-first/step4-input-adapter.js',
  'src/v5/visual-translation/v2/prompts/direction-generation-prompt-v2.js',
  'src/v5/visual-translation/v2/runtime/asset-authorization-evaluator.js',
  'src/v5/visual-translation/v2/runtime/brand-identity-preservation-evaluator.js',
  'src/v5/visual-translation/v2/runtime/group-visual-authorization-evaluator.js',
  'src/v5/visual-translation/v2/runtime/compile-execution-direction-v2.js',
  'src/v5/visual-translation/v2/runtime/gate-issue-aggregator.js',
  'src/v5/visual-translation/v2/runtime/lightweight-validator.js',
  'src/v5/visual-translation/v2/report/visual-directions-report-compiler.js',
  'src/v5/visual-translation/v2/schemas/direction-contract-v2.js'
]);

export const CROSS_INDUSTRY_FREEZE_THRESHOLDS = Object.freeze({
  minimum_projects: 6,
  pipeline_success_rate: 0.9,
  benchmark_success_rate: 0.85,
  brand_understanding_accuracy: 0.9,
  evidence_safety_rate: 1,
  direction_difference_pass_rate: 0.8,
  critic_agreement_rate: 0.7,
  anchor_internal_test_rate: 0.7,
  repeated_defect_projects: 3,
  pipeline_failure_development_trigger: 0.2,
  benchmark_failure_development_trigger: 0.25,
  critic_conflict_development_trigger: 0.5
});

const SCORE_KEYS = Object.freeze([
  'brand_understanding',
  'evidence_safety',
  'retrieval_effectiveness',
  'direction_difference',
  'brand_exclusivity',
  'visual_generatability',
  'cross_touchpoint_extension',
  'critic_reliability',
  'report_readability',
  'pipeline_stability'
]);

const ISSUE_CLASSIFICATIONS = new Set([
  'core_defect',
  'retrieval_defect',
  'project_fact_defect',
  'model_output_variance',
  'input_quality_issue'
]);

const number = (value, label, { min = 0, max = Number.POSITIVE_INFINITY } = {}) => {
  if (!Number.isFinite(value) || value < min || value > max) throw new TypeError(`${label} must be between ${min} and ${max}`);
  return Number(value);
};

const boolean = (value, label) => {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
};

const ratio = (count, total) => total ? count / total : 0;
const rounded = (value) => Math.round(value * 10_000) / 10_000;
const all = (values) => values.every(Boolean);

function validateScores(scores = {}, testId) {
  const normalized = {};
  for (const key of SCORE_KEYS) normalized[key] = number(scores[key], `${testId}.scores.${key}`, { min: 1, max: 5 });
  return Object.freeze(normalized);
}

function normalizeIssue(issue = {}, index, testId) {
  if (!ISSUE_CLASSIFICATIONS.has(issue.classification)) {
    throw new TypeError(`${testId}.issues[${index}].classification is invalid`);
  }
  return Object.freeze({
    issue_id: String(issue.issue_id || `${testId}-ISSUE-${index + 1}`),
    defect_key: String(issue.defect_key || issue.issue_id || `${issue.classification}:${issue.module || 'unknown'}:${issue.description || index}`),
    classification: issue.classification,
    severity: ['info', 'warning', 'high', 'critical'].includes(issue.severity) ? issue.severity : 'warning',
    module: String(issue.module || 'unknown'),
    description: String(issue.description || '未提供问题说明'),
    minimum_fix_scope: String(issue.minimum_fix_scope || ''),
    regression_projects: Object.freeze([...(issue.regression_projects || [])].map(String))
  });
}

export function validateCrossIndustryProjectRecord(record = {}) {
  const testId = String(record.test_id || '');
  if (!/^T\d{2}$/u.test(testId)) throw new TypeError('test_id must use T01 format');
  if (!['product_brand', 'platform_service', 'retail_dining', 'nonstandard'].includes(record.project_type)) {
    throw new TypeError(`${testId}.project_type is invalid`);
  }
  if (!['A', 'B', 'C'].includes(record.input_type)) throw new TypeError(`${testId}.input_type must be A, B, or C`);
  const pipeline = record.pipeline || {};
  const retrieval = record.retrieval || {};
  const brand = record.brand_understanding || {};
  const evidence = record.evidence || {};
  const directions = record.directions || {};
  const critic = record.critic || {};
  const anchor = record.anchor || {};
  const directionVisualScores = (record.direction_visual_generatability || []).map((value, index) =>
    number(value, `${testId}.direction_visual_generatability[${index}]`, { min: 1, max: 5 }));
  if (!directionVisualScores.length) throw new TypeError(`${testId}.direction_visual_generatability requires at least one score`);
  if (!['not_ready', 'internal_test_only', 'formal_ready'].includes(anchor.readiness)) {
    throw new TypeError(`${testId}.anchor.readiness is invalid`);
  }
  if (!['completed', 'partial', 'failed'].includes(retrieval.status)) throw new TypeError(`${testId}.retrieval.status is invalid`);

  return Object.freeze({
    schema_version: CROSS_INDUSTRY_FREEZE_SCHEMA_VERSION,
    test_id: testId,
    project_name: String(record.project_name || testId),
    project_type: record.project_type,
    industry: String(record.industry || 'unknown'),
    business_model: String(record.business_model || 'unknown'),
    input_type: record.input_type,
    git_commit: String(record.git_commit || ''),
    model: String(record.model || ''),
    started_at: String(record.started_at || ''),
    completed_at: String(record.completed_at || ''),
    artifacts: Object.freeze({
      input_manifest_path: String(record.artifacts?.input_manifest_path || ''),
      report_path: String(record.artifacts?.report_path || ''),
      audit_path: String(record.artifacts?.audit_path || ''),
      runtime_log_path: String(record.artifacts?.runtime_log_path || '')
    }),
    pipeline: Object.freeze({
      completed: boolean(pipeline.completed, `${testId}.pipeline.completed`),
      completeness: String(pipeline.completeness || 'unknown'),
      total_duration_ms: number(pipeline.total_duration_ms || 0, `${testId}.pipeline.total_duration_ms`),
      retry_count: number(pipeline.retry_count || 0, `${testId}.pipeline.retry_count`),
      provider_fallback_count: number(pipeline.provider_fallback_count || 0, `${testId}.pipeline.provider_fallback_count`),
      legacy_fallback: boolean(pipeline.legacy_fallback ?? false, `${testId}.pipeline.legacy_fallback`),
      stage_durations_ms: Object.freeze({ ...(pipeline.stage_durations_ms || {}) }),
      error: pipeline.error ? String(pipeline.error) : null
    }),
    retrieval: Object.freeze({
      status: retrieval.status,
      query_count: number(retrieval.query_count || 0, `${testId}.retrieval.query_count`),
      raw_result_count: number(retrieval.raw_result_count || 0, `${testId}.retrieval.raw_result_count`),
      relevant_result_count: number(retrieval.relevant_result_count || 0, `${testId}.retrieval.relevant_result_count`),
      usable_case_count: number(retrieval.usable_case_count || 0, `${testId}.retrieval.usable_case_count`),
      direct_industry_count: number(retrieval.direct_industry_count || 0, `${testId}.retrieval.direct_industry_count`),
      business_model_count: number(retrieval.business_model_count || 0, `${testId}.retrieval.business_model_count`),
      anti_template_count: number(retrieval.anti_template_count || 0, `${testId}.retrieval.anti_template_count`)
    }),
    brand_understanding: Object.freeze({
      brand_name_correct: boolean(brand.brand_name_correct, `${testId}.brand_understanding.brand_name_correct`),
      industry_correct: boolean(brand.industry_correct, `${testId}.brand_understanding.industry_correct`),
      business_model_correct: boolean(brand.business_model_correct, `${testId}.brand_understanding.business_model_correct`),
      audience_correct: boolean(brand.audience_correct, `${testId}.brand_understanding.audience_correct`),
      brand_role_correct: boolean(brand.brand_role_correct, `${testId}.brand_understanding.brand_role_correct`),
      adjacent_industry_misread: boolean(brand.adjacent_industry_misread ?? false, `${testId}.brand_understanding.adjacent_industry_misread`)
    }),
    evidence: Object.freeze({
      unsupported_specific_data: boolean(evidence.unsupported_specific_data ?? false, `${testId}.evidence.unsupported_specific_data`),
      structure_only_specific_values: boolean(evidence.structure_only_specific_values ?? false, `${testId}.evidence.structure_only_specific_values`),
      project_logo_misjudged: boolean(evidence.project_logo_misjudged ?? false, `${testId}.evidence.project_logo_misjudged`),
      external_logo_missed: boolean(evidence.external_logo_missed ?? false, `${testId}.evidence.external_logo_missed`),
      authorization_boundary_correct: boolean(evidence.authorization_boundary_correct, `${testId}.evidence.authorization_boundary_correct`),
      serious_fact_leak: boolean(evidence.serious_fact_leak ?? false, `${testId}.evidence.serious_fact_leak`),
      unauthorized_asset_use: boolean(evidence.unauthorized_asset_use ?? false, `${testId}.evidence.unauthorized_asset_use`),
      cross_project_brand_contamination: boolean(evidence.cross_project_brand_contamination ?? false, `${testId}.evidence.cross_project_brand_contamination`)
    }),
    directions: Object.freeze({
      count: number(directions.count, `${testId}.directions.count`, { min: 0 }),
      clearly_distinct: boolean(directions.clearly_distinct, `${testId}.directions.clearly_distinct`),
      family_repeated: boolean(directions.family_repeated ?? false, `${testId}.directions.family_repeated`),
      protagonists_distinct: boolean(directions.protagonists_distinct, `${testId}.directions.protagonists_distinct`),
      mechanisms_distinct: boolean(directions.mechanisms_distinct, `${testId}.directions.mechanisms_distinct`),
      touchpoints_realistic: boolean(directions.touchpoints_realistic, `${testId}.directions.touchpoints_realistic`),
      drawable_count: number(directions.drawable_count || 0, `${testId}.directions.drawable_count`),
      industry_template_expression: boolean(directions.industry_template_expression ?? false, `${testId}.directions.industry_template_expression`)
    }),
    visual_assets: Object.freeze({ ...(record.visual_assets || {}) }),
    critic: Object.freeze({
      ranked: boolean(critic.ranked, `${testId}.critic.ranked`),
      unexplained_tie: boolean(critic.unexplained_tie ?? false, `${testId}.critic.unexplained_tie`),
      system_top_direction_id: critic.system_top_direction_id ? String(critic.system_top_direction_id) : null,
      human_top_two_direction_ids: Object.freeze([...(critic.human_top_two_direction_ids || [])].map(String)),
      recommendation_confidence_reasonable: boolean(critic.recommendation_confidence_reasonable, `${testId}.critic.recommendation_confidence_reasonable`),
      text_length_rewarded: boolean(critic.text_length_rewarded ?? false, `${testId}.critic.text_length_rewarded`)
    }),
    anchor: Object.freeze({
      readiness: anchor.readiness,
      reasons: Object.freeze([...(anchor.reasons || [])].map(String)),
      eligible_direction_ids: Object.freeze([...(anchor.eligible_direction_ids || [])].map(String)),
      smoke_test: anchor.smoke_test ? Object.freeze({
        attempted: Boolean(anchor.smoke_test.attempted),
        passed: Boolean(anchor.smoke_test.passed),
        direction_count: number(anchor.smoke_test.direction_count || 0, `${testId}.anchor.smoke_test.direction_count`),
        explorations_per_direction: number(anchor.smoke_test.explorations_per_direction || 0, `${testId}.anchor.smoke_test.explorations_per_direction`)
      }) : null
    }),
    scores: validateScores(record.scores, testId),
    direction_visual_generatability: Object.freeze(directionVisualScores),
    issues: Object.freeze((record.issues || []).map((issue, index) => normalizeIssue(issue, index, testId)))
  });
}

function evaluateProject(record) {
  const pipelinePass = record.pipeline.completed && !record.pipeline.legacy_fallback;
  const brandPass = all([
    record.brand_understanding.brand_name_correct,
    record.brand_understanding.industry_correct,
    record.brand_understanding.business_model_correct,
    record.brand_understanding.audience_correct,
    record.brand_understanding.brand_role_correct,
    !record.brand_understanding.adjacent_industry_misread
  ]);
  const evidencePass = all([
    !record.evidence.unsupported_specific_data,
    !record.evidence.structure_only_specific_values,
    !record.evidence.project_logo_misjudged,
    !record.evidence.external_logo_missed,
    record.evidence.authorization_boundary_correct,
    !record.evidence.serious_fact_leak,
    !record.evidence.unauthorized_asset_use,
    !record.evidence.cross_project_brand_contamination
  ]);
  const directionPass = record.directions.count === 3
    && record.directions.clearly_distinct
    && !record.directions.family_repeated
    && record.directions.protagonists_distinct
    && record.directions.mechanisms_distinct
    && record.directions.touchpoints_realistic
    && record.directions.drawable_count >= 1
    && !record.directions.industry_template_expression;
  const criticAgreement = record.critic.ranked
    && !record.critic.unexplained_tie
    && Boolean(record.critic.system_top_direction_id)
    && record.critic.human_top_two_direction_ids.includes(record.critic.system_top_direction_id);
  const anchorPass = ['internal_test_only', 'formal_ready'].includes(record.anchor.readiness);
  const averageScore = Object.values(record.scores).reduce((sum, score) => sum + score, 0) / SCORE_KEYS.length;
  const scoringPass = averageScore >= 3.5
    && record.scores.evidence_safety >= 4
    && record.scores.brand_understanding >= 4
    && record.scores.pipeline_stability >= 4
    && Math.max(...record.direction_visual_generatability) >= 4;
  const highRisk = record.evidence.serious_fact_leak
    || record.evidence.unauthorized_asset_use
    || record.evidence.cross_project_brand_contamination;
  return Object.freeze({
    test_id: record.test_id,
    project_name: record.project_name,
    pipeline_pass: pipelinePass,
    benchmark_pass: ['completed', 'partial'].includes(record.retrieval.status),
    brand_understanding_pass: brandPass,
    evidence_safety_pass: evidencePass,
    direction_difference_pass: directionPass,
    critic_agreement: criticAgreement,
    anchor_internal_test_pass: anchorPass,
    average_score: Math.round(averageScore * 100) / 100,
    scoring_pass: scoringPass,
    high_risk_fact_failure: highRisk,
    conclusion: scoringPass && pipelinePass && evidencePass && brandPass && directionPass
      ? 'pass'
      : pipelinePass && !highRisk ? 'conditional_pass' : 'fail'
  });
}

function inputCoverage(records) {
  const count = (type) => records.filter((record) => record.project_type === type).length;
  return Object.freeze({
    product_brands: count('product_brand'),
    platform_or_service_brands: count('platform_service'),
    retail_or_dining_brands: count('retail_dining'),
    nonstandard_projects: count('nonstandard'),
    input_types: Object.freeze(Object.fromEntries(['A', 'B', 'C'].map((type) => [type, records.filter((record) => record.input_type === type).length]))),
    minimum_mix_met: count('product_brand') >= 2
      && count('platform_service') >= 2
      && count('retail_dining') >= 1
      && count('nonstandard') >= 1
      && ['A', 'B', 'C'].every((type) => records.some((record) => record.input_type === type))
  });
}

function repeatedDefects(records) {
  const grouped = new Map();
  for (const record of records) {
    for (const issue of record.issues) {
      const current = grouped.get(issue.defect_key) || { ...issue, affected_project_ids: [] };
      if (!current.affected_project_ids.includes(record.test_id)) current.affected_project_ids.push(record.test_id);
      grouped.set(issue.defect_key, current);
    }
  }
  return [...grouped.values()]
    .map((item) => Object.freeze({
      ...item,
      affected_project_ids: Object.freeze(item.affected_project_ids),
      affected_project_count: item.affected_project_ids.length,
      repeated_cross_project_defect: item.affected_project_ids.length >= CROSS_INDUSTRY_FREEZE_THRESHOLDS.repeated_defect_projects
    }))
    .sort((left, right) => right.affected_project_count - left.affected_project_count || left.defect_key.localeCompare(right.defect_key));
}

function smokeTestPolicy(records) {
  const attempts = records.filter((record) => record.anchor.smoke_test?.attempted);
  const violations = [];
  if (attempts.length > 3) violations.push('anchor_smoke_project_limit_exceeded');
  for (const record of attempts) {
    if (!['internal_test_only', 'formal_ready'].includes(record.anchor.readiness)) violations.push(`${record.test_id}:anchor_not_ready`);
    if (record.anchor.smoke_test.direction_count > 2) violations.push(`${record.test_id}:direction_limit_exceeded`);
    if (record.anchor.smoke_test.explorations_per_direction > 1) violations.push(`${record.test_id}:exploration_limit_exceeded`);
  }
  return Object.freeze({
    attempted_project_count: attempts.length,
    passed_project_count: attempts.filter((record) => record.anchor.smoke_test.passed).length,
    policy_compliant: violations.length === 0,
    violations: Object.freeze(violations)
  });
}

export function evaluateCrossIndustryFreeze(rawRecords = [], options = {}) {
  if (!Array.isArray(rawRecords)) throw new TypeError('Cross-industry freeze records must be an array');
  const records = rawRecords.map(validateCrossIndustryProjectRecord);
  const ids = records.map((record) => record.test_id);
  if (new Set(ids).size !== ids.length) throw new TypeError('Cross-industry freeze test_id values must be unique');
  const projects = records.map(evaluateProject);
  const total = records.length;
  const metrics = Object.freeze({
    pipeline_success_rate: rounded(ratio(projects.filter((item) => item.pipeline_pass).length, total)),
    benchmark_success_rate: rounded(ratio(projects.filter((item) => item.benchmark_pass).length, total)),
    brand_understanding_accuracy: rounded(ratio(projects.filter((item) => item.brand_understanding_pass).length, total)),
    evidence_safety_rate: rounded(ratio(projects.filter((item) => item.evidence_safety_pass).length, total)),
    direction_difference_pass_rate: rounded(ratio(projects.filter((item) => item.direction_difference_pass).length, total)),
    critic_agreement_rate: rounded(ratio(projects.filter((item) => item.critic_agreement).length, total)),
    anchor_internal_test_rate: rounded(ratio(projects.filter((item) => item.anchor_internal_test_pass).length, total))
  });
  const defects = repeatedDefects(records);
  const highRisk = records.filter((record) =>
    record.evidence.serious_fact_leak
    || record.evidence.unauthorized_asset_use
    || record.evidence.cross_project_brand_contamination);
  const triggers = Object.freeze({
    repeated_cross_project_defect: defects.some((item) => item.repeated_cross_project_defect),
    serious_fact_leak: records.some((record) => record.evidence.serious_fact_leak),
    unauthorized_asset_use: records.some((record) => record.evidence.unauthorized_asset_use),
    cross_project_brand_contamination: records.some((record) => record.evidence.cross_project_brand_contamination),
    pipeline_reliability: total > 0 && 1 - metrics.pipeline_success_rate > CROSS_INDUSTRY_FREEZE_THRESHOLDS.pipeline_failure_development_trigger,
    benchmark_reliability: total > 0 && 1 - metrics.benchmark_success_rate > CROSS_INDUSTRY_FREEZE_THRESHOLDS.benchmark_failure_development_trigger,
    critic_system_conflict: total > 0 && 1 - metrics.critic_agreement_rate > CROSS_INDUSTRY_FREEZE_THRESHOLDS.critic_conflict_development_trigger
  });
  const coverage = inputCoverage(records);
  const smokeTest = smokeTestPolicy(records);
  const criteria = Object.freeze({
    enough_projects: total >= CROSS_INDUSTRY_FREEZE_THRESHOLDS.minimum_projects,
    input_mix_met: coverage.minimum_mix_met,
    pipeline_success_rate: metrics.pipeline_success_rate >= CROSS_INDUSTRY_FREEZE_THRESHOLDS.pipeline_success_rate,
    benchmark_success_rate: metrics.benchmark_success_rate >= CROSS_INDUSTRY_FREEZE_THRESHOLDS.benchmark_success_rate,
    brand_understanding_accuracy: metrics.brand_understanding_accuracy >= CROSS_INDUSTRY_FREEZE_THRESHOLDS.brand_understanding_accuracy,
    evidence_safety_rate: metrics.evidence_safety_rate === CROSS_INDUSTRY_FREEZE_THRESHOLDS.evidence_safety_rate,
    direction_difference_pass_rate: metrics.direction_difference_pass_rate >= CROSS_INDUSTRY_FREEZE_THRESHOLDS.direction_difference_pass_rate,
    critic_agreement_rate: metrics.critic_agreement_rate >= CROSS_INDUSTRY_FREEZE_THRESHOLDS.critic_agreement_rate,
    anchor_internal_test_rate: metrics.anchor_internal_test_rate >= CROSS_INDUSTRY_FREEZE_THRESHOLDS.anchor_internal_test_rate,
    no_cross_project_brand_contamination: !triggers.cross_project_brand_contamination,
    no_unauthorized_asset_use: !triggers.unauthorized_asset_use,
    no_legacy_fallback: records.every((record) => !record.pipeline.legacy_fallback),
    required_artifacts_recorded: records.every((record) =>
      record.started_at && record.completed_at
      && Object.values(record.artifacts).every(Boolean)
    ),
    baseline_worktree_clean: options.baselineDirty !== true,
    frozen_components_intact: options.frozenComponentsIntact !== false,
    anchor_smoke_policy_compliant: smokeTest.policy_compliant
  });
  const freezePassed = Object.values(criteria).every(Boolean);
  const checkpoint = total >= 8 ? 'checkpoint_c' : total >= 6 ? 'checkpoint_b' : total >= 3 ? 'checkpoint_a' : 'in_progress';
  return Object.freeze({
    schema_version: CROSS_INDUSTRY_FREEZE_SCHEMA_VERSION,
    baseline: Object.freeze({
      commit: String(options.baselineCommit || ''),
      tag: String(options.baselineTag || 'retrieval-first-cross-industry-baseline'),
      frozen_component_manifest: options.frozenComponentManifest || null
    }),
    checkpoint,
    project_count: total,
    records: Object.freeze(records),
    projects: Object.freeze(projects),
    input_coverage: coverage,
    metrics,
    criteria,
    repeated_defects: Object.freeze(defects),
    model_output_variance: Object.freeze(defects.filter((item) => item.classification === 'model_output_variance')),
    high_risk_projects: Object.freeze(highRisk.map((record) => record.test_id)),
    development_triggers: triggers,
    development_allowed: Object.values(triggers).some(Boolean),
    anchor_smoke_test: smokeTest,
    freeze_decision: total < CROSS_INDUSTRY_FREEZE_THRESHOLDS.minimum_projects
      ? 'insufficient_projects'
      : freezePassed ? 'passed' : 'failed'
  });
}
