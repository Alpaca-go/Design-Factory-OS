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

const DIMENSIONS = Object.freeze([
  'brand_exclusivity', 'business_model_accuracy', 'visual_freshness',
  'anchor_potential', 'cross_touchpoint_scalability', 'touchpoint_realism',
  'anti_template_strength'
]);
const DECISION_LABELS = Object.freeze({
  primary_candidate: '优先进入内部测试',
  retain_and_rewrite: '保留但需重写',
  secondary_option: '仅作备选',
  reject: '建议淘汰'
});
const clamp5 = (value) => Math.max(1, Math.min(5, Math.round(value)));
const present = (label, value) => value ? `${label}：${String(value).slice(0, 160)}` : null;

function evidenceBasedDimensions(item, compiled, assetEvidence) {
  const direction = item.direction || item;
  const examples = direction.execution_examples || [];
  const reusable = (direction.core_reusable_assets || []).filter((asset) => asset.reusable_touchpoints?.length > 1);
  const touchpoints = new Set(examples.map((example) => example.touchpoint || example.touchpoint_category).filter(Boolean));
  const generic = /通用|科技粒子|节点网络|氛围|未来感|抽象能量|左图右文/iu.test([
    direction.strategic_idea, direction.graphic_system?.how_graphics_form,
    direction.selection_mechanism?.visual_mapping_rule
  ].join(' '));
  const assetAvailable = Object.entries(assetEvidence || {}).some(([key, value]) => key !== 'unresolved' && Array.isArray(value) && value.length);
  const map = {
    brand_exclusivity: [
      present('品牌事实映射', direction.graphic_system?.brand_fact_mapping),
      present('品牌证据', direction.brand_evidence),
      direction.asset_references?.length ? `引用真实资产：${direction.asset_references.join('、')}` : null
    ],
    business_model_accuracy: [
      present('战略命题', direction.strategic_idea),
      present('选择/生成机制', direction.selection_mechanism?.visual_mapping_rule),
      direction.source_opportunity_ids?.length ? `来源机会：${direction.source_opportunity_ids.join('、')}` : null
    ],
    visual_freshness: [
      present('图形生成规则', direction.graphic_system?.how_graphics_form),
      present('视觉主角', examples[0]?.hero_subject),
      generic ? null : present('反模板风险', direction.template_risks?.[0])
    ],
    anchor_potential: [
      present('可复用机制', direction.selection_mechanism?.visual_mapping_rule),
      reusable.length ? `跨触点复用资产：${reusable.map((asset) => asset.asset_name).join('、')}` : null,
      direction.asset_references?.length ? `继承资产 ${direction.asset_references.length} 项` : null
    ],
    cross_touchpoint_scalability: [
      touchpoints.size > 1 ? `不同触点 ${touchpoints.size} 个` : null,
      reusable.length ? `可跨触点资产 ${reusable.length} 个` : null,
      examples.some((example) => example.responsive_adaptation) ? '存在响应式适配规则' : null
    ],
    touchpoint_realism: [
      examples.every((example) => example.hero_subject && example.communication_goal) ? '每个示例均含主体与传播目标' : null,
      examples.some((example) => example.industry_content || example.brand_specific_detail) ? '示例含行业或品牌专属内容' : null,
      present('品牌专属触点细节', examples.find((example) => example.brand_specific_detail)?.brand_specific_detail),
      touchpoints.size ? `触点覆盖：${[...touchpoints].join('、')}` : null
    ],
    anti_template_strength: [
      direction.template_risks?.length ? `已识别模板风险 ${direction.template_risks.length} 项` : null,
      direction.anti_concept_art_constraints?.length ? '已声明反概念稿约束' : null,
      generic ? null : '未检测到常见通用模板词'
    ]
  };
  const result = {};
  for (const dimension of DIMENSIONS) {
    const evidence = map[dimension].filter(Boolean);
    let value = clamp5(1 + Math.min(4, evidence.length));
    if (!evidence.length) value = Math.min(3, value);
    if (dimension === 'brand_exclusivity' && assetAvailable && !direction.asset_references?.length) value = Math.min(3, value);
    if (dimension === 'visual_freshness' && (generic || compiled?.gates?.execution_example_specificity?.template_overuse)) value = Math.min(3, value);
    result[dimension] = Object.freeze({
      score: value,
      evidence: Object.freeze(evidence),
      risk: evidence.length ? (generic && ['visual_freshness', 'anti_template_strength'].includes(dimension) ? '仍含通用模板信号。' : '需在真实触点中复核。') : '缺少具体证据，评分已封顶为 3。'
    });
  }
  return Object.freeze(result);
}

function normalizedSignalQuality(dimensionScores) {
  const evidence = DIMENSIONS.flatMap((name) => dimensionScores[name].evidence);
  const uniqueEvidence = new Set(evidence.map((item) => item.toLowerCase()));
  const relevanceWeight = evidence.length ? DIMENSIONS.filter((name) => dimensionScores[name].evidence.length).length / DIMENSIONS.length : 0;
  const uniquenessWeight = evidence.length ? uniqueEvidence.size / evidence.length : 0;
  const genericPenalty = evidence.filter((item) => /通用|材质纹理|科技粒子|节点网络|氛围|未来感|抽象能量/iu.test(item)).length * 0.5;
  return Math.round(Math.max(0, uniqueEvidence.size * relevanceWeight * uniquenessWeight - genericPenalty) * 1000) / 1000;
}

function numericDimensions(dimensionScores) {
  return Object.fromEntries(DIMENSIONS.map((name) => [name, dimensionScores[name].score]));
}

function totalScore(dimensions) {
  return Math.round(Object.values(dimensions).reduce((sum, value) => sum + value, 0) / 35 * 100);
}

function resolveFinalRanking(relative, confidence) {
  const eligible = relative.filter((item) => !['blocked', 'rewrite_required', 'needs_rewrite'].includes(item.local_status));
  const primary = eligible[0];
  const secondary = eligible.find((item) => item.direction_id !== primary?.direction_id);
  const weakest = relative.at(-1);
  const rejected = relative.filter((item) => item.local_status === 'blocked' || item.score < 55).map((item) => item.direction_id);
  const invalid = !primary
    || primary.direction_id === weakest?.direction_id
    || rejected.includes(primary.direction_id)
    || primary.local_status === 'blocked';
  return Object.freeze({
    ranked_direction_ids: Object.freeze(relative.map((item) => item.direction_id)),
    primary_direction_id: invalid ? undefined : primary.direction_id,
    secondary_direction_id: invalid ? undefined : secondary?.direction_id,
    rejected_direction_ids: Object.freeze(rejected),
    weakest_direction_id: weakest?.direction_id,
    recommendation_confidence: invalid ? 'unavailable' : confidence,
    recommendation_reason: invalid
      ? '排名与方向状态的一致性断言未通过，正式推荐暂不确定。'
      : `${primary.direction_id}具有最高的证据化综合分与归一化信号质量，且未被 Gate 阻断。`
  });
}

export function evaluateModelCriticAdvisory(compiled, { benchmarkRetrieval, visualAssetEvidence } = {}) {
  const failedRetrieval = ['failed', 'not_configured'].includes(benchmarkRetrieval?.retrieval_status);
  const drafts = (compiled?.directions || []).map((item, index) => {
    const dimension_scores = evidenceBasedDimensions(item, compiled, visualAssetEvidence);
    const dimensions = numericDimensions(dimension_scores);
    const rawScore = totalScore(dimensions);
    return {
      direction_id: item.direction?.direction_id || item.direction_id || `D${index + 1}`,
      local_status: item.local_status || item.status || 'not_available',
      score: failedRetrieval ? Math.min(69, Math.round(rawScore * 0.69)) : rawScore,
      dimensions,
      dimension_scores,
      normalized_signal_quality: normalizedSignalQuality(dimension_scores)
    };
  });
  const allSame = drafts.length > 1 && new Set(drafts.map((item) => JSON.stringify(item.dimensions))).size === 1;
  const scoreTies = new Set(drafts.map((item) => item.score)).size < drafts.length;
  const secondPassRequired = allSame || scoreTies;
  if (secondPassRequired && new Set(drafts.map((item) => item.normalized_signal_quality)).size > 1) {
    const byQuality = [...drafts].sort((a, b) => b.normalized_signal_quality - a.normalized_signal_quality || a.direction_id.localeCompare(b.direction_id));
    byQuality.forEach((item, index) => {
      const delta = index === 0 ? 1 : index === byQuality.length - 1 ? -1 : 0;
      item.score = Math.max(0, Math.min(failedRetrieval ? 69 : 100, item.score + delta));
      item.second_pass_adjustment = delta;
    });
  }
  const relative = [...drafts].sort((a, b) =>
    b.score - a.score
    || b.normalized_signal_quality - a.normalized_signal_quality
    || b.dimensions.anchor_potential - a.dimensions.anchor_potential
    || a.direction_id.localeCompare(b.direction_id)
  );
  relative.forEach((item, index) => {
    item.relative_rank = index + 1;
    item.relative_advantage_reason = index === 0
      ? `相对优势来自证据覆盖与信号唯一性（${item.normalized_signal_quality}）。`
      : `相对上一方向的证据化总分差为 ${relative[index - 1].score - item.score}，信号质量差为 ${Math.round((relative[index - 1].normalized_signal_quality - item.normalized_signal_quality) * 1000) / 1000}。`;
  });
  const assetAvailable = Object.entries(visualAssetEvidence || {}).some(([key, value]) => key !== 'unresolved' && Array.isArray(value) && value.length);
  const noAssetUsage = assetAvailable && (compiled?.directions || []).every((item) => !(item.direction || item).asset_references?.length);
  const confidence = failedRetrieval || noAssetUsage ? 'low'
    : benchmarkRetrieval?.retrieval_status === 'partial' ? 'medium' : 'high';
  const finalDirectionRanking = resolveFinalRanking(relative, confidence);
  for (const item of relative) {
    const decision = item.direction_id === finalDirectionRanking.primary_direction_id ? 'primary_candidate'
      : item.direction_id === finalDirectionRanking.secondary_direction_id ? 'secondary_option'
        : finalDirectionRanking.rejected_direction_ids.includes(item.direction_id) ? 'reject'
          : 'retain_and_rewrite';
    item.decision = decision;
    item.conclusion = DECISION_LABELS[decision];
    item.recommendation = decision === 'primary_candidate' ? 'Recommended'
      : decision === 'reject' ? 'Weak' : 'Promising With Revision';
    const weakest = Object.entries(item.dimensions).sort((a, b) => a[1] - b[1])[0];
    item.problems = `${weakest?.[0] || 'evidence'} 是当前最低维度（${weakest?.[1] || 0}/5）。`;
    item.action = decision === 'primary_candidate' ? '进入内部测试并用真实触点复核。' : `优先补强 ${weakest?.[0] || '证据映射'}。`;
    item.strengths = item.relative_advantage_reason;
  }
  const dimensionRankings = DIMENSIONS.map((dimension) => Object.freeze({
    dimension,
    ranking: Object.freeze([...relative].sort((a, b) => b.dimensions[dimension] - a.dimensions[dimension] || a.relative_rank - b.relative_rank).map((item) => item.direction_id)),
    rationale: `${relative[0]?.direction_id || '无方向'}在该维度及证据覆盖的集合比较中暂时领先。`
  }));
  const comparativeDirectionResults = relative.map((item) => {
    const ordered = Object.entries(item.dimensions).sort((a, b) => b[1] - a[1]);
    return Object.freeze({
      direction_id: item.direction_id,
      strongest_dimension: ordered[0]?.[0],
      weakest_dimension: ordered.at(-1)?.[0],
      relative_rank: item.relative_rank,
      relative_advantage_reason: item.relative_advantage_reason
    });
  });
  const scores = relative.map((item) => item.score);
  const score = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  const setLevelCritic = Object.freeze({
    best_direction_id: finalDirectionRanking.primary_direction_id,
    weakest_direction_id: finalDirectionRanking.weakest_direction_id,
    final_direction_ranking: finalDirectionRanking,
    dimension_rankings: Object.freeze(dimensionRankings),
    recommendation_confidence: finalDirectionRanking.recommendation_confidence,
    comparative_summary: finalDirectionRanking.recommendation_reason,
    second_pass_required: secondPassRequired,
    second_pass_resolved: secondPassRequired ? new Set(relative.map((item) => item.normalized_signal_quality)).size > 1 : true,
    comparative_direction_results: Object.freeze(comparativeDirectionResults)
  });
  return Object.freeze({
    critic_version: 'design-critic-advisory-v5-evidence-ranking',
    runtime_effect: 'none',
    structural_readiness_excluded: true,
    collection_score_cap: failedRetrieval ? 69 : null,
    score,
    recommendation: finalDirectionRanking.primary_direction_id ? 'Recommended' : 'Weak',
    critic_confidence: finalDirectionRanking.recommendation_confidence,
    second_pass_required: secondPassRequired,
    final_direction_ranking: finalDirectionRanking,
    set_level_critic: setLevelCritic,
    per_direction: Object.freeze(relative.map((item) => Object.freeze(item)))
  });
}
