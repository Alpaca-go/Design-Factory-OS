import { arrayValue, enumValue, objectValue, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { assertKnownReferences, deepFreeze, fail } from './sprint-2-schema-utils.js';

export const CONSISTENCY_RULE_GROUPS = Object.freeze([
  'must_preserve', 'may_vary', 'must_not_change', 'cross_media_rules',
  'asset_usage_rules', 'audience_boundary_rules', 'template_avoidance_rules'
]);

export function validateConsistencyRules(value, { anchorIds = new Set(), dnaIds = new Set() } = {}) {
  const root = objectValue(value, 'consistencyRules');
  const result = Object.fromEntries(CONSISTENCY_RULE_GROUPS.map((group) => [
    group,
    arrayValue(root[group], `consistencyRules.${group}`, { min: 1 })
      .map((item, index) => validateConsistencyRule(item, `consistencyRules.${group}[${index}]`, { anchorIds, dnaIds }))
  ]));
  const ids = Object.values(result).flat().map((rule) => rule.rule_id);
  if (new Set(ids).size !== ids.length) fail('Consistency Rule IDs must be unique', 'consistencyRules');
  return deepFreeze(result);
}

function validateConsistencyRule(value, path, { anchorIds, dnaIds }) {
  const item = objectValue(value, path);
  const maps_to = arrayValue(item.maps_to, `${path}.maps_to`, { min: 1 }).map((raw, index) => {
    const mapPath = `${path}.maps_to[${index}]`;
    const mapping = objectValue(raw, mapPath);
    const type = enumValue(mapping.type, ['anchor', 'dna'], `${mapPath}.type`);
    const id = stringValue(mapping.id, `${mapPath}.id`);
    assertKnownReferences([id], type === 'anchor' ? anchorIds : dnaIds, `${mapPath}.id`, `${type} ID`);
    return { type, id };
  });
  return {
    rule_id: stringValue(item.rule_id, `${path}.rule_id`),
    statement: stringValue(item.statement, `${path}.statement`, { maxLength: 300 }),
    observable_condition: stringValue(item.observable_condition, `${path}.observable_condition`, { maxLength: 300 }),
    validation_method: stringValue(item.validation_method, `${path}.validation_method`, { maxLength: 300 }),
    maps_to,
    locked_asset_impact: enumValue(item.locked_asset_impact, ['none', 'preserve'], `${path}.locked_asset_impact`)
  };
}
