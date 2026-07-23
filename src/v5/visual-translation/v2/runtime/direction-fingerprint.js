const terms = (values) => new Set((Array.isArray(values) ? values : [values])
  .flatMap((value) => String(value || '').toLowerCase().split(/[\s,，。；;、:：|/\\]+/u))
  .map((value) => value.trim()).filter((value) => value.length > 1));

const jaccard = (left, right) => {
  if (!left.size && !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
};

export function buildDirectionFingerprint(direction = {}) {
  const examples = direction.execution_examples || [];
  return Object.freeze({
    direction_id: direction.direction_id,
    strategy_axis: direction.strategic_axis || direction.family_type || direction.direction_family || '',
    protagonist_type: direction.visual_protagonist || examples[0]?.hero_subject || direction.photography_object_system?.real_industry_objects?.[0] || '',
    mechanism_types: [...terms([
      direction.selection_mechanism?.visual_mapping_rule,
      direction.graphic_system?.how_graphics_form,
      direction.strategic_idea
    ])],
    layout_pattern: [...terms([
      ...examples.map((item) => item.layout_structure || item.visual_structure),
      ...examples.map((item) => item.hero_subject_position),
      direction.layout_behavior?.multi_size_adaptation
    ])],
    touchpoint_types: [...terms([
      ...(direction.composition_templates || []).map((item) => item.touchpoint),
      ...examples.map((item) => item.touchpoint || item.touchpoint_category)
    ])],
    visual_keywords: [...terms([
      direction.direction_name, direction.strategic_idea,
      ...(direction.core_reusable_assets || []).map((item) => item.asset_name)
    ])],
    brand_fact_mapping: [...terms([direction.brand_evidence, direction.graphic_system?.brand_fact_mapping])]
  });
}

export function compareDirectionFingerprints(left, right) {
  const dimensions = {
    strategy_similarity: left.strategy_axis && left.strategy_axis === right.strategy_axis ? 1 : 0,
    protagonist_similarity: jaccard(terms(left.protagonist_type), terms(right.protagonist_type)),
    mechanism_similarity: jaccard(terms(left.mechanism_types), terms(right.mechanism_types)),
    layout_similarity: jaccard(terms(left.layout_pattern), terms(right.layout_pattern)),
    touchpoint_similarity: jaccard(terms(left.touchpoint_types), terms(right.touchpoint_types)),
    keyword_similarity: jaccard(terms(left.visual_keywords), terms(right.visual_keywords))
  };
  const similarity = dimensions.strategy_similarity * 0.2
    + dimensions.protagonist_similarity * 0.2
    + dimensions.mechanism_similarity * 0.2
    + dimensions.layout_similarity * 0.15
    + dimensions.touchpoint_similarity * 0.1
    + dimensions.keyword_similarity * 0.15;
  return Object.freeze({ ...dimensions, similarity: Math.round(similarity * 1000) / 1000 });
}

export function evaluateCrossProjectDirectionSimilarity(direction, historicalDirections = []) {
  const fingerprint = buildDirectionFingerprint(direction);
  const matches = historicalDirections.map((item) => {
    const historical = buildDirectionFingerprint(item.direction || item);
    const compared = compareDirectionFingerprints(fingerprint, historical);
    const brandFactSimilarity = jaccard(terms(fingerprint.brand_fact_mapping), terms(historical.brand_fact_mapping));
    return { historical_direction_id: historical.direction_id, ...compared, brand_fact_mapping_different: brandFactSimilarity < 0.5 };
  }).sort((a, b) => b.similarity - a.similarity);
  return Object.freeze({
    fingerprint,
    matches: Object.freeze(matches),
    cross_project_template_risk: matches.some((item) => item.similarity >= 0.82 && item.brand_fact_mapping_different) ? 'high' : 'none'
  });
}

