const unique = (values) => [...new Set(values.filter(Boolean))];

export function validateLightweightDirections({ compiled, pipelineCompleteness, benchmarkRetrieval } = {}) {
  const gates = compiled?.gates || {};
  const hardBlocks = [];
  const rewrites = [];
  const warnings = [];

  if (!Array.isArray(compiled?.directions) || compiled.directions.length < 3) hardBlocks.push('DIRECTION_COUNT_INSUFFICIENT');
  if (gates.brand_identity_preservation?.error_code === 'UNEXPECTED_BRAND_IDENTITY'
    || gates.brand_identity_preservation?.brand_name_preserved === false) hardBlocks.push('PROJECT_BRAND_REPLACED');
  if (gates.asset_authorization?.forgery_detected) hardBlocks.push('UNAUTHORIZED_OR_UNGROUNDED_ASSET');

  if (gates.business_model_coverage?.business_model_undercoverage) rewrites.push('BUSINESS_MODEL_MISREAD');
  if (gates.direction_family_difference?.rewrite_required) rewrites.push('DIRECTION_MECHANISMS_TOO_SIMILAR');
  if (gates.execution_example_completeness?.any_blocked || gates.execution_example_completeness?.any_conditional) rewrites.push('EXECUTION_FIELDS_INCOMPLETE');
  if (gates.execution_example_specificity?.template_overuse) rewrites.push('ABSTRACT_OR_TEMPLATE_DRIVEN');

  if (gates.group_visual_authorization?.warning) warnings.push('UNCONFIRMED_RELATIONSHIP_MENTIONED');
  if (gates.direction_touchpoint_risk?.warning) warnings.push('TOUCHPOINT_ADAPTATION_RISK');
  if (benchmarkRetrieval && benchmarkRetrieval.retrieval_status !== 'completed') warnings.push(`BENCHMARK_RETRIEVAL_${String(benchmarkRetrieval.retrieval_status).toUpperCase()}`);
  if (pipelineCompleteness === 'partial') warnings.push('PIPELINE_PARTIAL');
  if (pipelineCompleteness === 'fallback') warnings.push('LEGACY_FALLBACK_USED');

  const hard = unique(hardBlocks);
  const rewrite = unique(rewrites);
  const warning = unique(warnings);
  const status = hard.length ? 'blocked' : rewrite.length ? 'rewrite_required' : warning.length ? 'ready_with_warnings' : 'ready';
  return Object.freeze({
    validator_version: 'lightweight-validator-v1',
    status,
    hard_blocks: Object.freeze(hard),
    rewrite_required: Object.freeze(rewrite),
    warnings: Object.freeze(warning)
  });
}

export function evaluateModelCriticAdvisory(compiled) {
  const difference = Number(compiled?.gates?.direction_family_difference?.difference_score || 0.6);
  const specificity = compiled?.gates?.execution_example_specificity?.template_overuse ? 0.45 : 0.75;
  const brand = compiled?.gates?.brand_identity_preservation?.brand_name_preserved === false ? 0.2 : 0.8;
  const extension = (compiled?.directions || []).reduce((sum, item) => sum + Number(item.content_readiness_score || 0), 0)
    / Math.max(1, (compiled?.directions || []).length) / 100;
  const score = Math.round((difference * 0.25 + specificity * 0.2 + brand * 0.25 + extension * 0.3) * 100);
  const perDirection = (compiled?.directions || []).map((item, index) => {
    const directionScore = Math.round(brand * 25 + difference * 20 + specificity * 20 + Number(item.content_readiness_score || 0) * 0.35);
    return Object.freeze({
      direction_id: item.direction?.direction_id || `D${index + 1}`,
      score: directionScore,
      recommendation: directionScore >= 80 ? 'Recommended' : directionScore >= 60 ? 'Promising With Revision' : 'Weak'
    });
  });
  return Object.freeze({
    critic_version: 'model-critic-advisory-v1',
    runtime_effect: 'none',
    score,
    recommendation: score >= 80 ? 'Recommended' : score >= 60 ? 'Promising With Revision' : 'Weak',
    per_direction: Object.freeze(perDirection),
    dimensions: Object.freeze({ brand_specificity: brand, visual_freshness: difference, extensibility: extension, execution_specificity: specificity })
  });
}
