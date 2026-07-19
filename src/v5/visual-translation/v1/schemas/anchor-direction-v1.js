import { arrayValue, enumValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { validateEvidenceConfidence } from './evidence-confidence-v1.js';
import { assertKnownReferences, deepFreeze, fail } from './sprint-2-schema-utils.js';

const CONTROLLED_DIMENSIONS = Object.freeze(['shape', 'composition', 'material', 'lighting', 'motion', 'information', 'spatial_behavior']);

export function validateAnchorDirection(value, { evidenceIds, allowCandidateTypes = false } = {}) {
  const root = objectValue(value, 'anchorDirection');
  if (Array.isArray(root.primary_anchor)) fail('anchorDirection.primary_anchor must contain exactly one object', 'anchorDirection.primary_anchor');
  const primary_anchor = validateAnchorComponent(root.primary_anchor, 'anchorDirection.primary_anchor');
  const supporting_anchors = arrayValue(root.supporting_anchors, 'anchorDirection.supporting_anchors', { max: 2 })
    .map((item, index) => validateAnchorComponent(item, `anchorDirection.supporting_anchors[${index}]`));
  const componentIds = [primary_anchor.anchor_component_id, ...supporting_anchors.map((item) => item.anchor_component_id)];
  if (new Set(componentIds).size !== componentIds.length) fail('Anchor component IDs must be unique', 'anchorDirection.supporting_anchors');

  const mechanism = objectValue(root.anchor_mechanism, 'anchorDirection.anchor_mechanism');
  const controlled_dimensions = stringArray(mechanism.controlled_dimensions, 'anchorDirection.anchor_mechanism.controlled_dimensions', { min: 3 });
  if (controlled_dimensions.some((item) => !CONTROLLED_DIMENSIONS.includes(item))) fail('anchor_mechanism contains an unsupported controlled dimension', 'anchorDirection.anchor_mechanism.controlled_dimensions');
  const evidence_ids = stringArray(root.evidence_ids, 'anchorDirection.evidence_ids', { min: 1 });
  if (evidenceIds) assertKnownReferences(evidence_ids, evidenceIds, 'anchorDirection.evidence_ids', 'Evidence ID');
  const confidence = validateEvidenceConfidence(root, 'anchorDirection');
  const inclusion_boundary = observableBoundaries(root.inclusion_boundary, 'anchorDirection.inclusion_boundary');
  const exclusion_boundary = observableBoundaries(root.exclusion_boundary, 'anchorDirection.exclusion_boundary');

  return deepFreeze({
    anchor_id: stringValue(root.anchor_id, 'anchorDirection.anchor_id'),
    name: stringValue(root.name, 'anchorDirection.name'),
    anchor_type: enumValue(root.anchor_type, [
      'relationship_system', 'transformation_logic', 'spatial_logic', 'composition_system',
      ...(allowCandidateTypes ? ['marketing_slogan', 'single_object'] : [])
    ], 'anchorDirection.anchor_type'),
    core_visual_proposition: stringValue(root.core_visual_proposition, 'anchorDirection.core_visual_proposition', { maxLength: 300 }),
    primary_anchor,
    supporting_anchors,
    anchor_mechanism: {
      relationship: stringValue(mechanism.relationship, 'anchorDirection.anchor_mechanism.relationship', { maxLength: 300 }),
      behavior: stringValue(mechanism.behavior, 'anchorDirection.anchor_mechanism.behavior', { maxLength: 300 }),
      controlled_dimensions
    },
    visual_role: stringValue(root.visual_role, 'anchorDirection.visual_role', { maxLength: 240 }),
    inclusion_boundary,
    exclusion_boundary,
    evidence_ids,
    ...confidence,
    known_risks: stringArray(root.known_risks, 'anchorDirection.known_risks'),
    unresolved_questions: stringArray(root.unresolved_questions, 'anchorDirection.unresolved_questions'),
    status: enumValue(root.status, ['draft', 'pending_human_confirmation', 'confirmed', 'rejected'], 'anchorDirection.status')
  });
}

function validateAnchorComponent(value, path) {
  const item = objectValue(value, path);
  return {
    anchor_component_id: stringValue(item.anchor_component_id, `${path}.anchor_component_id`),
    name: stringValue(item.name, `${path}.name`),
    mechanism: stringValue(item.mechanism, `${path}.mechanism`, { maxLength: 240 }),
    visual_role: stringValue(item.visual_role, `${path}.visual_role`, { maxLength: 180 })
  };
}

function observableBoundaries(value, path) {
  return arrayValue(value, path, { min: 1 }).map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    const item = objectValue(raw, itemPath);
    return {
      rule: stringValue(item.rule, `${itemPath}.rule`, { maxLength: 240 }),
      observable_condition: stringValue(item.observable_condition, `${itemPath}.observable_condition`, { maxLength: 300 })
    };
  });
}
