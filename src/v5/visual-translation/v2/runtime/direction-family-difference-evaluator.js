// Direction Family Difference Gate (doc section 5 / 6, v2.1.1 upgrade).
//
// The three directions must form REAL differences. The original gate was
// binary (same family => 1, different => 0) which is too coarse: two directions
// can declare different families yet share the same concrete vocabulary, or
// share a family yet be semantically distinct. v2.1.1 measures a 9-dimension
// similarity per pair and weights them into a single composite score:
//
//   0.00–0.35  差异清楚
//   0.36–0.55  部分重叠
//   0.56–0.72  高重叠警告
//   > 0.72     rewrite_required
//
// The explicit direction_family enum must still be distinct, but similarity is
// no longer decided by that single field.

import { collectDirectionText } from './direction-text-util.js';
import { buildDirectionFingerprint, compareDirectionFingerprints } from './direction-fingerprint.js';

export const DIRECTION_FAMILY_DIFFERENCE_EVALUATOR_VERSION = 'direction-family-difference-evaluator-v1.2';

export const SIMILARITY_WEIGHTS = Object.freeze({
  declared_family_similarity: 0.05,
  strategic_entry_similarity: 0.10,
  industry_object_similarity: 0.08,
  reusable_asset_similarity: 0.08,
  photography_subject_similarity: 0.05,
  layout_similarity: 0.04,
  touchpoint_similarity: 0.04,
  audience_similarity: 0.03,
  semantic_similarity: 0.05,
  composition_template_similarity: 0.10,
  subject_position_similarity: 0.08,
  image_graphic_ratio_similarity: 0.08,
  overlay_behavior_similarity: 0.07,
  information_hierarchy_similarity: 0.08,
  responsive_pattern_similarity: 0.07
});

const OVERLAP_THRESHOLD = 0.70;
const EXECUTION_TEMPLATE_THRESHOLD = 0.72;

function bigrams(text) {
  if (!text) return new Set();
  const s = String(text);
  if (s.length <= 1) return new Set([s]);
  const set = new Set();
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  return set;
}

function setOf(arr) {
  return new Set((arr || []).filter(Boolean).map((x) => String(x).trim()).filter(Boolean));
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function optionalJaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  return jaccard(a, b);
}

function templateSignature(direction) {
  const examples = direction.execution_examples || [];
  const templates = direction.composition_templates || [];
  const composition = setOf([
    ...templates.map((item) => `${item.subject_position || ''}|${item.information_position || ''}|${item.image_object_rule || ''}`),
    ...examples.map((item) => `${item.layout_structure || ''}|${item.visual_structure || ''}`)
  ]);
  const subjectPosition = setOf([...templates.map((item) => item.subject_position), ...examples.map((item) => item.hero_subject_position)]);
  const ratios = setOf(examples.map((item) => `${item.photography_ratio ?? ''}:${item.graphic_ratio ?? ''}:${item.information_ratio ?? ''}`));
  const overlay = setOf([direction.photography_object_system?.graphic_overlay, ...examples.map((item) => item.graphic_overlay)]);
  const hierarchy = setOf([...(direction.information_system?.information_hierarchy || []), ...examples.map((item) => item.information_hierarchy)]);
  const responsive = setOf([direction.layout_behavior?.multi_size_adaptation, ...examples.map((item) => item.responsive_adaptation)]);
  return { composition, subjectPosition, ratios, overlay, hierarchy, responsive };
}

function concreteTerms(direction) {
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

function reusableAssetTerms(direction) {
  return setOf((direction.core_reusable_assets || []).map((a) => a?.asset_name));
}

function photographyTerms(direction) {
  const photo = direction.photography_object_system;
  const s = setOf(photo?.real_industry_objects);
  if (photo?.subject_and_background) for (const b of bigrams(photo.subject_and_background)) s.add(b);
  return s;
}

function layoutTerms(direction) {
  const lb = direction.layout_behavior || {};
  return setOf(Object.values(lb).filter((v) => typeof v === 'string'));
}

function touchpointTerms(direction) {
  const s = setOf((direction.composition_templates || []).map((t) => t.touchpoint));
  for (const e of direction.execution_examples || []) {
    if (e.touchpoint) s.add(String(e.touchpoint));
    if (e.touchpoint_category) s.add(String(e.touchpoint_category));
  }
  return s;
}

function audienceTerms(direction) {
  const s = new Set();
  for (const e of direction.execution_examples || []) {
    if (e.audience) for (const b of bigrams(e.audience)) s.add(b);
    if (e.touchpoint_category) s.add(String(e.touchpoint_category));
  }
  return s;
}

function pairDimensions(a, b) {
  const declared = (a.direction_family || '').toString() === (b.direction_family || '').toString() && Boolean(a.direction_family) ? 1 : 0;
  const aTemplate = templateSignature(a);
  const bTemplate = templateSignature(b);
  return {
    declared_family_similarity: declared,
    strategic_entry_similarity: jaccard(bigrams(a.strategic_idea), bigrams(b.strategic_idea)),
    industry_object_similarity: jaccard(concreteTerms(a), concreteTerms(b)),
    reusable_asset_similarity: jaccard(reusableAssetTerms(a), reusableAssetTerms(b)),
    photography_subject_similarity: jaccard(photographyTerms(a), photographyTerms(b)),
    layout_similarity: jaccard(layoutTerms(a), layoutTerms(b)),
    touchpoint_similarity: jaccard(touchpointTerms(a), touchpointTerms(b)),
    audience_similarity: jaccard(audienceTerms(a), audienceTerms(b)),
    semantic_similarity: jaccard(bigrams(collectDirectionText(a)), bigrams(collectDirectionText(b))),
    composition_template_similarity: optionalJaccard(aTemplate.composition, bTemplate.composition),
    subject_position_similarity: optionalJaccard(aTemplate.subjectPosition, bTemplate.subjectPosition),
    image_graphic_ratio_similarity: optionalJaccard(aTemplate.ratios, bTemplate.ratios),
    overlay_behavior_similarity: optionalJaccard(aTemplate.overlay, bTemplate.overlay),
    information_hierarchy_similarity: optionalJaccard(aTemplate.hierarchy, bTemplate.hierarchy),
    responsive_pattern_similarity: optionalJaccard(aTemplate.responsive, bTemplate.responsive)
  };
}

function composite(dim) {
  let sum = 0;
  for (const [key, w] of Object.entries(SIMILARITY_WEIGHTS)) sum += (dim[key] || 0) * w;
  return Math.round(sum * 1000) / 1000;
}

function band(score) {
  if (score >= OVERLAP_THRESHOLD) return 'rewrite_required';
  if (score > 0.55) return 'high_overlap_warning';
  if (score > 0.35) return 'partial_overlap';
  return 'clear';
}

export function evaluateDirectionFamilyDifference(directions = []) {
  const pairs = [];
  const details = {};
  for (let i = 0; i < directions.length; i += 1) {
    for (let j = i + 1; j < directions.length; j += 1) {
      const a = directions[i];
      const b = directions[j];
      const dims = pairDimensions(a, b);
      const score = composite(dims);
      const fingerprintSimilarity = compareDirectionFingerprints(
        buildDirectionFingerprint(a),
        buildDirectionFingerprint(b)
      );
      const executionTemplateSimilarity = Math.round(([
        dims.composition_template_similarity, dims.subject_position_similarity,
        dims.image_graphic_ratio_similarity, dims.overlay_behavior_similarity,
        dims.information_hierarchy_similarity, dims.responsive_pattern_similarity
      ].reduce((sum, value) => sum + value, 0) / 6) * 1000) / 1000;
      const anchorMechanismSimilarity = Math.round(((dims.reusable_asset_similarity + dims.photography_subject_similarity + dims.composition_template_similarity) / 3) * 1000) / 1000;
      const key = `${a.direction_id}_${b.direction_id}`;
      pairs.push({ pair: key, similarity: score, fingerprint_similarity: fingerprintSimilarity.similarity, execution_template_similarity: executionTemplateSimilarity, anchor_mechanism_similarity: anchorMechanismSimilarity, band: band(Math.max(score, fingerprintSimilarity.similarity)) });
      details[key] = { ...dims, fingerprint: fingerprintSimilarity, execution_template_similarity: executionTemplateSimilarity, anchor_mechanism_similarity: anchorMechanismSimilarity, composite: score, band: band(Math.max(score, fingerprintSimilarity.similarity)) };
    }
  }

  const declaredFamilies = directions.map((d) => d.direction_family).filter(Boolean);
  const familyDistinct = new Set(declaredFamilies).size === declaredFamilies.length;

  const highOverlapPairs = pairs.filter((p) => p.similarity >= OVERLAP_THRESHOLD || p.fingerprint_similarity >= OVERLAP_THRESHOLD);
  const templateOverlapPairs = pairs.filter((p) => p.execution_template_similarity > EXECUTION_TEMPLATE_THRESHOLD);
  const directionFamilyOverlap = pairs.length > 0 && highOverlapPairs.length === pairs.length;
  const rewriteRequired = highOverlapPairs.length > 0 || templateOverlapPairs.length > 0 || (declaredFamilies.length === directions.length && !familyDistinct);

  const blockingReasons = [];
  if (directionFamilyOverlap) blockingReasons.push('all_pairs_overlap');
  if (declaredFamilies.length === directions.length && !familyDistinct) blockingReasons.push('declared_families_not_distinct');
  for (const p of highOverlapPairs) blockingReasons.push(`pair_high_overlap(${p.pair}:${p.similarity})`);
  for (const p of templateOverlapPairs) blockingReasons.push(`execution_template_overlap(${p.pair}:${p.execution_template_similarity})`);

  const differenceBand = (values) => values.every((value) => value <= 0.55)
    ? 'clear'
    : values.some((value) => value >= OVERLAP_THRESHOLD) ? 'weak' : 'moderate';

  return {
    evaluator_version: DIRECTION_FAMILY_DIFFERENCE_EVALUATOR_VERSION,
    pairwise_similarity: Object.fromEntries(pairs.map((p) => [p.pair, p.similarity])),
    pairwise_fingerprint_similarity: Object.fromEntries(pairs.map((p) => [p.pair, p.fingerprint_similarity])),
    pairwise_details: details,
    direction_family_difference: differenceBand(pairs.map((pair) => pair.similarity)),
    anchor_mechanism_difference_band: differenceBand(pairs.map((pair) => pair.anchor_mechanism_similarity)),
    execution_template_difference_band: differenceBand(pairs.map((pair) => pair.execution_template_similarity)),
    execution_template_difference: pairs.every((pair) => pair.execution_template_similarity <= 0.55) ? 'clear' : pairs.some((pair) => pair.execution_template_similarity > EXECUTION_TEMPLATE_THRESHOLD) ? 'rewrite_required' : 'partial_overlap',
    anchor_mechanism_difference: pairs.every((pair) => pair.anchor_mechanism_similarity <= 0.55) ? 'clear' : pairs.some((pair) => pair.anchor_mechanism_similarity >= OVERLAP_THRESHOLD) ? 'rewrite_required' : 'partial_overlap',
    overlap_dimensions: highOverlapPairs.length,
    direction_family_overlap: directionFamilyOverlap,
    declared_families_distinct: familyDistinct,
    rewrite_required: rewriteRequired,
    blocking_reasons: blockingReasons
  };
}
