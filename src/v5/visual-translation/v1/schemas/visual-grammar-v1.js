import { arrayValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { assertKnownReferences, deepFreeze } from './sprint-2-schema-utils.js';

export const GRAMMAR_CATEGORIES = Object.freeze([
  'shape_grammar', 'composition_grammar', 'material_grammar',
  'lighting_grammar', 'motion_grammar', 'information_grammar'
]);

export function validateVisualGrammar(value, { anchorIds } = {}) {
  const root = objectValue(value, 'visualGrammar');
  return deepFreeze(Object.fromEntries(GRAMMAR_CATEGORIES.map((category) => [
    category,
    validateGrammarCategory(root[category], `visualGrammar.${category}`, anchorIds)
  ])));
}

export function validateVisualGrammarStage(value, categories, { anchorIds } = {}) {
  const root = objectValue(value, 'visualGrammarStage');
  return deepFreeze(Object.fromEntries(categories.map((category) => {
    if (!GRAMMAR_CATEGORIES.includes(category)) throw new TypeError(`Unsupported Grammar category: ${category}`);
    return [category, validateGrammarCategory(root[category], `visualGrammarStage.${category}`, anchorIds)];
  })));
}

function validateGrammarCategory(value, path, anchorIds) {
  const item = objectValue(value, path);
  const variation = objectValue(item.variation_range, `${path}.variation_range`);
  const inheritance = objectValue(item.anchor_inheritance, `${path}.anchor_inheritance`);
  const inheritedAnchorIds = stringArray(inheritance.anchor_ids, `${path}.anchor_inheritance.anchor_ids`, { min: 1 });
  if (anchorIds) assertKnownReferences(inheritedAnchorIds, anchorIds, `${path}.anchor_inheritance.anchor_ids`, 'Anchor ID');
  return {
    allowed: observableRules(item.allowed, `${path}.allowed`),
    preferred: observableRules(item.preferred, `${path}.preferred`),
    avoid: observableRules(item.avoid, `${path}.avoid`),
    relationships: observableRules(item.relationships, `${path}.relationships`),
    variation_range: {
      allowed_variations: stringArray(variation.allowed_variations, `${path}.variation_range.allowed_variations`, { min: 1 }),
      hard_limits: stringArray(variation.hard_limits, `${path}.variation_range.hard_limits`, { min: 1 })
    },
    anchor_inheritance: {
      anchor_ids: inheritedAnchorIds,
      inherited_constraints: stringArray(inheritance.inherited_constraints, `${path}.anchor_inheritance.inherited_constraints`, { min: 1 })
    },
    validation_notes: stringArray(item.validation_notes, `${path}.validation_notes`, { min: 1 })
  };
}

function observableRules(value, path) {
  return arrayValue(value, path, { min: 1 }).map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    const item = objectValue(raw, itemPath);
    return {
      rule: stringValue(item.rule, `${itemPath}.rule`, { maxLength: 240 }),
      observable_condition: stringValue(item.observable_condition, `${itemPath}.observable_condition`, { maxLength: 300 })
    };
  });
}
