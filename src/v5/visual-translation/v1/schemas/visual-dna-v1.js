import { arrayValue, enumValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { assertKnownReferences, deepFreeze, fail } from './sprint-2-schema-utils.js';

const VISUAL_FORM_CATEGORIES = Object.freeze([
  'logo', 'color', 'shape', 'composition', 'material', 'lighting',
  'motion', 'information', 'spatial', 'relationship'
]);

export function validateVisualDna(value, { evidenceIds, anchorIds } = {}) {
  const root = objectValue(value, 'visualDna');
  const primary_dna = arrayValue(root.primary_dna, 'visualDna.primary_dna', { min: 1, max: 2 })
    .map((item, index) => validateDnaUnit(item, `visualDna.primary_dna[${index}]`, { evidenceIds, anchorIds }));
  const supporting_dna = arrayValue(root.supporting_dna, 'visualDna.supporting_dna', { min: 2, max: 3 })
    .map((item, index) => validateDnaUnit(item, `visualDna.supporting_dna[${index}]`, { evidenceIds, anchorIds }));
  const all = [...primary_dna, ...supporting_dna];
  if (all.length > 5) fail('Visual DNA total must not exceed five units', 'visualDna');
  if (new Set(all.map((item) => item.dna_id)).size !== all.length) fail('Visual DNA IDs must be unique', 'visualDna');
  if (all.every((item) => item.visual_form.category === 'logo' || item.visual_form.category === 'color')) {
    fail('Logo and color cannot constitute Visual DNA by themselves', 'visualDna', 'DNA_LOGO_COLOR_ONLY');
  }
  return deepFreeze({
    primary_dna,
    supporting_dna,
    forbidden_mutations: stringArray(root.forbidden_mutations, 'visualDna.forbidden_mutations', { min: 1 })
  });
}

function validateDnaUnit(value, path, { evidenceIds, anchorIds }) {
  const item = objectValue(value, path);
  const form = objectValue(item.visual_form, `${path}.visual_form`);
  const variation = objectValue(item.variation_range, `${path}.variation_range`);
  const relation = objectValue(item.anchor_relation, `${path}.anchor_relation`);
  const refs = stringArray(item.evidence_ids, `${path}.evidence_ids`, { min: 1 });
  if (evidenceIds) assertKnownReferences(refs, evidenceIds, `${path}.evidence_ids`, 'Evidence ID');
  const relationAnchorId = stringValue(relation.anchor_id, `${path}.anchor_relation.anchor_id`);
  if (anchorIds) assertKnownReferences([relationAnchorId], anchorIds, `${path}.anchor_relation.anchor_id`, 'Anchor ID');
  return {
    dna_id: stringValue(item.dna_id, `${path}.dna_id`),
    name: stringValue(item.name, `${path}.name`),
    visual_form: {
      category: enumValue(form.category, VISUAL_FORM_CATEGORIES, `${path}.visual_form.category`),
      description: stringValue(form.description, `${path}.visual_form.description`, { maxLength: 300 }),
      observable_features: stringArray(form.observable_features, `${path}.visual_form.observable_features`, { min: 1 })
    },
    functional_role: stringValue(item.functional_role, `${path}.functional_role`, { maxLength: 240 }),
    fixed_properties: stringArray(item.fixed_properties, `${path}.fixed_properties`, { min: 1 }),
    flexible_properties: stringArray(item.flexible_properties, `${path}.flexible_properties`, { min: 1 }),
    variation_range: {
      allowed_variations: stringArray(variation.allowed_variations, `${path}.variation_range.allowed_variations`, { min: 1 }),
      limits: stringArray(variation.limits, `${path}.variation_range.limits`, { min: 1 })
    },
    combination_rules: stringArray(item.combination_rules, `${path}.combination_rules`, { min: 1 }),
    forbidden_mutations: stringArray(item.forbidden_mutations, `${path}.forbidden_mutations`, { min: 1 }),
    evidence_ids: refs,
    anchor_relation: {
      anchor_id: relationAnchorId,
      relation: stringValue(relation.relation, `${path}.anchor_relation.relation`, { maxLength: 240 })
    },
    validation_conditions: stringArray(item.validation_conditions, `${path}.validation_conditions`, { min: 1 })
  };
}
