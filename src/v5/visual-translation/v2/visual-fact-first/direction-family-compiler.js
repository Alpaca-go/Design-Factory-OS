const STRATEGIC_AXES = Object.freeze([
  'product_object',
  'usage_behavior',
  'service_relationship',
  'cultural_narrative',
  'spatial_experience',
  'data_verification',
  'brand_personality',
  'material_language',
  'scenario_experience'
]);

const AXIS_PATTERNS = Object.freeze([
  ['product_object', /产品|商品|包装|器物|对象|品类/u],
  ['usage_behavior', /使用|行为|操作|体验|步骤|习惯/u],
  ['service_relationship', /服务|关系|协作|交付|连接|角色/u],
  ['cultural_narrative', /文化|叙事|地域|传统|故事|价值观/u],
  ['spatial_experience', /空间|场所|环境|动线|场景/u],
  ['data_verification', /数据|验证|证据|标准|透明|追溯/u],
  ['brand_personality', /人格|态度|语气|个性|精神|品牌/u],
  ['material_language', /材料|材质|肌理|工艺|触感|质感/u],
  ['scenario_experience', /情境|生活|消费|时刻|场景|体验/u]
]);

const unique = (values) => [...new Set((values || []).filter(Boolean))];
const score = (value) => Math.max(0, Math.min(100, Math.round(value)));

function axesFor(opportunity, offset = 0) {
  const text = [
    opportunity.title, opportunity.visual_problem, opportunity.opportunity_statement,
    opportunity.visual_protagonist, opportunity.generative_mechanism
  ].filter(Boolean).join(' ');
  const matched = AXIS_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([axis]) => axis);
  const fallback = STRATEGIC_AXES[(offset + matched.length) % STRATEGIC_AXES.length];
  return unique([...matched, fallback]);
}

function makeCandidate(opportunity, candidateIndex, axis, variant) {
  const confidence = Number(opportunity.confidence || 0.5);
  const assets = unique(opportunity.visual_asset_refs || opportunity.visual_asset_evidence_refs);
  const brandFacts = unique(opportunity.brand_fact_refs || opportunity.brand_evidence_refs || opportunity.brand_evidence);
  const benchmarkGaps = unique(opportunity.anti_template_refs || opportunity.benchmark_case_refs || opportunity.benchmark_evidence);
  const touchpoints = unique(opportunity.suitable_touchpoints);
  return Object.freeze({
    candidate_id: `DFC${String(candidateIndex + 1).padStart(2, '0')}`,
    name: variant === 0 ? opportunity.title : `${opportunity.title}·${axis}`,
    source_opportunity_ids: unique([opportunity.opportunity_id]),
    source_brand_fact_ids: brandFacts,
    source_asset_ids: assets,
    benchmark_gap_ids: benchmarkGaps,
    strategic_axis: axis,
    visual_protagonist_seed: opportunity.visual_protagonist || opportunity.opportunity_statement,
    generative_mechanism_seed: opportunity.generative_mechanism || opportunity.opportunity_statement,
    target_touchpoints: touchpoints,
    business_relevance_score: score(45 + confidence * 35 + brandFacts.length * 5),
    visual_distinctiveness_score: score(40 + benchmarkGaps.length * 8 + (variant ? 8 : 0)),
    brand_exclusivity_score: score(35 + brandFacts.length * 12 + assets.length * 8),
    cross_touchpoint_score: score(35 + Math.min(5, touchpoints.length) * 12)
  });
}

function candidateDistance(left, right) {
  let distance = left.strategic_axis === right.strategic_axis ? 0 : 0.3;
  if (left.source_opportunity_ids[0] !== right.source_opportunity_ids[0]) distance += 0.25;
  if (left.visual_protagonist_seed !== right.visual_protagonist_seed) distance += 0.2;
  if (left.generative_mechanism_seed !== right.generative_mechanism_seed) distance += 0.15;
  if (!left.target_touchpoints.some((item) => right.target_touchpoints.includes(item))) distance += 0.1;
  return distance;
}

export function compileDirectionFamilyCandidates({
  visualOpportunitySynthesis,
  desiredCandidateCount = 6,
  selectedCount = 3
} = {}) {
  const opportunities = visualOpportunitySynthesis?.differentiation_opportunities || [];
  const candidates = [];
  for (let round = 0; candidates.length < Math.min(7, Math.max(5, desiredCandidateCount)); round += 1) {
    const opportunity = opportunities[round % Math.max(1, opportunities.length)];
    if (!opportunity) break;
    const axes = axesFor(opportunity, round);
    const axis = axes[round % axes.length];
    const duplicate = candidates.some((item) =>
      item.source_opportunity_ids[0] === opportunity.opportunity_id && item.strategic_axis === axis);
    if (!duplicate) candidates.push(makeCandidate(opportunity, candidates.length, axis, round >= opportunities.length ? 1 : 0));
    if (round > 40) break;
  }

  const ranked = [...candidates].sort((a, b) =>
    (b.business_relevance_score + b.visual_distinctiveness_score + b.brand_exclusivity_score + b.cross_touchpoint_score)
    - (a.business_relevance_score + a.visual_distinctiveness_score + a.brand_exclusivity_score + a.cross_touchpoint_score)
    || a.candidate_id.localeCompare(b.candidate_id)
  );
  const selected = [];
  while (selected.length < Math.min(selectedCount, ranked.length)) {
    const next = ranked
      .filter((item) => !selected.includes(item))
      .sort((a, b) => {
        const aDistance = selected.length ? Math.min(...selected.map((item) => candidateDistance(a, item))) : 1;
        const bDistance = selected.length ? Math.min(...selected.map((item) => candidateDistance(b, item))) : 1;
        return bDistance - aDistance || b.visual_distinctiveness_score - a.visual_distinctiveness_score;
      })[0];
    if (!next) break;
    selected.push(next);
  }

  return Object.freeze({
    compiler_version: 'direction-family-compiler-v1',
    candidates: Object.freeze(candidates),
    selected_candidates: Object.freeze(selected),
    strategic_axes_covered: Object.freeze(unique(candidates.map((item) => item.strategic_axis))),
    requirements: Object.freeze({
      candidate_count: candidates.length,
      candidate_count_passed: candidates.length >= 5 && candidates.length <= 7,
      strategic_axis_count: unique(candidates.map((item) => item.strategic_axis)).length,
      strategic_axis_count_passed: unique(candidates.map((item) => item.strategic_axis)).length >= 3
    })
  });
}

