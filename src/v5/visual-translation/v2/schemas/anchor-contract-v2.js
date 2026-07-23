// Anchor Candidate Contract v2.
//
// Redefines the Anchor Candidate (doc section 六) as a mechanism that directly
// generates the first batch of brand executables, instead of a macro spatial
// concept. It composes one core graphic asset, one industry/photo object, one
// information module and one layout mechanism into a single reusable template.
//
// This is a v2-only contract; it must not modify the v1 anchor candidate schema.

import {
  arrayValue,
  deepFreeze,
  enumValue,
  fail,
  numberValue,
  objectValue,
  stringArray,
  stringValue
} from './schema-utils-v2.js';
import { COMPOSITION_TOUCHPOINTS } from './direction-contract-v2.js';

export const ANCHOR_V2_CONTRACT_VERSION = 'visual-direction-v2-anchor';

export const ANCHOR_IMAGE_EXPECTED_TOUCHPOINTS = Object.freeze([...COMPOSITION_TOUCHPOINTS]);

function validateCoreAssetCombination(value, path, assetIds) {
  const item = objectValue(value, path);
  const graphicAssetId = stringValue(item.graphic_asset_id, `${path}.graphic_asset_id`);
  if (assetIds && !assetIds.has(graphicAssetId)) fail(`${path}.graphic_asset_id must reference a core_reusable_asset`, `${path}.graphic_asset_id`);
  return {
    graphic_asset_id: graphicAssetId,
    industry_or_photo_object: stringValue(item.industry_or_photo_object, `${path}.industry_or_photo_object`, { maxLength: 300 }),
    information_module: stringValue(item.information_module, `${path}.information_module`, { maxLength: 300 }),
    layout_mechanism: stringValue(item.layout_mechanism, `${path}.layout_mechanism`, { maxLength: 300 })
  };
}

function validatePrimaryLayoutTemplate(value, path) {
  const item = objectValue(value, path);
  const whitespaceRatio = numberValue(item.whitespace_ratio, `${path}.whitespace_ratio`, { min: 0, max: 1 });
  return {
    subject_position: stringValue(item.subject_position, `${path}.subject_position`, { maxLength: 200 }),
    information_position: stringValue(item.information_position, `${path}.information_position`, { maxLength: 200 }),
    brand_position: stringValue(item.brand_position, `${path}.brand_position`, { maxLength: 200 }),
    whitespace_ratio: whitespaceRatio,
    supporting_asset_position: stringValue(item.supporting_asset_position, `${path}.supporting_asset_position`, { maxLength: 200 }),
    landscape_adaptation: stringValue(item.landscape_adaptation, `${path}.landscape_adaptation`, { maxLength: 300 }),
    portrait_adaptation: stringValue(item.portrait_adaptation, `${path}.portrait_adaptation`, { maxLength: 300 })
  };
}

function validateAnchorImageBrief(value, path) {
  const item = objectValue(value, path);
  return {
    image_purpose: stringValue(item.image_purpose, `${path}.image_purpose`, { maxLength: 300 }),
    subject: stringValue(item.subject, `${path}.subject`, { maxLength: 300 }),
    industry_object: stringValue(item.industry_object, `${path}.industry_object`, { maxLength: 300 }),
    graphic_overlay: stringValue(item.graphic_overlay, `${path}.graphic_overlay`, { maxLength: 300 }),
    info_whitespace: stringValue(item.info_whitespace, `${path}.info_whitespace`, { maxLength: 300 }),
    composition_visual_hierarchy: stringValue(item.composition_visual_hierarchy, `${path}.composition_visual_hierarchy`, { maxLength: 400 }),
    prohibited_content: stringValue(item.prohibited_content, `${path}.prohibited_content`, { maxLength: 300 }),
    expected_touchpoint: enumValue(item.expected_touchpoint, ANCHOR_IMAGE_EXPECTED_TOUCHPOINTS, `${path}.expected_touchpoint`)
  };
}

export function validateAnchorCandidateV2(value, context = {}) {
  const root = objectValue(value?.anchorCandidateV2 || value, 'anchorCandidateV2');
  const assetIds = context.assetIds || new Set();

  const anchor = {
    contract_version: ANCHOR_V2_CONTRACT_VERSION,
    anchor_id: stringValue(root.anchor_id, 'anchorCandidateV2.anchor_id'),
    anchor_name: stringValue(root.anchor_name, 'anchorCandidateV2.anchor_name'),
    execution_thesis: stringValue(root.execution_thesis, 'anchorCandidateV2.execution_thesis', { maxLength: 400 }),
    core_asset_combination: validateCoreAssetCombination(root.core_asset_combination, 'anchorCandidateV2.core_asset_combination', assetIds),
    primary_layout_template: validatePrimaryLayoutTemplate(root.primary_layout_template, 'anchorCandidateV2.primary_layout_template'),
    industry_object_rule: stringValue(root.industry_object_rule, 'anchorCandidateV2.industry_object_rule', { maxLength: 400 }),
    photography_graphic_mix: stringValue(root.photography_graphic_mix, 'anchorCandidateV2.photography_graphic_mix', { maxLength: 400 }),
    information_hierarchy: stringArray(root.information_hierarchy, 'anchorCandidateV2.information_hierarchy', { min: 3 }),
    composition_behavior: stringValue(root.composition_behavior, 'anchorCandidateV2.composition_behavior', { maxLength: 400 }),
    reusable_components: arrayValue(root.reusable_components, 'anchorCandidateV2.reusable_components', { min: 2 })
      .map((item, index) => stringValue(item, `anchorCandidateV2.reusable_components[${index}]`, { maxLength: 300 })),
    execution_examples: arrayValue(root.execution_examples, 'anchorCandidateV2.execution_examples', { min: 2 })
      .map((item, index) => stringValue(item, `anchorCandidateV2.execution_examples[${index}]`, { maxLength: 400 })),
    anchor_image_brief: validateAnchorImageBrief(root.anchor_image_brief, 'anchorCandidateV2.anchor_image_brief'),
    prohibited_drift: stringArray(root.prohibited_drift, 'anchorCandidateV2.prohibited_drift', { min: 1 }),
    difference_from_other_candidates: stringValue(root.difference_from_other_candidates, 'anchorCandidateV2.difference_from_other_candidates', { maxLength: 400 }),
    execution_readiness: root.execution_readiness === undefined ? null : numberValue(root.execution_readiness, 'anchorCandidateV2.execution_readiness', { min: 0, max: 100 })
  };

  return deepFreeze(anchor);
}
