// Consumer Value Coverage Gate (doc section 四 / 八).
//
// v2.1 adds an explicit downstream consumer value dimension so the three
// directions together cover the B2B2C 消费者安心与美学价值 leg. Each direction
// may declare `downstream_consumer_value` (present / role / value_statement /
// visual_expression / touchpoints / evidence_ids); when absent the gate derives
// the same signal from free text (the doc forbids forcing a human subject onto
// every direction — E01 may be secondary, E02/E03 must be explicit).
//
// Set-level rules (doc section 四):
//   - the three directions together must cover consumer value
//   - at least two directions must explicitly contain consumer value
//   - at least one direction's consumer value must be Primary or Strong Secondary
// Missing any of these => set_missing_consumer_value => blocked.

import { normalizeConsumerValue } from './consumer-value-normalizer.js';

export const CONSUMER_VALUE_COVERAGE_EVALUATOR_VERSION = 'consumer-value-coverage-evaluator-v1';

const PRIMARY_SECONDARY_ROLES = ['primary', 'strong_secondary'];

export function evaluateConsumerValueCoverage(directions = []) {
  const perDirection = directions.map((direction) => {
    return normalizeConsumerValue(direction);
  });

  const explicitCount = perDirection.filter((item) => item.present && item.value_audience === 'consumer').length;
  const primaryOrStrong = perDirection.filter((item) => item.value_audience === 'consumer' && PRIMARY_SECONDARY_ROLES.includes(item.consumer_value_role)).length;
  const setCovered = primaryOrStrong > 0;

  const blockingReasons = [];
  if (!setCovered) blockingReasons.push('set_missing_consumer_value');
  if (explicitCount < 2) blockingReasons.push('fewer_than_two_directions_consumer_value');
  if (primaryOrStrong < 1) blockingReasons.push('no_primary_or_strong_secondary_consumer_value');

  const setMissingConsumerValue = blockingReasons.length > 0;

  return {
    evaluator_version: CONSUMER_VALUE_COVERAGE_EVALUATOR_VERSION,
    per_direction: perDirection,
    explicit_consumer_count: explicitCount,
    primary_or_strong_secondary_count: primaryOrStrong,
    set_consumer_covered: setCovered,
    set_missing_consumer_value: setMissingConsumerValue,
    blocking_reasons: blockingReasons
  };
}
