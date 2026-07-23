// Compliance Weight Controller (doc section 7).
//
// At most ONE direction may take compliance as its primary weight. If all three
// directions carry compliance_weight >= 0.5 the output is compliance_overweight
// and must be rewritten. Weights may be supplied explicitly by the model; when
// absent we derive a normalized distribution from keyword density.

import { collectDirectionText } from './direction-text-util.js';
import { COMPLIANCE_WEIGHT_KEYWORDS, countKeywordHits } from './evaluator-keywords.js';

export const COMPLIANCE_WEIGHT_CONTROLLER_VERSION = 'compliance-weight-controller-v1';

const MAX_PRIMARY_COMPLIANCE_DIRECTIONS = 1;
const MAX_SECONDARY_COMPLIANCE_DIRECTIONS = 3;
const OVERWEIGHT_THRESHOLD = 0.5;

export function deriveComplianceWeights(direction) {
  const text = collectDirectionText(direction);
  const raw = {};
  let total = 0;
  for (const [key, keywords] of Object.entries(COMPLIANCE_WEIGHT_KEYWORDS)) {
    raw[key] = countKeywordHits(text, keywords);
    total += raw[key];
  }
  if (total === 0) {
    // Default neutral spread so a direction is never silently skipped.
    return {
      compliance_weight: 0,
      supply_chain_weight: 0,
      product_material_weight: 0,
      ecosystem_weight: 0,
      brand_aesthetic_weight: 0,
      consumer_value_weight: 0,
      derived: true
    };
  }
  const normalized = {};
  for (const key of Object.keys(raw)) normalized[key] = Number((raw[key] / total).toFixed(3));
  return { ...normalized, derived: true };
}

export function resolveWeights(direction) {
  const explicit = direction.compliance_weights;
  if (explicit && typeof explicit === 'object') {
    const keys = ['compliance_weight', 'supply_chain_weight', 'product_material_weight', 'ecosystem_weight', 'brand_aesthetic_weight', 'consumer_value_weight'];
    const present = keys.every((k) => typeof explicit[k] === 'number');
    if (present) {
      const sum = keys.reduce((s, k) => s + (explicit[k] || 0), 0);
      if (sum > 0) {
        const norm = {};
        for (const k of keys) norm[k] = Number(((explicit[k] || 0) / sum).toFixed(3));
        return { ...norm, derived: false };
      }
    }
  }
  return deriveComplianceWeights(direction);
}

export function evaluateComplianceWeight(directions = []) {
  const perDirection = directions.map((direction) => {
    const weights = resolveWeights(direction);
    const primary = weights.compliance_weight >= OVERWEIGHT_THRESHOLD;
    const secondary = weights.compliance_weight > 0 && weights.compliance_weight < OVERWEIGHT_THRESHOLD;
    return {
      direction_id: direction.direction_id,
      ...weights,
      is_primary_compliance: primary,
      is_secondary_compliance: secondary
    };
  });

  const primaryCount = perDirection.filter((d) => d.is_primary_compliance).length;
  const secondaryCount = perDirection.filter((d) => d.is_secondary_compliance).length;
  const allOverweight = perDirection.length > 0 && perDirection.every((d) => d.compliance_weight >= OVERWEIGHT_THRESHOLD);

  // Doc §7 intent: "三个方向都只围绕合规、仓储、单据、批次、温控、资质" must be
  // rewritten. When no direction is led by product/material, ecosystem, brand
  // aesthetics or consumer value — every direction's top weight is compliance or
  // supply-chain — the set is compliance/supply-chain dominant and must be
  // rewritten even if no single weight reaches 0.5.
  const NON_COMPLIANCE_KEYS = ['product_material_weight', 'ecosystem_weight', 'brand_aesthetic_weight', 'consumer_value_weight'];
  const complianceSupplyChainDominant = perDirection.length > 0 && perDirection.every((d) => {
    const maxKey = Object.keys(d).filter((k) => k.endsWith('_weight')).reduce((best, k) => (d[k] > d[best] ? k : best), 'compliance_weight');
    return maxKey === 'compliance_weight' || maxKey === 'supply_chain_weight';
  });
  const anyNonComplianceLead = perDirection.some((d) => {
    const maxKey = Object.keys(d).filter((k) => k.endsWith('_weight')).reduce((best, k) => (d[k] > d[best] ? k : best), 'compliance_weight');
    return NON_COMPLIANCE_KEYS.includes(maxKey);
  });

  const blockingReasons = [];
  if (primaryCount > MAX_PRIMARY_COMPLIANCE_DIRECTIONS) blockingReasons.push('too_many_primary_compliance_directions');
  if (secondaryCount > MAX_SECONDARY_COMPLIANCE_DIRECTIONS) blockingReasons.push('too_many_secondary_compliance_directions');
  if (allOverweight) blockingReasons.push('all_directions_compliance_overweight');
  if (complianceSupplyChainDominant && !anyNonComplianceLead) blockingReasons.push('all_directions_compliance_supplychain_dominant');

  return {
    evaluator_version: COMPLIANCE_WEIGHT_CONTROLLER_VERSION,
    max_primary_compliance_directions: MAX_PRIMARY_COMPLIANCE_DIRECTIONS,
    max_secondary_compliance_directions: MAX_SECONDARY_COMPLIANCE_DIRECTIONS,
    per_direction: perDirection,
    primary_compliance_direction_count: primaryCount,
    secondary_compliance_direction_count: secondaryCount,
    compliance_overweight: allOverweight,
    compliance_supplychain_dominant: complianceSupplyChainDominant && !anyNonComplianceLead,
    rewrite_required: blockingReasons.length > 0,
    blocking_reasons: blockingReasons
  };
}
