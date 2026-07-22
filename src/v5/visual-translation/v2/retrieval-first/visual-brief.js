const FACT_STATUSES = new Set(['confirmed', 'inferred', 'conflicting', 'unknown', 'requires_confirmation']);

const refsFor = (facts, ids = []) => ids.map((id) => facts.evidence_registry.find((item) => item.evidence_id === id))
  .filter(Boolean)
  .map((item) => Object.freeze({
    source_file: item.source_file,
    source_location: item.source_location,
    excerpt: item.excerpt
  }));

function factValue(facts, field, value, fallbackStatus = 'inferred') {
  const record = facts.fact_records?.[field];
  const evidenceIds = record?.evidence_ids || facts.fact_evidence?.[field] || [];
  const evidence = refsFor(facts, evidenceIds);
  const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
  let status = FACT_STATUSES.has(record?.status) ? record.status : (empty ? 'unknown' : fallbackStatus);
  if (status === 'confirmed' && !evidence.length) status = 'inferred';
  const confidence = evidence.length
    ? Math.min(...evidenceIds.map((id) => facts.evidence_registry.find((item) => item.evidence_id === id)?.confidence || 0))
    : (status === 'unknown' ? 0 : Math.min(Number(facts.confidence?.overall || 0.5), 0.79));
  return Object.freeze({ value: empty ? null : value, status, evidence: Object.freeze(evidence), confidence });
}

export function compileVisualBrief(visualFacts) {
  const facts = visualFacts;
  const relationship = facts.brand_relationship || {};
  return Object.freeze({
    schema_version: 'visual-brief-v1',
    identity: Object.freeze({
      brand_name: factValue(facts, 'brand_name', facts.project_identity.brand_name),
      industry: factValue(facts, 'industry', facts.project_identity.industry),
      business_model: factValue(facts, 'business_model', facts.project_identity.business_model),
      brand_role: factValue(facts, 'brand_role', facts.project_identity.brand_role)
    }),
    offer: Object.freeze({
      products_or_services: factValue(facts, 'primary_offer', facts.offer_structure.primary_products_or_services),
      price_tier: factValue(facts, 'price_tier', facts.offer_structure.price_tier),
      decision_cost: factValue(facts, 'decision_cost', facts.offer_structure.decision_cost)
    }),
    audience: Object.freeze({
      primary_customer: factValue(facts, 'primary_customer', facts.audience_structure.primary_customer),
      secondary_customer: factValue(facts, 'secondary_customer', facts.audience_structure.secondary_customer),
      final_user: factValue(facts, 'final_consumer', facts.audience_structure.final_user_or_beneficiary),
      decision_maker: factValue(facts, 'decision_maker', facts.audience_structure.decision_maker)
    }),
    positioning: Object.freeze({
      core_value: factValue(facts, 'core_capabilities', facts.brand_positioning.core_value),
      differentiation: factValue(facts, 'differentiation', facts.brand_positioning.differentiation),
      desired_perception: factValue(facts, 'desired_perception', facts.brand_positioning.desired_perception),
      desired_tone: factValue(facts, 'desired_tone', facts.brand_positioning.emotional_tone)
    }),
    real_business_objects: Object.freeze({
      products: factValue(facts, 'real_products', facts.business_objects.real_products),
      services: factValue(facts, 'real_services', facts.business_objects.real_services),
      processes: factValue(facts, 'real_processes', facts.business_objects.real_processes),
      scenes: factValue(facts, 'real_scenes', facts.business_objects.real_scenes),
      documents_or_interfaces: factValue(facts, 'real_documents_or_interfaces', facts.business_objects.real_documents_or_interfaces)
    }),
    asset_rules: Object.freeze({
      locked_assets: factValue(facts, 'locked_assets', [
        facts.locked_assets.brand_name_locked ? 'brand_name' : null,
        facts.locked_assets.logo_locked ? 'logo' : null,
        facts.locked_assets.industry_locked ? 'industry' : null,
        facts.locked_assets.business_role_locked ? 'business_role' : null,
        ...facts.locked_assets.other_locked_assets
      ].filter(Boolean)),
      editable_assets: factValue(facts, 'editable_assets', Object.entries(facts.editable_assets).filter(([, editable]) => editable).map(([name]) => name))
    }),
    relationships: Object.freeze({
      group_backing: factValue(facts, 'brand_relationship', relationship.related_brand_name),
      visual_authorization_status: factValue(facts, 'brand_relationship', relationship.visual_authorization || 'not_confirmed')
    }),
    visual_constraints: Object.freeze({
      prohibited_misinterpretations: factValue(facts, 'prohibited_misinterpretations', facts.prohibited_misinterpretations),
      evidence_required_for: factValue(facts, 'specific_business_data', [
        ...facts.evidence_constraints.must_use_source_evidence,
        ...facts.evidence_constraints.cannot_fabricate
      ])
    }),
    search_context: Object.freeze({
      industry_terms: facts.search_tags.industry_tags,
      business_model_terms: facts.search_tags.business_model_tags,
      audience_terms: facts.search_tags.audience_tags,
      tone_terms: facts.search_tags.tone_tags,
      touchpoint_terms: facts.search_tags.touchpoint_tags,
      exclusion_terms: facts.search_tags.exclusion_tags
    }),
    unresolved_questions: Object.freeze([...facts.confidence.unresolved_fields, ...facts.confidence.conflicting_evidence])
  });
}

export function compileVisualBriefMarkdown(brief) {
  const value = (fact) => fact?.value == null ? '未确认' : Array.isArray(fact.value) ? (fact.value.join('、') || '未确认') : String(fact.value);
  return `# Visual Brief\n\n- Schema：${brief.schema_version}\n- 品牌：${value(brief.identity.brand_name)}\n- 行业：${value(brief.identity.industry)}\n- 商业模式：${value(brief.identity.business_model)}\n- 品牌角色：${value(brief.identity.brand_role)}\n- 产品或服务：${value(brief.offer.products_or_services)}\n- 主要客户：${value(brief.audience.primary_customer)}\n- 最终用户：${value(brief.audience.final_user)}\n- Locked Assets：${value(brief.asset_rules.locked_assets)}\n\n## 禁止误读\n${value(brief.visual_constraints.prohibited_misinterpretations)}\n\n## 待确认问题\n${brief.unresolved_questions.map((item) => `- ${item}`).join('\n') || '- 无'}\n`;
}
