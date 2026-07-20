// Direction Family Difference Gate (doc section 5 / 6).
//
// The three directions must form REAL differences — not "ruler vs flow vs
// matrix", orientation swaps, card/table swaps, or node-count tweaks. We measure
// overlap over the CONCRETE visual vocabulary (industry objects, asset names,
// photography subjects, composition/example subjects). Identical vocabulary =>
// overlap; distinct families => low overlap. Pairwise Jaccard > 0.72 is an
// overlap_warning, and if all three pairs exceed it the set is rewrite_required.
// An explicit direction_family enum (A/B/C) must also be distinct.

export const DIRECTION_FAMILY_DIFFERENCE_EVALUATOR_VERSION = 'direction-family-difference-evaluator-v1';

const OVERLAP_THRESHOLD = 0.72;

function extractConcreteTerms(direction) {
  // Measure overlap on the INDUSTRY-FAMILY-DEFINING vocabulary only. Cosmetic
  // fields (composition subject/info, execution-example subjects) are excluded
  // on purpose: the doc warns that "poster vs packaging vs exhibition",
  // "horizontal vs vertical" or "card vs table" are NOT real differences — they
  // are the same Direction Family in different clothing.
  const terms = new Set();
  const layer = direction.industry_recognition_layer;
  if (layer) {
    for (const key of ['industry_visual_objects', 'industry_data_objects', 'industry_process_objects', 'industry_space_and_real_scenes', 'usable_business_objects']) {
      for (const item of layer[key] || []) if (typeof item === 'string' && item.trim()) terms.add(item.trim());
    }
  }
  for (const asset of direction.core_reusable_assets || []) {
    if (asset?.asset_name) terms.add(String(asset.asset_name).trim());
  }
  const photo = direction.photography_object_system;
  if (photo) for (const item of photo.real_industry_objects || []) if (typeof item === 'string' && item.trim()) terms.add(item.trim());
  terms.delete('');
  return terms;
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function evaluateDirectionFamilyDifference(directions = []) {
  const terms = directions.map((d) => ({ direction_id: d.direction_id, terms: extractConcreteTerms(d) }));
  const pairs = [];
  for (let i = 0; i < terms.length; i += 1) {
    for (let j = i + 1; j < terms.length; j += 1) {
      const sim = jaccard(terms[i].terms, terms[j].terms);
      pairs.push({ pair: `${terms[i].direction_id}_${terms[j].direction_id}`, similarity: Number(sim.toFixed(4)) });
    }
  }

  const declaredFamilies = directions.map((d) => d.direction_family).filter(Boolean);
  const familyDistinct = new Set(declaredFamilies).size === declaredFamilies.length;

  const overlapPairCount = pairs.filter((p) => p.similarity > OVERLAP_THRESHOLD).length;
  const directionFamilyOverlap = pairs.length > 0 && overlapPairCount === pairs.length;
  const rewriteRequired = directionFamilyOverlap || (declaredFamilies.length === directions.length && !familyDistinct);

  const blockingReasons = [];
  if (directionFamilyOverlap) blockingReasons.push('all_pairs_overlap');
  if (declaredFamilies.length === directions.length && !familyDistinct) blockingReasons.push('declared_families_not_distinct');

  return {
    evaluator_version: DIRECTION_FAMILY_DIFFERENCE_EVALUATOR_VERSION,
    pairwise_similarity: Object.fromEntries(pairs.map((p) => [p.pair, p.similarity])),
    overlap_dimensions: overlapPairCount,
    direction_family_overlap: directionFamilyOverlap,
    declared_families_distinct: familyDistinct,
    rewrite_required: rewriteRequired,
    blocking_reasons: blockingReasons
  };
}
