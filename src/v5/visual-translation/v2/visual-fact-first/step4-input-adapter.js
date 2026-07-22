const unique = (values) => [...new Set(values.filter(Boolean))];

function businessModelPolicy(type) {
  if (type === 'b2b2c_ecosystem') return { businessModel: 'b2b2c', consumerVisualPolicy: 'auxiliary_only' };
  if (type === 'consumer_product_brand' || type === 'retail_brand') return { businessModel: 'b2c', consumerVisualPolicy: 'core_allowed' };
  return { businessModel: 'b2b', consumerVisualPolicy: 'auxiliary_only' };
}

export function adaptVisualFactFirstToStep4({ visualFacts, visualAssetEvidence, benchmarkRetrieval, visualOpportunitySynthesis, selectedTouchpoints }) {
  const evidence = visualFacts.evidence_registry.map((item, index) => ({
    evidenceId: item.evidence_id || `VF${String(index + 1).padStart(3, '0')}`,
    evidence_id: item.evidence_id || `VF${String(index + 1).padStart(3, '0')}`,
    sourceId: item.source_file, chunkId: item.source_location, type: 'brand_fact',
    statement: item.excerpt, status: item.confidence >= 0.8 ? 'confirmed' : 'reasonable-inference',
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
    brand_identity: visualFacts.project_identity,
    business_model: { ...visualFacts.offer_structure, type: visualFacts.project_identity.business_type, description: visualFacts.project_identity.business_model },
    audience_structure: visualFacts.audience_structure,
    visual_positioning: { ...visualFacts.brand_positioning, ...visualFacts.visual_direction_signals },
    locked_assets: visualFacts.locked_assets,
    visual_asset_evidence: visualAssetEvidence,
    benchmark_findings: benchmarkRetrieval,
    visual_opportunities: visualOpportunitySynthesis,
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
    selectedTouchpoints: selectedTouchpoints || visualFacts.search_tags.touchpoint_tags,
    brandFacts: {
      reportLanguage: /[\u3400-\u9fff]/u.test(visualFacts.project_identity.brand_name) ? 'zh-CN' : 'en',
      identity: {
        brandName: visualFacts.project_identity.brand_name,
        projectName: visualFacts.project_identity.brand_name,
        brandRole: visualFacts.project_identity.brand_role,
        businessModel: visualFacts.project_identity.business_model,
        industry: visualFacts.project_identity.industry,
        evidenceIds
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
