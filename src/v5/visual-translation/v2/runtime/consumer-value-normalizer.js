import { collectDirectionText } from './direction-text-util.js';
import { countKeywordHits } from './evaluator-keywords.js';

export const CONSUMER_VALUE_NORMALIZER_VERSION = 'consumer-value-normalizer-v1';

export const CONSUMER_VALUE_ROLES = Object.freeze([
  'primary',
  'strong_secondary',
  'secondary',
  'auxiliary',
  'none'
]);

const ROLE_RANK = new Map(CONSUMER_VALUE_ROLES.map((role, index) => [role, CONSUMER_VALUE_ROLES.length - index]));
const CONSUMER_KEYWORDS = ['消费者', '安心', '用户体验', '美学价值', '信任', '用户', '终端', '终端消费者', '消费者体验', '品质感', '精致'];

function validRole(value) {
  return ROLE_RANK.has(value) ? value : undefined;
}

function strongestRole(values) {
  return values
    .map(validRole)
    .filter(Boolean)
    .sort((a, b) => ROLE_RANK.get(b) - ROLE_RANK.get(a))[0];
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function hasConsumerText(direction) {
  return countKeywordHits(collectDirectionText(direction), CONSUMER_KEYWORDS) > 0;
}

/**
 * Creates the only consumer-value read model used by deterministic gates and
 * report compilation. It preserves the provider contract and therefore does
 * not introduce a second schema field into persisted model output.
 */
export function normalizeConsumerValue(direction = {}) {
  const root = direction.visualDirectionV2 || direction;
  const directionLevel = root.consumer_value || root.downstream_consumer_value;
  const canonicalDirectionValue = directionLevel || (root.consumer_role ? { consumer_value_role: root.consumer_role } : undefined);
  const examples = root.execution_examples || [];
  const exampleValues = examples
    .map((example, index) => ({ value: example?.downstream_consumer_value, index }))
    .filter(({ value }) => value && typeof value === 'object');

  const directionRole = validRole(canonicalDirectionValue?.role || canonicalDirectionValue?.consumer_value_role);
  const exampleRole = strongestRole(exampleValues.map(({ value }) => value.consumer_value_role || value.role));
  const directionHasSignal = Boolean(canonicalDirectionValue && (
    typeof canonicalDirectionValue.present === 'boolean' ||
    directionRole ||
    canonicalDirectionValue.value_statement ||
    canonicalDirectionValue.visual_expression
  ));
  const examplesHaveSignal = exampleValues.length > 0;

  let source = 'absent';
  let present;
  let role;
  if (directionHasSignal) {
    source = 'direction_level';
    present = typeof canonicalDirectionValue.present === 'boolean'
      ? canonicalDirectionValue.present
      : Boolean(directionRole && directionRole !== 'none');
    role = directionRole;
  } else if (examplesHaveSignal) {
    source = 'execution_examples';
    present = exampleValues.some(({ value }) => {
      const valueRole = validRole(value.consumer_value_role || value.role);
      return value.present === true || Boolean(valueRole && valueRole !== 'none');
    });
    role = exampleRole;
  } else if (hasConsumerText(root)) {
    source = 'text_inference';
    present = true;
    // Preserve the previous Coverage Gate fallback while making every
    // consumer gate read the same inferred result.
    role = 'strong_secondary';
  } else {
    present = false;
    role = 'none';
  }

  if (!role) role = present ? 'strong_secondary' : 'none';

  const allValues = [canonicalDirectionValue, ...exampleValues.map(({ value }) => value)].filter(Boolean);
  const sourcePaths = [];
  if (directionHasSignal) {
    if (root.consumer_value) sourcePaths.push('visualDirectionV2.consumer_value');
    else if (root.downstream_consumer_value) sourcePaths.push('visualDirectionV2.downstream_consumer_value');
    else sourcePaths.push('visualDirectionV2.consumer_role');
  }
  for (const { index } of exampleValues) {
    sourcePaths.push(`visualDirectionV2.execution_examples[${index}].downstream_consumer_value`);
  }

  return {
    normalizer_version: CONSUMER_VALUE_NORMALIZER_VERSION,
    direction_id: root.direction_id,
    present: Boolean(present),
    consumer_value_role: role,
    value_statement: uniqueStrings(allValues.map((value) => value.value_statement)).join('；'),
    visual_expression: uniqueStrings(allValues.map((value) => value.visual_expression)).join('；'),
    touchpoints: uniqueStrings(allValues.flatMap((value) => value.touchpoints || [])),
    evidence_ids: uniqueStrings(allValues.flatMap((value) => value.evidence_ids || [])),
    explicit: source === 'direction_level' || source === 'execution_examples',
    source,
    source_paths: sourcePaths
  };
}

export function normalizeConsumerValues(directions = []) {
  return directions.map(normalizeConsumerValue);
}
