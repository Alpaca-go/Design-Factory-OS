// Consumer Role / Weight Consistency Gate (doc section 七).
//
// The declared consumer_value_role (primary / strong_secondary / secondary /
// none) must agree with the consumer_value_weight declared in compliance_weights:
//   primary          -> consumer_value_weight >= 0.15
//   strong_secondary -> consumer_value_weight >= 0.08
//   secondary        -> consumer_value_weight >= 0.04
//   none             -> consumer_value_weight <= 0.02
// A mismatch is `consumer_role_weight_mismatch` => rewrite_required. Also
// forbidden: `present = true` together with `role = none`.

export const CONSUMER_WEIGHT_CONSISTENCY_VERSION = 'consumer-weight-consistency-v1';

import { normalizeConsumerValue } from './consumer-value-normalizer.js';

const ROLE_WEIGHT_FLOOR = {
  primary: 0.15,
  strong_secondary: 0.08,
  secondary: 0.04,
  auxiliary: 0.0,
  none: 0.0
};
const ROLE_WEIGHT_CEILING = {
  none: 0.02
};

export function evaluateConsumerWeightConsistency(directions = []) {
  const perDirection = directions.map((direction) => {
    const canonical = normalizeConsumerValue(direction);
    const role = canonical.consumer_value_role;
    const present = canonical.present;
    const weight = Number(direction.compliance_weights?.consumer_value_weight ?? 0);

    let consistent = true;
    if (role === 'primary') consistent = weight >= ROLE_WEIGHT_FLOOR.primary;
    else if (role === 'strong_secondary') consistent = weight >= ROLE_WEIGHT_FLOOR.strong_secondary;
    else if (role === 'secondary') consistent = weight >= ROLE_WEIGHT_FLOOR.secondary;
    else if (role === 'none') consistent = weight <= ROLE_WEIGHT_CEILING.none;

    const presentNoneConflict = present && role === 'none';

    return {
      direction_id: direction.direction_id,
      consumer_value_role: role,
      present,
      consumer_value_weight: weight,
      consistent,
      present_none_conflict: presentNoneConflict,
      canonical_source: canonical.source,
      source_paths: canonical.source_paths
    };
  });

  const mismatched = perDirection.filter((p) => !p.consistent);
  const presentNone = perDirection.filter((p) => p.present_none_conflict);
  const rewriteRequired = mismatched.length > 0 || presentNone.length > 0;

  const blockingReasons = [];
  for (const m of mismatched) {
    blockingReasons.push(`consumer_role_weight_mismatch(${m.direction_id}:${m.consumer_value_role}=${m.consumer_value_weight})`);
  }
  for (const p of presentNone) {
    blockingReasons.push(`present_true_role_none(${p.direction_id})`);
  }

  return {
    evaluator_version: CONSUMER_WEIGHT_CONSISTENCY_VERSION,
    per_direction: perDirection,
    rewrite_required: rewriteRequired,
    blocking_reasons: blockingReasons
  };
}
