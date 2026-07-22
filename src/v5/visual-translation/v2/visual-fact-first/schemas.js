const BUSINESS_TYPES = new Set([
  'consumer_product_brand', 'professional_product_brand', 'service_brand', 'retail_brand',
  'institution', 'platform', 'supply_chain_platform', 'b2b2c_ecosystem', 'manufacturer',
  'distributor', 'mixed'
]);
const PRICE_TIERS = new Set(['mass', 'mid', 'mid_premium', 'premium', 'luxury', 'professional_procurement', 'unknown']);
const DECISION_COSTS = new Set(['low', 'medium', 'high', 'very_high']);
const PRIORITIES = new Set(['high', 'medium', 'low']);
const ASSET_GROUPS = Object.freeze([
  'logo', 'color', 'typography', 'graphic_assets', 'photography', 'layout',
  'packaging_structure', 'reusable_assets', 'weak_assets', 'replaceable_assets'
]);
const QUERY_GROUPS = Object.freeze([
  'direct_industry_queries', 'business_model_queries', 'tone_price_queries',
  'touchpoint_queries', 'anti_template_queries'
]);

function fail(message, path) {
  throw Object.assign(new Error(`${path}: ${message}`), { code: 'FAILED_SCHEMA', path });
}
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('must be an object', path);
  return value;
}
function string(value, path, { allowUnknown = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) fail('must be a non-empty string', path);
  if (!allowUnknown && /^(?:unknown|unresolved|requires_user_confirmation)$/iu.test(value.trim())) fail('must be resolved', path);
  return value.trim();
}
function strings(value, path) {
  if (!Array.isArray(value)) fail('must be an array', path);
  return value.map((item, index) => string(item, `${path}[${index}]`, { allowUnknown: true }));
}
function boolean(value, path) {
  if (typeof value !== 'boolean') fail('must be boolean', path);
  return value;
}
function number(value, path, min = 0, max = 1) {
  if (!Number.isFinite(value) || value < min || value > max) fail(`must be between ${min} and ${max}`, path);
  return value;
}
function enumeration(value, allowed, path) {
  const result = string(value, path, { allowUnknown: true });
  if (!allowed.has(result)) fail(`must be one of ${[...allowed].join(', ')}`, path);
  return result;
}

function validateEvidenceRef(value, path, prepared) {
  const item = object(value, path);
  const sourceFile = string(item.source_file, `${path}.source_file`, { allowUnknown: true });
  const sourceLocation = string(item.source_location, `${path}.source_location`, { allowUnknown: true });
  const excerpt = string(item.excerpt, `${path}.excerpt`, { allowUnknown: true });
  if (prepared) {
    const source = prepared.sourceDocuments.find((candidate) => candidate.sourceId === sourceFile || candidate.originalFileName === sourceFile);
    const chunk = prepared.chunks.find((candidate) => candidate.chunkId === sourceLocation || (candidate.sourceId === source?.sourceId && candidate.text.includes(excerpt)));
    if (!source || !chunk || !chunk.text.includes(excerpt)) fail('excerpt is not grounded in the named source', path);
  }
  return {
    evidence_id: item.evidence_id ? string(item.evidence_id, `${path}.evidence_id`, { allowUnknown: true }) : null,
    source_file: sourceFile, source_location: sourceLocation, excerpt,
    confidence: number(item.confidence, `${path}.confidence`)
  };
}

function evidenceRefs(value, path, prepared, min = 0) {
  if (!Array.isArray(value) || value.length < min) fail(`must contain at least ${min} evidence reference(s)`, path);
  return value.map((item, index) => validateEvidenceRef(item, `${path}[${index}]`, prepared));
}

export function validateVisualRelevantBrandFacts(value, prepared) {
  const root = object(value?.visualRelevantBrandFacts || value, 'visualRelevantBrandFacts');
  if (root.schema_version !== 'visual-facts-v1') fail('schema_version must be visual-facts-v1', 'visualRelevantBrandFacts.schema_version');
  const identity = object(root.project_identity, 'visualRelevantBrandFacts.project_identity');
  const offer = object(root.offer_structure, 'visualRelevantBrandFacts.offer_structure');
  const audience = object(root.audience_structure, 'visualRelevantBrandFacts.audience_structure');
  const positioning = object(root.brand_positioning, 'visualRelevantBrandFacts.brand_positioning');
  const signals = object(root.visual_direction_signals, 'visualRelevantBrandFacts.visual_direction_signals');
  const objects = object(root.business_objects, 'visualRelevantBrandFacts.business_objects');
  const locked = object(root.locked_assets, 'visualRelevantBrandFacts.locked_assets');
  const editable = object(root.editable_assets, 'visualRelevantBrandFacts.editable_assets');
  const constraints = object(root.evidence_constraints, 'visualRelevantBrandFacts.evidence_constraints');
  const tags = object(root.search_tags, 'visualRelevantBrandFacts.search_tags');
  const confidence = object(root.confidence, 'visualRelevantBrandFacts.confidence');
  const brandEvidence = evidenceRefs(identity.brand_name_evidence, 'visualRelevantBrandFacts.project_identity.brand_name_evidence', prepared, 1);
  const registry = evidenceRefs(root.evidence_registry || brandEvidence, 'visualRelevantBrandFacts.evidence_registry', prepared, 1)
    .map((item, index) => ({ ...item, evidence_id: item.evidence_id || `VF${String(index + 1).padStart(3, '0')}` }));
  if (new Set(registry.map((item) => item.evidence_id)).size !== registry.length) fail('contains duplicate evidence_id', 'visualRelevantBrandFacts.evidence_registry');
  const factEvidence = object(root.fact_evidence, 'visualRelevantBrandFacts.fact_evidence');
  const requiredEvidenceKeys = ['brand_name', 'industry', 'business_type', 'brand_role', 'business_model', 'primary_offer', 'primary_customer', 'locked_assets'];
  for (const key of requiredEvidenceKeys) {
    const refs = strings(factEvidence[key], `visualRelevantBrandFacts.fact_evidence.${key}`);
    if (!refs.length || refs.some((id) => !registry.some((item) => item.evidence_id === id))) fail('must reference known evidence', `visualRelevantBrandFacts.fact_evidence.${key}`);
  }
  return Object.freeze({
    schema_version: 'visual-facts-v1',
    project_identity: {
      brand_name: string(identity.brand_name, 'visualRelevantBrandFacts.project_identity.brand_name'),
      brand_name_evidence: brandEvidence,
      industry: string(identity.industry, 'visualRelevantBrandFacts.project_identity.industry'),
      business_type: enumeration(identity.business_type, BUSINESS_TYPES, 'visualRelevantBrandFacts.project_identity.business_type'),
      brand_role: string(identity.brand_role, 'visualRelevantBrandFacts.project_identity.brand_role'),
      business_model: string(identity.business_model, 'visualRelevantBrandFacts.project_identity.business_model'),
      geographic_scope: identity.geographic_scope ? string(identity.geographic_scope, 'visualRelevantBrandFacts.project_identity.geographic_scope', { allowUnknown: true }) : 'unknown'
    },
    offer_structure: {
      primary_products_or_services: strings(offer.primary_products_or_services, 'visualRelevantBrandFacts.offer_structure.primary_products_or_services'),
      service_delivery_model: string(offer.service_delivery_model, 'visualRelevantBrandFacts.offer_structure.service_delivery_model', { allowUnknown: true }),
      price_tier: enumeration(offer.price_tier, PRICE_TIERS, 'visualRelevantBrandFacts.offer_structure.price_tier'),
      decision_cost: enumeration(offer.decision_cost, DECISION_COSTS, 'visualRelevantBrandFacts.offer_structure.decision_cost'),
      purchase_context: string(offer.purchase_context, 'visualRelevantBrandFacts.offer_structure.purchase_context', { allowUnknown: true })
    },
    audience_structure: {
      primary_customer: strings(audience.primary_customer, 'visualRelevantBrandFacts.audience_structure.primary_customer'),
      secondary_customer: strings(audience.secondary_customer, 'visualRelevantBrandFacts.audience_structure.secondary_customer'),
      final_user_or_beneficiary: strings(audience.final_user_or_beneficiary, 'visualRelevantBrandFacts.audience_structure.final_user_or_beneficiary'),
      decision_maker: strings(audience.decision_maker, 'visualRelevantBrandFacts.audience_structure.decision_maker'),
      user_relationship: string(audience.user_relationship, 'visualRelevantBrandFacts.audience_structure.user_relationship', { allowUnknown: true })
    },
    brand_positioning: Object.fromEntries(['core_value', 'differentiation', 'desired_perception', 'personality_traits', 'emotional_tone'].map((key) => [key, strings(positioning[key], `visualRelevantBrandFacts.brand_positioning.${key}`)])),
    visual_direction_signals: {
      desired_style: strings(signals.desired_style, 'visualRelevantBrandFacts.visual_direction_signals.desired_style'),
      desired_materiality: strings(signals.desired_materiality, 'visualRelevantBrandFacts.visual_direction_signals.desired_materiality'),
      desired_image_behavior: strings(signals.desired_image_behavior, 'visualRelevantBrandFacts.visual_direction_signals.desired_image_behavior'),
      desired_information_density: string(signals.desired_information_density, 'visualRelevantBrandFacts.visual_direction_signals.desired_information_density', { allowUnknown: true }),
      premium_level: string(signals.premium_level, 'visualRelevantBrandFacts.visual_direction_signals.premium_level', { allowUnknown: true }),
      professional_level: string(signals.professional_level, 'visualRelevantBrandFacts.visual_direction_signals.professional_level', { allowUnknown: true })
    },
    business_objects: Object.fromEntries(['real_products', 'real_services', 'real_processes', 'real_scenes', 'real_documents_or_interfaces'].map((key) => [key, strings(objects[key], `visualRelevantBrandFacts.business_objects.${key}`)])),
    locked_assets: {
      brand_name_locked: boolean(locked.brand_name_locked, 'visualRelevantBrandFacts.locked_assets.brand_name_locked'),
      logo_locked: boolean(locked.logo_locked, 'visualRelevantBrandFacts.locked_assets.logo_locked'),
      industry_locked: boolean(locked.industry_locked, 'visualRelevantBrandFacts.locked_assets.industry_locked'),
      business_role_locked: boolean(locked.business_role_locked, 'visualRelevantBrandFacts.locked_assets.business_role_locked'),
      packaging_structure_locked: locked.packaging_structure_locked === undefined ? false : boolean(locked.packaging_structure_locked, 'visualRelevantBrandFacts.locked_assets.packaging_structure_locked'),
      other_locked_assets: strings(locked.other_locked_assets, 'visualRelevantBrandFacts.locked_assets.other_locked_assets')
    },
    editable_assets: Object.fromEntries(['color_system_editable', 'typography_editable', 'graphic_system_editable', 'photography_editable', 'layout_editable', 'visual_anchor_editable'].map((key) => [key, boolean(editable[key], `visualRelevantBrandFacts.editable_assets.${key}`)])),
    prohibited_misinterpretations: strings(root.prohibited_misinterpretations, 'visualRelevantBrandFacts.prohibited_misinterpretations'),
    evidence_constraints: Object.fromEntries(['must_use_source_evidence', 'cannot_fabricate', 'data_placeholder_allowed'].map((key) => [key, strings(constraints[key], `visualRelevantBrandFacts.evidence_constraints.${key}`)])),
    search_tags: Object.fromEntries(['industry_tags', 'business_model_tags', 'audience_tags', 'tone_tags', 'touchpoint_tags', 'exclusion_tags'].map((key) => [key, strings(tags[key], `visualRelevantBrandFacts.search_tags.${key}`)])),
    confidence: {
      overall: number(confidence.overall, 'visualRelevantBrandFacts.confidence.overall'),
      unresolved_fields: strings(confidence.unresolved_fields, 'visualRelevantBrandFacts.confidence.unresolved_fields'),
      conflicting_evidence: strings(confidence.conflicting_evidence, 'visualRelevantBrandFacts.confidence.conflicting_evidence')
    },
    evidence_registry: registry,
    fact_evidence: Object.fromEntries(Object.entries(factEvidence).map(([key, refs]) => [key, strings(refs, `visualRelevantBrandFacts.fact_evidence.${key}`)]))
  });
}

export function validateVisualAssetEvidence(value) {
  const root = object(value?.visualAssetEvidence || value, 'visualAssetEvidence');
  const output = { schema_version: 'visual-asset-evidence-v1', unresolved: strings(root.unresolved || [], 'visualAssetEvidence.unresolved') };
  for (const group of ASSET_GROUPS) {
    if (!Array.isArray(root[group])) fail('must be an array', `visualAssetEvidence.${group}`);
    output[group] = root[group].map((raw, index) => {
      const item = object(raw, `visualAssetEvidence.${group}[${index}]`);
      return {
        evidence_id: string(item.evidence_id, `visualAssetEvidence.${group}[${index}].evidence_id`, { allowUnknown: true }),
        source: string(item.source, `visualAssetEvidence.${group}[${index}].source`, { allowUnknown: true }),
        observation: string(item.observation, `visualAssetEvidence.${group}[${index}].observation`, { allowUnknown: true }),
        visual_decision_impact: string(item.visual_decision_impact, `visualAssetEvidence.${group}[${index}].visual_decision_impact`, { allowUnknown: true }),
        confidence: number(item.confidence, `visualAssetEvidence.${group}[${index}].confidence`),
        authorization: enumeration(item.authorization, new Set(['locked', 'editable', 'reference_only', 'unknown']), `visualAssetEvidence.${group}[${index}].authorization`)
      };
    });
  }
  return Object.freeze(output);
}

export function validateBenchmarkQueryPlan(value) {
  const root = object(value?.benchmarkQueryPlan || value, 'benchmarkQueryPlan');
  const output = { schema_version: 'benchmark-query-plan-v1' };
  for (const group of QUERY_GROUPS) {
    if (!Array.isArray(root[group]) || !root[group].length) fail('must contain at least one query', `benchmarkQueryPlan.${group}`);
    output[group] = root[group].map((raw, index) => {
      const item = object(raw, `benchmarkQueryPlan.${group}[${index}]`);
      return {
        query: string(item.query, `benchmarkQueryPlan.${group}[${index}].query`, { allowUnknown: true }),
        purpose: string(item.purpose, `benchmarkQueryPlan.${group}[${index}].purpose`, { allowUnknown: true }),
        expected_case_type: string(item.expected_case_type, `benchmarkQueryPlan.${group}[${index}].expected_case_type`, { allowUnknown: true }),
        exclusion_terms: strings(item.exclusion_terms, `benchmarkQueryPlan.${group}[${index}].exclusion_terms`),
        priority: enumeration(item.priority, PRIORITIES, `benchmarkQueryPlan.${group}[${index}].priority`)
      };
    });
  }
  return Object.freeze(output);
}

export function validateBenchmarkCase(value, index = 0) {
  const path = `benchmarkCases[${index}]`;
  const item = object(value, path);
  return Object.freeze({
    case_name: string(item.case_name, `${path}.case_name`, { allowUnknown: true }),
    source_url: string(item.source_url, `${path}.source_url`, { allowUnknown: true }),
    case_type: string(item.case_type, `${path}.case_type`, { allowUnknown: true }),
    industry: string(item.industry, `${path}.industry`, { allowUnknown: true }),
    business_model: string(item.business_model, `${path}.business_model`, { allowUnknown: true }),
    relevant_touchpoints: strings(item.relevant_touchpoints, `${path}.relevant_touchpoints`),
    useful_visual_mechanisms: strings(item.useful_visual_mechanisms, `${path}.useful_visual_mechanisms`),
    visual_strengths: strings(item.visual_strengths, `${path}.visual_strengths`),
    template_risks: strings(item.template_risks, `${path}.template_risks`),
    relevance_score: number(item.relevance_score, `${path}.relevance_score`),
    evidence_images: strings(item.evidence_images || [], `${path}.evidence_images`)
  });
}

export function validateVisualOpportunitySynthesis(value, evidenceIds = new Set()) {
  const root = object(value?.visualOpportunitySynthesis || value, 'visualOpportunitySynthesis');
  const conventions = object(root.category_conventions, 'visualOpportunitySynthesis.category_conventions');
  const position = object(root.brand_existing_position, 'visualOpportunitySynthesis.brand_existing_position');
  const opportunities = root.differentiation_opportunities;
  if (!Array.isArray(opportunities) || opportunities.length < 3) fail('must contain at least three opportunities', 'visualOpportunitySynthesis.differentiation_opportunities');
  return Object.freeze({
    schema_version: 'visual-opportunity-synthesis-v1',
    category_conventions: Object.fromEntries(['commonly_used_visual_language', 'useful_industry_codes', 'overused_templates'].map((key) => [key, strings(conventions[key], `visualOpportunitySynthesis.category_conventions.${key}`)])),
    brand_existing_position: Object.fromEntries(['strengths_to_keep', 'weaknesses_to_fix', 'underused_assets'].map((key) => [key, strings(position[key], `visualOpportunitySynthesis.brand_existing_position.${key}`)])),
    differentiation_opportunities: opportunities.map((raw, index) => {
      const path = `visualOpportunitySynthesis.differentiation_opportunities[${index}]`;
      const item = object(raw, path);
      const brandEvidence = strings(item.brand_evidence, `${path}.brand_evidence`);
      if (evidenceIds.size && brandEvidence.some((id) => !evidenceIds.has(id))) fail('contains unknown brand evidence', `${path}.brand_evidence`);
      return {
        opportunity_id: string(item.opportunity_id, `${path}.opportunity_id`, { allowUnknown: true }), title: string(item.title, `${path}.title`, { allowUnknown: true }),
        visual_problem: string(item.visual_problem, `${path}.visual_problem`, { allowUnknown: true }), brand_evidence: brandEvidence,
        benchmark_evidence: strings(item.benchmark_evidence, `${path}.benchmark_evidence`), opportunity_statement: string(item.opportunity_statement, `${path}.opportunity_statement`, { allowUnknown: true }),
        reusable_asset_potential: strings(item.reusable_asset_potential, `${path}.reusable_asset_potential`), suitable_touchpoints: strings(item.suitable_touchpoints, `${path}.suitable_touchpoints`),
        risks: strings(item.risks, `${path}.risks`), confidence: number(item.confidence, `${path}.confidence`)
      };
    }),
    prohibited_shortcuts: strings(root.prohibited_shortcuts, 'visualOpportunitySynthesis.prohibited_shortcuts'),
    direction_generation_constraints: strings(root.direction_generation_constraints, 'visualOpportunitySynthesis.direction_generation_constraints'),
    recommended_direction_families: Array.isArray(root.recommended_direction_families) ? root.recommended_direction_families.map((item) => object(item, 'visualOpportunitySynthesis.recommended_direction_families[]')) : []
  });
}

export const VISUAL_FACT_FIRST_ASSET_GROUPS = ASSET_GROUPS;
export const VISUAL_FACT_FIRST_QUERY_GROUPS = QUERY_GROUPS;
