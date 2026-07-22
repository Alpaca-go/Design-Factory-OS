import { buildEvidenceBoundValueRegistry } from './evidence-bound-values.js';

const unique = (values) => [...new Set(values.filter(Boolean))];

function businessModelPolicy(type) {
  if (type === 'b2b2c_ecosystem') return { businessModel: 'b2b2c', consumerVisualPolicy: 'auxiliary_only' };
  if (type === 'consumer_product_brand' || type === 'retail_brand') return { businessModel: 'b2c', consumerVisualPolicy: 'core_allowed' };
  return { businessModel: 'b2b', consumerVisualPolicy: 'auxiliary_only' };
}

function roleTouchpoints(facts) {
  const explicit = unique(facts.search_tags.touchpoint_tags || []);
  if (explicit.length) return explicit;
  const type = facts.project_identity.business_type;
  if (['consumer_product_brand', 'professional_product_brand', 'retail_brand', 'manufacturer'].includes(type)) {
    return ['packaging', 'retail_display', 'ecommerce_detail', 'product_poster', 'social_content'];
  }
  if (['platform', 'supply_chain_platform', 'b2b2c_ecosystem', 'distributor'].includes(type)) {
    return ['platform_home', 'capability_deck', 'selection_catalog', 'partner_portal', 'service_flow'];
  }
  if (type === 'service_brand') return ['service_flow', 'service_space', 'booking_delivery_interface', 'service_manual', 'campaign_poster'];
  if (type === 'institution') return ['institution_environment', 'service_wayfinding', 'digital_entry', 'professional_material', 'event_communication'];
  return ['capability_deck', 'digital_entry', 'service_flow'];
}

function factValue(field, facts) {
  const values = {
    brand_name: facts.project_identity.brand_name,
    industry: facts.project_identity.industry,
    business_type: facts.project_identity.business_type,
    brand_role: facts.project_identity.brand_role,
    business_model: facts.project_identity.business_model,
    primary_offer: facts.offer_structure.primary_products_or_services,
    primary_customer: facts.audience_structure.primary_customer,
    final_consumer: facts.audience_structure.final_user_or_beneficiary,
    brand_relationship: facts.brand_relationship,
    core_capabilities: [...facts.business_objects.real_services, ...facts.business_objects.real_processes],
    price_tier: facts.offer_structure.price_tier,
    locked_assets: facts.locked_assets,
    prohibited_misinterpretations: facts.prohibited_misinterpretations
  };
  return values[field] ?? null;
}

function groupFacts(visualFacts) {
  const groups = { confirmed: [], inferred: [], conflicting: [], unknown: [], requires_confirmation: [] };
  for (const record of Object.values(visualFacts.fact_records || {})) {
    groups[record.status].push({ ...record, value: record.value ?? factValue(record.field, visualFacts) });
  }
  return Object.freeze(Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, Object.freeze(value)])));
}

export function adaptVisualFactFirstToStep4({ visualFacts, visualAssetEvidence, benchmarkRetrieval, visualOpportunitySynthesis, selectedTouchpoints }) {
  const factsByStatus = groupFacts(visualFacts);
  const confirmedFields = new Set(factsByStatus.confirmed.map((item) => item.field));
  const confirmed = (field, value, fallback) => confirmedFields.has(field) ? value : fallback;
  const evidenceBoundValues = buildEvidenceBoundValueRegistry(visualFacts);
  const allowedEvidenceBoundValues = evidenceBoundValues.filter((item) => item.allowed_in_visual_direction);
  const rejectedEvidenceBoundValues = evidenceBoundValues.filter((item) => !item.allowed_in_visual_direction);
  const confirmedEvidenceIds = new Set(factsByStatus.confirmed.flatMap((item) => item.evidence_ids));
  const evidence = visualFacts.evidence_registry.map((item, index) => ({
    evidenceId: item.evidence_id || `VF${String(index + 1).padStart(3, '0')}`,
    evidence_id: item.evidence_id || `VF${String(index + 1).padStart(3, '0')}`,
    sourceId: item.source_file, chunkId: item.source_location, type: 'brand_fact',
    statement: item.excerpt, status: confirmedEvidenceIds.has(item.evidence_id) ? 'confirmed' : 'reasonable-inference',
    shortestQuote: item.excerpt, visualImpact: 'visual_fact_first source evidence'
  }));
  const evidenceIds = evidence.map((item) => item.evidenceId);
  const policy = businessModelPolicy(visualFacts.project_identity.business_type);
  const primaryAudience = visualFacts.audience_structure.primary_customer.map((label) => ({ label, evidenceIds: visualFacts.fact_evidence.primary_customer }));
  const assetItems = Object.entries(visualAssetEvidence)
    .filter(([key, value]) => Array.isArray(value) && key !== 'unresolved')
    .flatMap(([group, value]) => value.map((item) => ({ ...item, group })));
  const allowedAssets = assetItems.filter((item) => item.authorization === 'locked' || item.authorization === 'editable').map((item) => item.evidence_id);
  const restrictedAssets = assetItems.filter((item) => !allowedAssets.includes(item.evidence_id)).map((item) => item.evidence_id);
  return Object.freeze({
    brand_identity: {
      brand_name: confirmed('brand_name', visualFacts.project_identity.brand_name, 'unknown'),
      industry: confirmed('industry', visualFacts.project_identity.industry, 'unknown'),
      business_type: confirmed('business_type', visualFacts.project_identity.business_type, 'unknown'),
      brand_role: confirmed('brand_role', visualFacts.project_identity.brand_role, 'unknown'),
      business_model: confirmed('business_model', visualFacts.project_identity.business_model, 'unknown'),
      geographic_scope: visualFacts.project_identity.geographic_scope
    },
    business_model: {
      ...visualFacts.offer_structure,
      primary_products_or_services: confirmed('primary_offer', visualFacts.offer_structure.primary_products_or_services, []),
      price_tier: confirmed('price_tier', visualFacts.offer_structure.price_tier, 'unknown'),
      type: confirmed('business_type', visualFacts.project_identity.business_type, 'unknown'),
      description: confirmed('business_model', visualFacts.project_identity.business_model, 'unknown')
    },
    audience_structure: {
      ...visualFacts.audience_structure,
      primary_customer: confirmed('primary_customer', visualFacts.audience_structure.primary_customer, []),
      final_user_or_beneficiary: confirmed('final_consumer', visualFacts.audience_structure.final_user_or_beneficiary, [])
    },
    visual_positioning: { ...visualFacts.brand_positioning, ...visualFacts.visual_direction_signals },
    locked_assets: confirmed('locked_assets', visualFacts.locked_assets, {
      brand_name_locked: false, logo_locked: false, industry_locked: false,
      business_role_locked: false, packaging_structure_locked: false, other_locked_assets: []
    }),
    visual_asset_evidence: visualAssetEvidence,
    benchmark_findings: benchmarkRetrieval,
    visual_opportunities: visualOpportunitySynthesis,
    fact_status_groups: factsByStatus,
    evidence_bound_values: allowedEvidenceBoundValues,
    rejected_evidence_bound_values: rejectedEvidenceBoundValues,
    brand_relationship: visualFacts.brand_relationship,
    authorization_risks: factsByStatus.requires_confirmation
      .filter((item) => item.field === 'brand_relationship' || /authoriz/iu.test(item.field))
      .map((item) => `“${item.field}”仅可作为风险提示，不得转成 Logo、水印、集团 VI 或视觉主体。`),
    prohibited_directions: unique([...visualFacts.prohibited_misinterpretations, ...visualOpportunitySynthesis.prohibited_shortcuts]),
    evidence_constraints: visualFacts.evidence_constraints,
    evidenceIndex: evidence,
    audienceBoundary: {
      ...policy,
      businessModelEvidenceIds: visualFacts.fact_evidence.business_model,
      primaryAudience,
      excludedAudience: [],
      consumerVisualPolicyEvidenceIds: visualFacts.fact_evidence.business_model
    },
    assetBoundary: { allowed_assets: unique(allowedAssets), restricted_assets: unique(restrictedAssets) },
    selectedTouchpoints: Array.isArray(selectedTouchpoints) && selectedTouchpoints.length ? selectedTouchpoints : roleTouchpoints(visualFacts),
    brandFacts: {
      reportLanguage: /[\u3400-\u9fff]/u.test(visualFacts.project_identity.brand_name) ? 'zh-CN' : 'en',
      brandRelationship: visualFacts.brand_relationship,
      evidenceBoundValues,
      identity: {
        brandName: confirmed('brand_name', visualFacts.project_identity.brand_name, 'unknown'),
        projectName: confirmed('brand_name', visualFacts.project_identity.brand_name, 'unknown'),
        brandRole: confirmed('brand_role', visualFacts.project_identity.brand_role, 'unknown'),
        businessModel: confirmed('business_model', visualFacts.project_identity.business_model, 'unknown'),
        industry: confirmed('industry', visualFacts.project_identity.industry, 'unknown'),
        evidenceIds: factsByStatus.confirmed.flatMap((item) => item.evidence_ids)
      }
    }
  });
}

export function buildCompatibilityEvidenceMap(context) {
  return Object.freeze({
    identity: {
      projectName: context.brandFacts.identity.projectName,
      brandName: context.brandFacts.identity.brandName,
      status: 'confirmed',
      evidenceIds: context.brandFacts.identity.evidenceIds
    },
    evidence: context.evidenceIndex,
    reportLanguage: context.brandFacts.reportLanguage,
    audienceBoundary: context.audienceBoundary,
    conflicts: [], missingInformation: [],
    lockedAssets: Object.entries(context.locked_assets).filter(([, value]) => value === true).map(([key]) => key),
    suggestedAssets: [], executableSuggestedAssets: []
  });
}
