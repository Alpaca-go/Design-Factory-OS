import { groundEvidenceQuote } from '../../v1/schemas/visual-evidence-map-v1.js';

const BUSINESS_TYPES = new Set([
  'consumer_product_brand', 'professional_product_brand', 'service_brand', 'retail_brand',
  'institution', 'platform', 'supply_chain_platform', 'b2b2c_ecosystem', 'manufacturer',
  'distributor', 'mixed'
]);
const PRICE_TIERS = new Set(['mass', 'mid', 'mid_premium', 'premium', 'luxury', 'professional_procurement', 'unknown']);
const DECISION_COSTS = new Set(['low', 'medium', 'high', 'very_high']);
const PRIORITIES = new Set(['high', 'medium', 'low']);
const FACT_STATUSES = new Set(['confirmed', 'inferred', 'conflicting', 'unknown', 'requires_confirmation']);
const SOURCE_QUALITIES = new Set(['high', 'medium', 'low', 'unknown']);
const BRAND_RELATIONSHIPS = new Set(['project_brand', 'parent_company', 'group_backing', 'shareholder', 'partner', 'unknown']);
const VISUAL_AUTHORIZATIONS = new Set(['confirmed', 'not_confirmed', 'forbidden', 'not_applicable']);
const ASSET_GROUPS = Object.freeze([
  'logo', 'color', 'typography', 'graphic_assets', 'photography', 'layout',
  'packaging_structure', 'reusable_assets', 'weak_assets', 'replaceable_assets'
]);
const QUERY_GROUPS = Object.freeze([
  'industry_queries', 'business_model_queries', 'tone_queries',
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
  let grounded = { sourceId: sourceFile, chunkId: sourceLocation, shortestQuote: excerpt, repaired: false };
  if (prepared) {
    const source = prepared.sourceDocuments.find((candidate) => candidate.sourceId === sourceFile || candidate.originalFileName === sourceFile);
    if (!source) fail('references an unknown source', path);
    grounded = groundEvidenceQuote({ requestedQuote: excerpt, statement: excerpt, sourceId: source.sourceId, chunkId: sourceLocation }, prepared);
  }
  return {
    evidence_id: item.evidence_id ? string(item.evidence_id, `${path}.evidence_id`, { allowUnknown: true }) : null,
    source_file: grounded.sourceId, source_location: grounded.chunkId, excerpt: grounded.shortestQuote,
    confidence: grounded.repaired ? Math.min(number(item.confidence, `${path}.confidence`), 0.85) : number(item.confidence, `${path}.confidence`),
    evidence_repaired: grounded.repaired
  };
}

function evidenceRefs(value, path, prepared, min = 0) {
  if (!Array.isArray(value) || value.length < min) fail(`must contain at least ${min} evidence reference(s)`, path);
  return value.map((item, index) => validateEvidenceRef(item, `${path}[${index}]`, prepared));
}

const REQUIRED_FACT_FIELDS = Object.freeze([
  'brand_name', 'industry', 'business_type', 'brand_role', 'business_model', 'primary_offer',
  'primary_customer', 'final_consumer', 'brand_relationship', 'core_capabilities', 'price_tier',
  'locked_assets', 'prohibited_misinterpretations', 'specific_business_data', 'qualifications_and_coverage'
]);

function deriveFactRecords(root, registry, factEvidence) {
  const explicit = root.fact_records && typeof root.fact_records === 'object' ? root.fact_records : {};
  const unresolved = new Set((root.confidence?.unresolved_fields || []).map((item) => String(item).toLowerCase()));
  const conflicting = new Set((root.confidence?.conflicting_evidence || []).map((item) => String(item).toLowerCase()));
  return Object.fromEntries(REQUIRED_FACT_FIELDS.map((field) => {
    const item = explicit[field] && typeof explicit[field] === 'object' ? explicit[field] : {};
    const evidenceIds = Array.isArray(item.evidence_ids) ? item.evidence_ids : (factEvidence[field] || []);
    const refs = evidenceIds.filter((id) => registry.some((evidence) => evidence.evidence_id === id));
    const fieldKey = field.toLowerCase();
    let status = item.status;
    if (status === 'confirmed' && (!refs.length || refs.some((id) => registry.find((evidence) => evidence.evidence_id === id)?.confidence < 0.8))) {
      status = refs.length ? 'inferred' : 'requires_confirmation';
    }
    if (!FACT_STATUSES.has(status)) {
      if ([...conflicting].some((value) => value.includes(fieldKey))) status = 'conflicting';
      else if (refs.length) status = refs.every((id) => registry.find((evidence) => evidence.evidence_id === id)?.confidence >= 0.8) ? 'confirmed' : 'inferred';
      else if ([...unresolved].some((value) => value.includes(fieldKey))) status = 'requires_confirmation';
      else status = field === 'brand_relationship' ? 'requires_confirmation' : 'unknown';
    }
    return [field, Object.freeze({
      field,
      status,
      evidence_ids: Object.freeze(refs),
      evidence: Object.freeze(refs.map((id) => registry.find((evidence) => evidence.evidence_id === id)).filter(Boolean)),
      value: item.value ?? null
    })];
  }));
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
  const normalizedFactEvidence = Object.fromEntries(REQUIRED_FACT_FIELDS.map((key) => [key, strings(factEvidence[key] || [], `visualRelevantBrandFacts.fact_evidence.${key}`)]));
  const factRecords = deriveFactRecords(root, registry, normalizedFactEvidence);
  const relationship = root.brand_relationship && typeof root.brand_relationship === 'object' ? root.brand_relationship : {};
  const relationshipEvidenceIds = strings(relationship.evidence_ids || [], 'visualRelevantBrandFacts.brand_relationship.evidence_ids')
    .filter((id) => registry.some((item) => item.evidence_id === id));
  const requestedVisualAuthorization = relationship.visual_authorization || 'not_confirmed';
  const visualAuthorization = requestedVisualAuthorization === 'confirmed' && !relationshipEvidenceIds.length
    ? 'not_confirmed'
    : requestedVisualAuthorization;
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
    fact_evidence: normalizedFactEvidence,
    fact_records: Object.freeze(factRecords),
    brand_relationship: Object.freeze({
      relationship: enumeration(relationship.relationship || 'unknown', BRAND_RELATIONSHIPS, 'visualRelevantBrandFacts.brand_relationship.relationship'),
      related_brand_name: relationship.related_brand_name ? string(relationship.related_brand_name, 'visualRelevantBrandFacts.brand_relationship.related_brand_name', { allowUnknown: true }) : null,
      visual_authorization: enumeration(visualAuthorization, VISUAL_AUTHORIZATIONS, 'visualRelevantBrandFacts.brand_relationship.visual_authorization'),
      evidence_ids: relationshipEvidenceIds
    })
  });
}

export function validateVisualAssetEvidence(value) {
  const root = object(value?.visualAssetEvidence || value, 'visualAssetEvidence');
  const output = { schema_version: 'visual-asset-evidence-v1', unresolved: strings(root.unresolved || [], 'visualAssetEvidence.unresolved') };
  for (const group of ASSET_GROUPS) {
    if (!Array.isArray(root[group])) fail('must be an array', `visualAssetEvidence.${group}`);
    output[group] = root[group].map((raw, index) => {
      const item = object(raw, `visualAssetEvidence.${group}[${index}]`);
      const owner = enumeration(item.owner || 'unknown', new Set(['project_brand', 'parent_group', 'partner_brand', 'third_party', 'unknown']), `visualAssetEvidence.${group}[${index}].owner`);
      const authorization = enumeration(item.authorization, new Set(['locked', 'editable', 'reference_only', 'unknown']), `visualAssetEvidence.${group}[${index}].authorization`);
      const inferredAuthorizationStatus = owner === 'project_brand' && authorization !== 'unknown' ? 'not_required'
        : authorization === 'locked' ? 'confirmed'
          : 'not_confirmed';
      return {
        evidence_id: string(item.evidence_id, `visualAssetEvidence.${group}[${index}].evidence_id`, { allowUnknown: true }),
        source: string(item.source, `visualAssetEvidence.${group}[${index}].source`, { allowUnknown: true }),
        observation: string(item.observation, `visualAssetEvidence.${group}[${index}].observation`, { allowUnknown: true }),
        visual_decision_impact: string(item.visual_decision_impact, `visualAssetEvidence.${group}[${index}].visual_decision_impact`, { allowUnknown: true }),
        confidence: number(item.confidence, `visualAssetEvidence.${group}[${index}].confidence`),
        authorization,
        asset_type: item.asset_type || ({
          logo: 'logo', color: 'color', typography: 'typography', graphic_assets: 'graphic',
          photography: 'photography', packaging_structure: 'packaging'
        }[group] || 'other'),
        owner,
        authorization_status: enumeration(item.authorization_status || inferredAuthorizationStatus, new Set(['confirmed', 'not_confirmed', 'forbidden', 'not_required']), `visualAssetEvidence.${group}[${index}].authorization_status`)
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
  const relevanceScore = number(item.relevance_score, `${path}.relevance_score`);
  return Object.freeze({
    case_id: item.case_id ? string(item.case_id, `${path}.case_id`, { allowUnknown: true }) : `BC${String(index + 1).padStart(3, '0')}`,
    case_name: string(item.case_name, `${path}.case_name`, { allowUnknown: true }),
    title: string(item.title || item.case_name, `${path}.title`, { allowUnknown: true }),
    source_url: string(item.source_url, `${path}.source_url`, { allowUnknown: true }),
    case_type: string(item.case_type, `${path}.case_type`, { allowUnknown: true }),
    category: string(item.category || item.case_type, `${path}.category`, { allowUnknown: true }),
    industry: string(item.industry, `${path}.industry`, { allowUnknown: true }),
    business_model: string(item.business_model, `${path}.business_model`, { allowUnknown: true }),
    relevant_touchpoints: strings(item.relevant_touchpoints, `${path}.relevant_touchpoints`),
    useful_visual_mechanisms: strings(item.useful_visual_mechanisms, `${path}.useful_visual_mechanisms`),
    reusable_mechanisms: strings(item.reusable_mechanisms || item.useful_visual_mechanisms, `${path}.reusable_mechanisms`),
    relevance_reason: item.relevance_reason ? string(item.relevance_reason, `${path}.relevance_reason`, { allowUnknown: true }) : strings(item.visual_strengths || [], `${path}.visual_strengths.fallback`).join('；'),
    non_copyable_elements: strings(item.non_copyable_elements || item.template_risks || [], `${path}.non_copyable_elements`),
    non_transferable_elements: strings(item.non_transferable_elements || item.non_copyable_elements || item.template_risks || [], `${path}.non_transferable_elements`),
    visual_strengths: strings(item.visual_strengths, `${path}.visual_strengths`),
    template_risks: strings(item.template_risks, `${path}.template_risks`),
    relevance_score: relevanceScore,
    source_quality: enumeration(item.source_quality || 'unknown', SOURCE_QUALITIES, `${path}.source_quality`),
    visual_evidence_available: item.visual_evidence_available === undefined ? Boolean(item.evidence_images?.length) : boolean(item.visual_evidence_available, `${path}.visual_evidence_available`),
    business_model_match: item.business_model_match === undefined ? relevanceScore : number(item.business_model_match, `${path}.business_model_match`),
    evidence_images: strings(item.evidence_images || [], `${path}.evidence_images`),
    source_urls: strings(item.source_urls || [item.source_url], `${path}.source_urls`)
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
      const brandEvidence = strings(item.brand_fact_refs || item.brand_evidence_refs || item.brand_evidence || [], `${path}.brand_fact_refs`);
      if (evidenceIds.size && brandEvidence.some((id) => !evidenceIds.has(id))) fail('contains unknown brand evidence', `${path}.brand_evidence`);
      return {
        opportunity_id: string(item.opportunity_id, `${path}.opportunity_id`, { allowUnknown: true }), title: string(item.title, `${path}.title`, { allowUnknown: true }),
        visual_problem: string(item.visual_problem, `${path}.visual_problem`, { allowUnknown: true }), brand_evidence: brandEvidence, brand_evidence_refs: brandEvidence, brand_fact_refs: brandEvidence,
        visual_asset_evidence_refs: strings(item.visual_asset_refs || item.visual_asset_evidence_refs || [], `${path}.visual_asset_refs`),
        visual_asset_refs: strings(item.visual_asset_refs || item.visual_asset_evidence_refs || [], `${path}.visual_asset_refs`),
        benchmark_evidence: strings(item.benchmark_case_refs || item.benchmark_evidence || [], `${path}.benchmark_case_refs`),
        benchmark_case_refs: strings(item.benchmark_case_refs || item.benchmark_evidence || [], `${path}.benchmark_case_refs`),
        anti_template_refs: strings(item.anti_template_refs || conventions.overused_templates || [], `${path}.anti_template_refs`),
        opportunity_statement: string(item.opportunity_statement, `${path}.opportunity_statement`, { allowUnknown: true }),
        visual_protagonist: string(item.visual_protagonist || item.opportunity_statement, `${path}.visual_protagonist`, { allowUnknown: true }),
        generative_mechanism: string(item.generative_mechanism || item.opportunity_statement, `${path}.generative_mechanism`, { allowUnknown: true }),
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
export const VISUAL_FACT_FIRST_REQUIRED_FACT_FIELDS = REQUIRED_FACT_FIELDS;
