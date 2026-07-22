// Execution-oriented Visual Direction Contract v2.
//
// Replaces the conceptual v1 direction ("what the brand feels like") with an
// execution-ready direction ("how a designer starts making posters, packaging,
// pages and exhibition material today"). This contract is the single source of
// truth for the experimental `execution_oriented_v2` mode.
//
// Allowed to define (doc section 三): Direction Contract v2, Direction Output
// Schema v2, Reusable Visual Assets, Industry Recognition Layer, Composition
// Templates. MUST NOT modify v1, Evidence, Asset Authorization, Audience
// Boundary, Direction Score v1, Difference Matrix v1 or the v1.3.3 Report Compiler.

import {
  arrayValue,
  assertKnownReferences,
  containsChinese,
  deepFreeze,
  enumValue,
  fail,
  numberValue,
  objectValue,
  stringArray,
  stringValue,
  uniqueStringArray
} from './schema-utils-v2.js';

export const VISUAL_DIRECTION_V2_CONTRACT_VERSION = 'visual-direction-v2-execution';

export const REUSABLE_ASSET_TYPES = Object.freeze([
  'graphic_asset',
  'information_asset',
  'photography_asset',
  'layout_asset',
  'material_asset',
  'motion_asset'
]);

export const REQUIRED_REUSABLE_ASSET_TYPES = Object.freeze([
  'graphic_asset',
  'information_asset',
  'photography_asset',
  'layout_asset'
]);

export const COMPOSITION_TOUCHPOINTS = Object.freeze([
  'poster',
  'capability_deck',
  'digital_hero',
  'packaging_front',
  'exhibition_backdrop',
  'short_video_cover',
  'map_or_activity'
]);

export const EXECUTION_EXAMPLE_CATEGORIES = Object.freeze([
  'core_brand',
  'capability_product',
  'digital_event'
]);

export const ANTI_CONCEPT_ART_CONSTRAINTS = Object.freeze([
  { constraint_id: 'no_giant_space_installation_as_primary', rule: '不得以巨型空间装置作为主要画面' },
  { constraint_id: 'no_architecture_pavilion_sculpture_realestate_as_subject', rule: '不得以建筑、展馆、雕塑或地产空间为视觉主体' },
  { constraint_id: 'no_material_light_only_premium', rule: '不得只依赖材质与光影形成高级感' },
  { constraint_id: 'no_abstract_without_industry_content', rule: '不得只有抽象物体而没有行业内容' },
  { constraint_id: 'must_convert_to_flat_design', rule: '不得生成无法转化为平面设计的画面' },
  { constraint_id: 'no_distant_grand_space_replacing_info', rule: '不得用远景宏大空间替代品牌信息' },
  { constraint_id: 'no_default_glass_stone_glowing', rule: '不得默认使用玻璃曲面、石材和发光结构' },
  { constraint_id: 'no_cinematic_concept_art_only', rule: '不得只输出电影概念图语言' },
  { constraint_id: 'must_generate_poster_booklet_packaging_page_template', rule: '必须能直接生成海报、画册、包装或页面母版' }
]);

const ANTI_CONCEPT_ART_CONSTRAINT_IDS = ANTI_CONCEPT_ART_CONSTRAINTS.map((item) => item.constraint_id);

// Direction families (doc section 6). Optional: the model may declare which
// family each direction belongs to; the family-difference gate also derives it.
export const DIRECTION_FAMILIES = Object.freeze(['A', 'B', 'C']);

// v2.1 — semantic Direction Family types (doc section 五/八). `direction_family`
// stays the A/B/C enum (doc 十五 forbids re-designing Direction Family); this
// is the human-readable family kind used by the E02 Aesthetic Gate and the
// Business Model Coverage Gate. A/B/C map 1:1 to these.
export const DIRECTION_FAMILY_TYPES = Object.freeze([
  'supply_chain_trust',
  'product_material_aesthetics',
  'industry_ecosystem'
]);

export const DIRECTION_FAMILY_TYPE_BY_LETTER = Object.freeze({
  A: 'supply_chain_trust',
  B: 'product_material_aesthetics',
  C: 'industry_ecosystem'
});

// v2.1 — downstream consumer value roles (doc section 四/八).
export const CONSUMER_VALUE_ROLES = Object.freeze([
  'primary',
  'strong_secondary',
  'secondary',
  'auxiliary',
  'none'
]);

// Asset authorization control modes (doc section 9).
export const ASSET_AUTHORIZATION_MODES = Object.freeze([
  'abstracted',
  'redacted',
  'structure_only',
  'real_data_required',
  'prohibited'
]);

export const PHOTOGRAPHY_REQUIREMENT_MODES = Object.freeze([
  'required',
  'optional',
  'none'
]);

function optionalString(value, fallback) {
  return value === undefined || value === null ? fallback : String(value);
}

function optionalNumber(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function validateInformationZone(value, path) {
  if (value === undefined || value === null || typeof value === 'string') return optionalString(value);
  const item = objectValue(value, path);
  return {
    position: stringValue(item.position, `${path}.position`),
    width_or_height: stringValue(item.width_or_height, `${path}.width_or_height`),
    content_types: stringArray(item.content_types || [], `${path}.content_types`, { min: 1 }),
    alignment: stringValue(item.alignment, `${path}.alignment`),
    background_relationship: stringValue(item.background_relationship, `${path}.background_relationship`)
  };
}

function validateBrandZone(value, path) {
  if (value === undefined || value === null || typeof value === 'string') return optionalString(value);
  const item = objectValue(value, path);
  return {
    position: stringValue(item.position, `${path}.position`),
    logo_usage: stringValue(item.logo_usage, `${path}.logo_usage`),
    safety_margin: stringValue(item.safety_margin, `${path}.safety_margin`),
    relationship_to_main_visual: stringValue(item.relationship_to_main_visual, `${path}.relationship_to_main_visual`),
    prohibited_behavior: stringArray(item.prohibited_behavior || [], `${path}.prohibited_behavior`, { min: 1 })
  };
}

export function validateReusableAsset(value, path) {
  const item = objectValue(value, path);
  const assetType = enumValue(item.asset_type, REUSABLE_ASSET_TYPES, `${path}.asset_type`);
  return {
    asset_id: stringValue(item.asset_id, `${path}.asset_id`),
    asset_name: stringValue(item.asset_name, `${path}.asset_name`),
    asset_type: assetType,
    visual_description: stringValue(item.visual_description, `${path}.visual_description`, { maxLength: 240 }),
    business_evidence: stringValue(item.business_evidence, `${path}.business_evidence`, { maxLength: 240 }),
    execution_role: stringValue(item.execution_role, `${path}.execution_role`, { maxLength: 160 }),
    reusable_touchpoints: stringArray(item.reusable_touchpoints, `${path}.reusable_touchpoints`, { min: 1 }),
    prohibited_use: stringValue(item.prohibited_use, `${path}.prohibited_use`, { maxLength: 200 })
  };
}

function validateIndustryRecognitionLayer(value, path) {
  const item = objectValue(value, path);
  const layer = {
    industry_visual_objects: stringArray(item.industry_visual_objects, `${path}.industry_visual_objects`, { min: 1 }),
    industry_data_objects: stringArray(item.industry_data_objects, `${path}.industry_data_objects`, { min: 1 }),
    industry_process_objects: stringArray(item.industry_process_objects, `${path}.industry_process_objects`, { min: 1 }),
    industry_space_and_real_scenes: stringArray(item.industry_space_and_real_scenes, `${path}.industry_space_and_real_scenes`, { min: 1 }),
    usable_business_objects: stringArray(item.usable_business_objects, `${path}.usable_business_objects`, { min: 1 }),
    prohibited_misleading_templates: stringArray(item.prohibited_misleading_templates, `${path}.prohibited_misleading_templates`, { min: 1 }),
    minimum_industry_recognition_strength: numberValue(item.minimum_industry_recognition_strength, `${path}.minimum_industry_recognition_strength`, { min: 1, max: 5 })
  };
  return layer;
}

function validateGraphicSystem(value, path) {
  const item = objectValue(value, path);
  return {
    how_graphics_form: stringValue(item.how_graphics_form, `${path}.how_graphics_form`, { maxLength: 300 }),
    brand_fact_mapping: stringValue(item.brand_fact_mapping, `${path}.brand_fact_mapping`, { maxLength: 300 }),
    scale_crop_repeat: stringValue(item.scale_crop_repeat, `${path}.scale_crop_repeat`, { maxLength: 300 }),
    enter_touchpoints: stringValue(item.enter_touchpoints, `${path}.enter_touchpoints`, { maxLength: 300 }),
    must_not_become: stringValue(item.must_not_become, `${path}.must_not_become`, { maxLength: 300 })
  };
}

function validatePhotographyObjectSystem(value, path) {
  const item = objectValue(value, path);
  const ratio = objectValue(item.real_content_ratio, `${path}.real_content_ratio`);
  const realIndustry = numberValue(ratio.real_industry_content_ratio, `${path}.real_content_ratio.real_industry_content_ratio`, { min: 0, max: 1 });
  const branded = numberValue(ratio.branded_graphic_ratio, `${path}.real_content_ratio.branded_graphic_ratio`, { min: 0, max: 1 });
  const info = numberValue(ratio.information_layout_ratio, `${path}.real_content_ratio.information_layout_ratio`, { min: 0, max: 1 });
  if (Math.abs(realIndustry + branded + info - 1) > 0.01) fail(`${path}.real_content_ratio components must sum to 1.0`, `${path}.real_content_ratio`);
  return {
    needs_photography: enumValue(item.needs_photography, PHOTOGRAPHY_REQUIREMENT_MODES, `${path}.needs_photography`),
    real_industry_objects: stringArray(item.real_industry_objects, `${path}.real_industry_objects`, { min: 1 }),
    subject_and_background: stringValue(item.subject_and_background, `${path}.subject_and_background`, { maxLength: 300 }),
    people_product_packaging: stringValue(item.people_product_packaging, `${path}.people_product_packaging`, { maxLength: 300 }),
    graphic_overlay: stringValue(item.graphic_overlay, `${path}.graphic_overlay`, { maxLength: 300 }),
    real_content_ratio: { real_industry_content_ratio: realIndustry, branded_graphic_ratio: branded, information_layout_ratio: info }
  };
}

function validateInformationSystem(value, path) {
  const item = objectValue(value, path);
  return {
    core_brand_info: stringValue(item.core_brand_info, `${path}.core_brand_info`, { maxLength: 300 }),
    capability_product_info: stringValue(item.capability_product_info, `${path}.capability_product_info`, { maxLength: 300 }),
    data_qualification_info: stringValue(item.data_qualification_info, `${path}.data_qualification_info`, { maxLength: 300 }),
    cta_info: stringValue(item.cta_info, `${path}.cta_info`, { maxLength: 300 }),
    information_hierarchy: stringArray(item.information_hierarchy, `${path}.information_hierarchy`, { min: 3 }),
    fabricated_info_prohibited: stringArray(item.fabricated_info_prohibited, `${path}.fabricated_info_prohibited`, { min: 1 })
  };
}

function validateLayoutBehavior(value, path) {
  const item = objectValue(value, path);
  return {
    subject_area: stringValue(item.subject_area, `${path}.subject_area`, { maxLength: 300 }),
    info_area: stringValue(item.info_area, `${path}.info_area`, { maxLength: 300 }),
    brand_area: stringValue(item.brand_area, `${path}.brand_area`, { maxLength: 300 }),
    whitespace_area: stringValue(item.whitespace_area, `${path}.whitespace_area`, { maxLength: 300 }),
    data_note_area: stringValue(item.data_note_area, `${path}.data_note_area`, { maxLength: 300 }),
    multi_size_adaptation: stringValue(item.multi_size_adaptation, `${path}.multi_size_adaptation`, { maxLength: 300 })
  };
}

export function validateCompositionTemplate(value, path, assetIds) {
  const item = objectValue(value, path);
  const reusableAssets = stringArray(item.reusable_assets, `${path}.reusable_assets`, { min: 1 });
  if (assetIds && reusableAssets.some((id) => !assetIds.has(id))) {
    fail(`${path}.reusable_assets references unknown core_reusable_assets: ${reusableAssets.filter((id) => !assetIds.has(id)).join(', ')}`, `${path}.reusable_assets`);
  }
  return {
    template_id: stringValue(item.template_id, `${path}.template_id`),
    touchpoint: enumValue(item.touchpoint, COMPOSITION_TOUCHPOINTS, `${path}.touchpoint`),
    subject_position: stringValue(item.subject_position, `${path}.subject_position`, { maxLength: 200 }),
    information_position: stringValue(item.information_position, `${path}.information_position`, { maxLength: 200 }),
    reusable_assets: reusableAssets,
    image_object_rule: stringValue(item.image_object_rule, `${path}.image_object_rule`, { maxLength: 300 }),
    negative_constraints: stringArray(item.negative_constraints, `${path}.negative_constraints`, { min: 1 })
  };
}

function validateDownstreamConsumerValue(value, path) {
  const item = objectValue(value, path);
  const role = item.consumer_value_role === undefined
    ? undefined
    : enumValue(item.consumer_value_role, CONSUMER_VALUE_ROLES, `${path}.consumer_value_role`);
  const present = item.present === undefined ? undefined : Boolean(item.present);
  // doc section 七 — forbidden: a consumer value that is present but declares
  // role `none` (contradictory). This is a hard schema violation.
  if (present === true && role === 'none') {
    fail(`${path} declares present=true together with consumer_value_role=none (contradictory)`, `${path}.consumer_value_role`);
  }
  return {
    present,
    value_statement: optionalString(item.value_statement),
    visual_expression: optionalString(item.visual_expression),
    touchpoints: stringArray(item.touchpoints, `${path}.touchpoints`, { min: 0 }),
    evidence_ids: stringArray(item.evidence_ids, `${path}.evidence_ids`, { min: 0 }),
    consumer_value_role: role
  };
}

function validateExecutionExample(value, path, assetIds) {
  const item = objectValue(value, path);
  const reusedAssets = stringArray(item.reused_assets, `${path}.reused_assets`, { min: 1 });
  if (assetIds && reusedAssets.some((id) => !assetIds.has(id))) {
    fail(`${path}.reused_assets references unknown core_reusable_assets: ${reusedAssets.filter((id) => !assetIds.has(id)).join(', ')}`, `${path}.reused_assets`);
  }
  return {
    example_id: stringValue(item.example_id, `${path}.example_id`),
    touchpoint_category: enumValue(item.touchpoint_category, EXECUTION_EXAMPLE_CATEGORIES, `${path}.touchpoint_category`),
    subject: stringValue(item.subject, `${path}.subject`, { maxLength: 300 }),
    visual_structure: stringValue(item.visual_structure, `${path}.visual_structure`, { maxLength: 300 }),
    information_position: stringValue(item.information_position, `${path}.information_position`, { maxLength: 300 }),
    reused_assets: reusedAssets,
    industry_recognition_source: stringValue(item.industry_recognition_source, `${path}.industry_recognition_source`, { maxLength: 300 }),
    anti_concept_art_note: stringValue(item.anti_concept_art_note, `${path}.anti_concept_art_note`, { maxLength: 300 }),
    // doc section 10 — optional strengthened execution-example fields.
    touchpoint: optionalString(item.touchpoint),
    audience: optionalString(item.audience),
    communication_goal: optionalString(item.communication_goal),
    hero_subject: optionalString(item.hero_subject),
    hero_subject_position: optionalString(item.hero_subject_position),
    hero_subject_scale: optionalString(item.hero_subject_scale),
    supporting_subjects: optionalString(item.supporting_subjects),
    graphic_overlay: optionalString(item.graphic_overlay),
    industry_content: optionalString(item.industry_content),
    layout_structure: optionalString(item.layout_structure),
    information_zone: validateInformationZone(item.information_zone, `${path}.information_zone`),
    information_hierarchy: optionalString(item.information_hierarchy),
    brand_zone: validateBrandZone(item.brand_zone, `${path}.brand_zone`),
    whitespace_behavior: optionalString(item.whitespace_behavior),
    canvas_ratio: optionalString(item.canvas_ratio),
    photography_ratio: optionalString(item.photography_ratio),
    graphic_ratio: optionalString(item.graphic_ratio),
    information_ratio: optionalString(item.information_ratio),
    responsive_adaptation: optionalString(item.responsive_adaptation),
    brand_specific_detail: optionalString(item.brand_specific_detail),
    anti_concept_art_rule: optionalString(item.anti_concept_art_rule),
    prohibited_content: optionalString(item.prohibited_content),
    downstream_consumer_value: item.downstream_consumer_value === undefined
      ? undefined
      : validateDownstreamConsumerValue(item.downstream_consumer_value, `${path}.downstream_consumer_value`)
  };
}

function validateAntiConceptArtConstraints(value, path) {
  const list = arrayValue(value, path, { min: ANTI_CONCEPT_ART_CONSTRAINT_IDS.length });
  const seen = new Set();
  const result = list.map((raw, index) => {
    const item = objectValue(raw, `${path}[${index}]`);
    const constraintId = enumValue(item.constraint_id, ANTI_CONCEPT_ART_CONSTRAINT_IDS, `${path}[${index}].constraint_id`);
    if (seen.has(constraintId)) fail(`${path} contains a duplicate anti-concept-art constraint: ${constraintId}`, `${path}[${index}].constraint_id`);
    seen.add(constraintId);
    return {
      constraint_id: constraintId,
      rule: stringValue(item.rule, `${path}[${index}].rule`, { maxLength: 200 })
    };
  });
  const missing = ANTI_CONCEPT_ART_CONSTRAINT_IDS.filter((id) => !seen.has(id));
  if (missing.length) fail(`${path} is missing required anti-concept-art constraints: ${missing.join(', ')}`, path);
  return result;
}

const COMPLIANCE_WEIGHT_KEYS = ['compliance_weight', 'supply_chain_weight', 'product_material_weight', 'ecosystem_weight', 'brand_aesthetic_weight', 'consumer_value_weight'];
const INDUSTRY_CLASSIFICATION_KEYS = ['regulatory_objects', 'supply_chain_objects', 'product_material_objects', 'institution_service_objects', 'consumer_value_objects', 'aesthetic_culture_objects'];
const ASSET_AUTHORIZATION_KEYS = ['data_authorization_level', 'document_visualization_mode', 'credential_usage_mode', 'generated_data_policy'];

function resolveFamilyType(letter, explicit) {
  if (explicit !== undefined && DIRECTION_FAMILY_TYPES.includes(explicit)) return explicit;
  if (letter !== undefined && DIRECTION_FAMILY_TYPE_BY_LETTER[letter]) return DIRECTION_FAMILY_TYPE_BY_LETTER[letter];
  return undefined;
}

function validateOptionalComplianceWeights(value, path) {
  const obj = objectValue(value, path);
  const out = {};
  for (const key of COMPLIANCE_WEIGHT_KEYS) {
    out[key] = optionalNumber(obj[key], undefined);
    if (out[key] !== undefined && (out[key] < 0 || out[key] > 1)) fail(`${path}.${key} must be between 0 and 1`, `${path}.${key}`);
  }
  return out;
}

function validateOptionalIndustryClassification(value, path) {
  if (value === undefined || value === null) return undefined;
  const obj = objectValue(value, path);
  const out = {};
  for (const key of INDUSTRY_CLASSIFICATION_KEYS) {
    out[key] = obj[key] === undefined ? undefined : stringArray(obj[key], `${path}.${key}`, { min: 0 });
  }
  return out;
}

function validateOptionalAssetAuthorization(value, path) {
  if (value === undefined || value === null) return undefined;
  const obj = objectValue(value, path);
  return {
    data_authorization_level: obj.data_authorization_level === undefined ? undefined : enumValue(obj.data_authorization_level, ASSET_AUTHORIZATION_MODES, `${path}.data_authorization_level`),
    document_visualization_mode: obj.document_visualization_mode === undefined ? undefined : enumValue(obj.document_visualization_mode, ASSET_AUTHORIZATION_MODES, `${path}.document_visualization_mode`),
    credential_usage_mode: obj.credential_usage_mode === undefined ? undefined : enumValue(obj.credential_usage_mode, ASSET_AUTHORIZATION_MODES, `${path}.credential_usage_mode`),
    generated_data_policy: obj.generated_data_policy === undefined ? undefined : enumValue(obj.generated_data_policy, ASSET_AUTHORIZATION_MODES, `${path}.generated_data_policy`)
  };
}

function validateOptionalSelectionMechanism(value, path) {
  if (value === undefined || value === null) return undefined;
  const obj = objectValue(value, path);
  return {
    selection_dimensions: stringArray(obj.selection_dimensions || [], `${path}.selection_dimensions`, { min: 1 }),
    visual_mapping_rule: stringValue(obj.visual_mapping_rule, `${path}.visual_mapping_rule`, { maxLength: 300 }),
    multi_category_rule: stringValue(obj.multi_category_rule, `${path}.multi_category_rule`, { maxLength: 300 }),
    comparison_behavior: stringValue(obj.comparison_behavior, `${path}.comparison_behavior`, { maxLength: 300 }),
    platform_signature: stringValue(obj.platform_signature, `${path}.platform_signature`, { maxLength: 300 })
  };
}

export function validateExecutionDirectionV2(value, context = {}) {
  const root = objectValue(value?.visualDirectionV2 || value, 'visualDirectionV2');
  const reportLanguage = context.reportLanguage || 'zh-CN';
  const evidenceIds = context.evidenceIds || new Set();
  const allowedAssetIds = context.allowedAssetIds || new Set();
  const restrictedAssetIds = context.restrictedAssetIds || new Set();

  const strategicIdea = stringValue(root.strategic_idea, 'visualDirectionV2.strategic_idea', { maxLength: 80 });
  if (strategicIdea.length < 15) fail('visualDirectionV2.strategic_idea must be at least 15 characters and not a pure slogan', 'visualDirectionV2.strategic_idea');

  const direction = {
    contract_version: VISUAL_DIRECTION_V2_CONTRACT_VERSION,
    direction_id: stringValue(root.direction_id, 'visualDirectionV2.direction_id'),
    direction_name: stringValue(root.direction_name, 'visualDirectionV2.direction_name'),
    strategic_idea: strategicIdea,
    source_opportunity_ids: uniqueStringArray(root.source_opportunity_ids || [], 'visualDirectionV2.source_opportunity_ids'),
    industry_recognition_layer: validateIndustryRecognitionLayer(root.industry_recognition_layer, 'visualDirectionV2.industry_recognition_layer'),
    core_reusable_assets: arrayValue(root.core_reusable_assets, 'visualDirectionV2.core_reusable_assets', { min: 3 })
      .map((item, index) => validateReusableAsset(item, `visualDirectionV2.core_reusable_assets[${index}]`)),
    graphic_system: validateGraphicSystem(root.graphic_system, 'visualDirectionV2.graphic_system'),
    photography_object_system: validatePhotographyObjectSystem(root.photography_object_system, 'visualDirectionV2.photography_object_system'),
    information_system: validateInformationSystem(root.information_system, 'visualDirectionV2.information_system'),
    layout_behavior: validateLayoutBehavior(root.layout_behavior, 'visualDirectionV2.layout_behavior'),
    composition_templates: arrayValue(root.composition_templates, 'visualDirectionV2.composition_templates', { min: 2 })
      .map((item, index) => validateCompositionTemplate(item, `visualDirectionV2.composition_templates[${index}]`)),
    material_and_light_support: objectValue(root.material_and_light_support, 'visualDirectionV2.material_and_light_support'),
    execution_examples: arrayValue(root.execution_examples, 'visualDirectionV2.execution_examples', { min: 3 })
      .map((item, index) => validateExecutionExample(item, `visualDirectionV2.execution_examples[${index}]`)),
    brand_evidence: stringValue(root.brand_evidence, 'visualDirectionV2.brand_evidence', { maxLength: 500 }),
    execution_constraints: stringArray(root.execution_constraints, 'visualDirectionV2.execution_constraints', { min: 1 }),
    anti_concept_art_constraints: validateAntiConceptArtConstraints(root.anti_concept_art_constraints, 'visualDirectionV2.anti_concept_art_constraints'),
    template_risks: stringArray(root.template_risks, 'visualDirectionV2.template_risks', { min: 1 }),
    readiness_score: root.readiness_score === undefined ? null : numberValue(root.readiness_score, 'visualDirectionV2.readiness_score', { min: 0, max: 100 }),
    // doc sections 6/7/8/9 — optional structured fields the specialized-fix gates
    // consume. When absent, the evaluators derive the same signals from free text.
    direction_family: root.direction_family === undefined ? undefined : enumValue(root.direction_family, DIRECTION_FAMILIES, 'visualDirectionV2.direction_family'),
    family_type: resolveFamilyType(root.direction_family, root.family_type),
    compliance_weights: validateOptionalComplianceWeights(root.compliance_weights, 'visualDirectionV2.compliance_weights'),
    industry_recognition_classification: validateOptionalIndustryClassification(root.industry_recognition_classification, 'visualDirectionV2.industry_recognition_classification'),
    asset_authorization: validateOptionalAssetAuthorization(root.asset_authorization, 'visualDirectionV2.asset_authorization'),
    selection_mechanism: validateOptionalSelectionMechanism(root.selection_mechanism, 'visualDirectionV2.selection_mechanism'),
    downstream_consumer_value: root.downstream_consumer_value === undefined
      ? undefined
      : validateDownstreamConsumerValue(root.downstream_consumer_value, 'visualDirectionV2.downstream_consumer_value')
  };

  const assetIds = new Set(direction.core_reusable_assets.map((asset) => asset.asset_id));
  // Re-validate composition/example asset references now that asset ids are known.
  direction.composition_templates = direction.composition_templates.map((template, index) =>
    validateCompositionTemplate(template, `visualDirectionV2.composition_templates[${index}]`, assetIds));
  direction.execution_examples = direction.execution_examples.map((example, index) =>
    validateExecutionExample(example, `visualDirectionV2.execution_examples[${index}]`, assetIds));

  // Required reusable-asset type coverage (doc 5.2).
  const presentTypes = new Set(direction.core_reusable_assets.map((asset) => asset.asset_type));
  const missingTypes = REQUIRED_REUSABLE_ASSET_TYPES.filter((type) => !presentTypes.has(type));
  if (missingTypes.length) fail(`core_reusable_assets must include at least one of each required type; missing: ${missingTypes.join(', ')}`, 'visualDirectionV2.core_reusable_assets');

  // Required execution-example category coverage (doc 5.8).
  const presentCategories = new Set(direction.execution_examples.map((example) => example.touchpoint_category));
  const missingCategories = EXECUTION_EXAMPLE_CATEGORIES.filter((category) => !presentCategories.has(category));
  if (missingCategories.length) fail(`execution_examples must cover core_brand, capability_product and digital_event; missing: ${missingCategories.join(', ')}`, 'visualDirectionV2.execution_examples');

  // evidence_ids must be a known subset of the Evidence Index (preservation guard).
  const evidenceRefs = uniqueStringArray(root.evidence_ids || [], 'visualDirectionV2.evidence_ids');
  if (evidenceIds.size && evidenceRefs.some((id) => !evidenceIds.has(id))) {
    assertKnownReferences(evidenceRefs, evidenceIds, 'visualDirectionV2.evidence_ids', 'Evidence ID');
  }
  direction.evidence_ids = evidenceRefs;

  // asset_references must be allowed and never restricted (asset authorization regression guard).
  const assetRefs = uniqueStringArray(root.asset_references || [], 'visualDirectionV2.asset_references');
  const forbiddenRefs = assetRefs.filter((id) => restrictedAssetIds.has(id));
  if (forbiddenRefs.length) fail(`asset_references contains restricted assets: ${forbiddenRefs.join(', ')}`, 'visualDirectionV2.asset_references');
  if (allowedAssetIds.size && assetRefs.some((id) => !allowedAssetIds.has(id))) {
    assertKnownReferences(assetRefs, allowedAssetIds, 'visualDirectionV2.asset_references', 'Asset ID');
  }
  direction.asset_references = assetRefs;

  // Report-language purity: zh-CN directions must use a Chinese formal name.
  if (reportLanguage === 'zh-CN' && !containsChinese(direction.direction_name)) {
    throw Object.assign(new Error('visualDirectionV2.direction_name must use a Chinese formal name for zh-CN reports'), {
      code: 'REPORT_LANGUAGE_POLLUTION',
      path: 'visualDirectionV2.direction_name'
    });
  }

  return deepFreeze(direction);
}

const ENUM_FIELD_SPECS = Object.freeze([
  { path: 'direction_family', allowed: DIRECTION_FAMILIES, optional: true },
  { path: 'family_type', allowed: DIRECTION_FAMILY_TYPES, optional: true },
  { path: 'photography_object_system.needs_photography', allowed: PHOTOGRAPHY_REQUIREMENT_MODES },
  { path: 'downstream_consumer_value.consumer_value_role', allowed: CONSUMER_VALUE_ROLES, optional: true }
]);

function readPath(value, path) {
  const tokens = [...String(path).matchAll(/(?:^|\.)([^.[\]]+)|\[(\d+)\]/gu)]
    .map((match) => match[1] ?? Number(match[2]));
  return tokens.reduce((current, key) => current?.[key], value);
}

function collectEnumIssue(issues, direction, directionIndex, relativePath, allowed, optional = false) {
  const received = readPath(direction, relativePath);
  if (optional && (received === undefined || received === null)) return;
  if (allowed.includes(received)) return;
  const path = `visualDirectionV2Set.directions[${directionIndex}].${relativePath}`;
  issues.push({
    code: 'FAILED_SCHEMA',
    path,
    expected: [...allowed],
    received,
    message: `${path} must be one of: ${allowed.join(', ')}`
  });
}

function collectRepeatedEnumIssues(issues, direction, directionIndex, collectionName, relativePath, allowed) {
  const collection = direction?.[collectionName];
  if (!Array.isArray(collection)) return;
  collection.forEach((item, itemIndex) => collectEnumIssue(
    issues,
    direction,
    directionIndex,
    `${collectionName}[${itemIndex}].${relativePath}`,
    allowed
  ));
}

function collectConsumerValueContradiction(issues, direction, directionIndex, relativePath) {
  const consumerValue = readPath(direction, relativePath);
  if (consumerValue?.present !== true || consumerValue?.consumer_value_role !== 'none') return;
  const path = `visualDirectionV2Set.directions[${directionIndex}].${relativePath}.consumer_value_role`;
  issues.push({
    code: 'FAILED_SCHEMA',
    path,
    expected: CONSUMER_VALUE_ROLES.filter((role) => role !== 'none'),
    received: 'none',
    message: `${path} cannot be none when present=true`
  });
}

const SELECTION_MECHANISM_STRING_FIELDS = Object.freeze([
  'visual_mapping_rule', 'multi_category_rule', 'comparison_behavior', 'platform_signature'
]);

function collectSelectionMechanismIssues(issues, direction, directionIndex) {
  const mechanism = direction?.selection_mechanism;
  if (mechanism === undefined || mechanism === null) return;
  if (!mechanism || typeof mechanism !== 'object' || Array.isArray(mechanism)) return;
  const base = `visualDirectionV2Set.directions[${directionIndex}].selection_mechanism`;
  if (!Array.isArray(mechanism.selection_dimensions)
    || mechanism.selection_dimensions.length < 1
    || mechanism.selection_dimensions.some((item) => typeof item !== 'string' || !item.trim())) {
    issues.push({
      code: 'FAILED_SCHEMA', path: `${base}.selection_dimensions`, expected: 'non-empty string[]',
      received: mechanism.selection_dimensions,
      message: `${base}.selection_dimensions must contain at least one non-empty string`
    });
  }
  for (const field of SELECTION_MECHANISM_STRING_FIELDS) {
    if (typeof mechanism[field] === 'string' && mechanism[field].trim()) continue;
    issues.push({
      code: 'FAILED_SCHEMA', path: `${base}.${field}`, expected: 'non-empty string',
      received: mechanism[field], message: `${base}.${field} must be a non-empty string`
    });
  }
}

function indexedValidationPath(path, directionIndex) {
  return String(path || 'visualDirectionV2')
    .replace(/^visualDirectionV2(?=\.|$)/u, `visualDirectionV2Set.directions[${directionIndex}]`);
}

// Collect every enum violation across the set before falling back to one
// non-enum schema error per direction. This keeps the single repair call
// bounded while avoiding the old one-error/one-repair structural dead end.
export function collectExecutionDirectionV2ValidationErrors(directions, context = {}) {
  const list = Array.isArray(directions) ? directions : [];
  const issues = [];
  list.forEach((raw, directionIndex) => {
    const direction = raw?.visualDirectionV2 || raw;
    for (const spec of ENUM_FIELD_SPECS) {
      collectEnumIssue(issues, direction, directionIndex, spec.path, spec.allowed, spec.optional);
    }
    collectConsumerValueContradiction(issues, direction, directionIndex, 'downstream_consumer_value');
    collectSelectionMechanismIssues(issues, direction, directionIndex);
    collectRepeatedEnumIssues(issues, direction, directionIndex, 'core_reusable_assets', 'asset_type', REUSABLE_ASSET_TYPES);
    collectRepeatedEnumIssues(issues, direction, directionIndex, 'composition_templates', 'touchpoint', COMPOSITION_TOUCHPOINTS);
    collectRepeatedEnumIssues(issues, direction, directionIndex, 'execution_examples', 'touchpoint_category', EXECUTION_EXAMPLE_CATEGORIES);
    const examples = Array.isArray(direction?.execution_examples) ? direction.execution_examples : [];
    examples.forEach((example, exampleIndex) => {
      const consumerValue = example?.downstream_consumer_value;
      if (consumerValue?.consumer_value_role === undefined) return;
      collectEnumIssue(
        issues,
        direction,
        directionIndex,
        `execution_examples[${exampleIndex}].downstream_consumer_value.consumer_value_role`,
        CONSUMER_VALUE_ROLES
      );
      collectConsumerValueContradiction(
        issues,
        direction,
        directionIndex,
        `execution_examples[${exampleIndex}].downstream_consumer_value`
      );
    });

    try {
      validateExecutionDirectionV2(raw, context);
    } catch (error) {
      const path = indexedValidationPath(error?.path, directionIndex);
      if (!issues.some((issue) => issue.path === path)) {
        issues.push({
          code: error?.code || 'FAILED_SCHEMA',
          path,
          expected: error?.expected,
          received: readPath(direction, path.replace(/^visualDirectionV2Set\.directions\[\d+\]\.?/u, '')),
          message: error?.message || 'Direction schema validation failed'
        });
      }
    }
  });
  // When the formal validator reports a missing/invalid parent object, repairing
  // that parent also resolves its speculative enum children. Keep only the
  // shallowest path so patch application never depends on model-defined order.
  return issues.filter((issue, index) => !issues.some((other, otherIndex) => (
    otherIndex !== index
    && other.path !== issue.path
    && (issue.path.startsWith(`${other.path}.`) || issue.path.startsWith(`${other.path}[`))
  )));
}

export function validateExecutionDirectionV2Set(directions, context = {}) {
  const issues = collectExecutionDirectionV2ValidationErrors(directions, context);
  if (issues.length) {
    throw Object.assign(new Error(`Direction set contains ${issues.length} validation error(s)`), {
      code: issues[0].code || 'FAILED_SCHEMA',
      path: issues[0].path,
      issues
    });
  }
  return directions;
}

export { ANTI_CONCEPT_ART_CONSTRAINT_IDS };
