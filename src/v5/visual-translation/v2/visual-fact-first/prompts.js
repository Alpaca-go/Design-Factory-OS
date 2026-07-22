export const VISUAL_FACTS_PROMPT_VERSION = 'visual-facts-prompt-v1';
export const VISUAL_ASSET_EVIDENCE_PROMPT_VERSION = 'visual-asset-evidence-prompt-v1';
export const VISUAL_OPPORTUNITY_SYNTHESIS_PROMPT_VERSION = 'visual-opportunity-synthesis-prompt-v1';

export function buildVisualFactsPrompt(prepared, lockedFacts = [], lockedAssets = []) {
  return [{ role: 'system', content: `PROTOCOL_STAGE=01-visual-relevant-facts
PROMPT_VERSION=${VISUAL_FACTS_PROMPT_VERSION}

你是视觉事实提取器，不是品牌策划分析器。只提取会改变视觉对象、视觉气质、信息密度、摄影、图形、版式、触点、资产锁定或禁用方向的事实。
不要总结市场规模、增长率、销售预测、宏观趋势或完整竞争格局。不要生成创意方向。不要因行业关键词套用护肤品、实验室、医械、科技节点网络或地产展厅模板。
关键事实必须引用原文 EvidenceRef；excerpt 必须是对应 Chunk 的逐字子串。不确定信息使用 unknown，并加入 confidence.unresolved_fields，不得推测集团 VI 使用权、价格、消费者角色或品牌风格。
fact_evidence 必须为 brand_name、industry、business_type、brand_role、business_model、primary_offer、primary_customer、locked_assets 分别列出 evidence_registry 中的 ID。

Sources: ${JSON.stringify(prepared.sourceDocuments)}
Chunks: ${JSON.stringify(prepared.chunks)}
Locked Facts: ${JSON.stringify(lockedFacts)}
Locked Assets: ${JSON.stringify(lockedAssets)}

只返回 JSON：
{"visualRelevantBrandFacts":{"schema_version":"visual-facts-v1","project_identity":{"brand_name":"string","brand_name_evidence":[{"evidence_id":"VF001","source_file":"sourceId","source_location":"chunkId","excerpt":"原文","confidence":0.9}],"industry":"string","business_type":"consumer_product_brand|professional_product_brand|service_brand|retail_brand|institution|platform|supply_chain_platform|b2b2c_ecosystem|manufacturer|distributor|mixed","brand_role":"string","business_model":"string","geographic_scope":"string|unknown"},"offer_structure":{"primary_products_or_services":["string"],"service_delivery_model":"string|unknown","price_tier":"mass|mid|mid_premium|premium|luxury|professional_procurement|unknown","decision_cost":"low|medium|high|very_high","purchase_context":"string|unknown"},"audience_structure":{"primary_customer":["string"],"secondary_customer":[],"final_user_or_beneficiary":[],"decision_maker":[],"user_relationship":"string|unknown"},"brand_positioning":{"core_value":[],"differentiation":[],"desired_perception":[],"personality_traits":[],"emotional_tone":[]},"visual_direction_signals":{"desired_style":[],"desired_materiality":[],"desired_image_behavior":[],"desired_information_density":"unknown","premium_level":"unknown","professional_level":"unknown"},"business_objects":{"real_products":[],"real_services":[],"real_processes":[],"real_scenes":[],"real_documents_or_interfaces":[]},"locked_assets":{"brand_name_locked":true,"logo_locked":false,"industry_locked":true,"business_role_locked":true,"packaging_structure_locked":false,"other_locked_assets":[]},"editable_assets":{"color_system_editable":true,"typography_editable":true,"graphic_system_editable":true,"photography_editable":true,"layout_editable":true,"visual_anchor_editable":true},"prohibited_misinterpretations":[],"evidence_constraints":{"must_use_source_evidence":[],"cannot_fabricate":[],"data_placeholder_allowed":[]},"search_tags":{"industry_tags":[],"business_model_tags":[],"audience_tags":[],"tone_tags":[],"touchpoint_tags":[],"exclusion_tags":[]},"confidence":{"overall":0.8,"unresolved_fields":[],"conflicting_evidence":[]},"evidence_registry":[{"evidence_id":"VF001","source_file":"sourceId","source_location":"chunkId","excerpt":"原文","confidence":0.9}],"fact_evidence":{"brand_name":["VF001"],"industry":["VF001"],"business_type":["VF001"],"brand_role":["VF001"],"business_model":["VF001"],"primary_offer":["VF001"],"primary_customer":["VF001"],"locked_assets":["VF001"]}}}` }];
}

export function buildVisualAssetEvidencePrompt({ prepared, visualFacts, visualAssetObservations = [] }) {
  return [{ role: 'system', content: `PROTOCOL_STAGE=02-visual-asset-evidence
PROMPT_VERSION=${VISUAL_ASSET_EVIDENCE_PROMPT_VERSION}

只记录来源材料中可观察、可追溯的视觉资产，不重写品牌战略，不分析市场，不生成方向。没有提供可观察证据的类别必须输出空数组，并在 unresolved 中说明；不得根据品牌气质虚构 Logo、色彩、字体、摄影或包装。
authorization 只能是 locked、editable、reference_only、unknown。集团关系不是集团 Logo/VI 授权。

Visual Facts: ${JSON.stringify(visualFacts)}
Document Sources: ${JSON.stringify(prepared.sourceDocuments)}
Explicit Visual Observations: ${JSON.stringify(visualAssetObservations)}

只返回 JSON：
{"visualAssetEvidence":{"logo":[],"color":[],"typography":[],"graphic_assets":[],"photography":[],"layout":[],"packaging_structure":[],"reusable_assets":[],"weak_assets":[],"replaceable_assets":[],"unresolved":["未提供关键视觉图片"]}}
每个非空数组项：{"evidence_id":"VA001","source":"文件或观察 ID","observation":"只写可观察事实","visual_decision_impact":"影响的视觉决策","confidence":0.8,"authorization":"locked|editable|reference_only|unknown"}` }];
}

export function buildVisualOpportunitySynthesisPrompt({ visualFacts, visualAssetEvidence, benchmarkQueryPlan, benchmarkCases }) {
  return [{ role: 'system', content: `PROTOCOL_STAGE=03-visual-opportunity-synthesis
PROMPT_VERSION=${VISUAL_OPPORTUNITY_SYNTHESIS_PROMPT_VERSION}

将视觉事实、现有视觉资产和外部视觉案例编译成视觉机会。不要输出市场报告，不复述行业规模或经营战略。Benchmark 只是视觉参照，品牌事实优先；不得直接模仿案例。
先识别行业常用语言和过度使用模板，再给出至少三个机制不同的视觉空位。每个机会必须说明视觉问题、品牌证据 ID、案例证据 URL、可复用资产、触点、风险和置信度。没有 Benchmark 时 benchmark_evidence 可为空，但不得伪造来源。

Visual Facts: ${JSON.stringify(visualFacts)}
Visual Asset Evidence: ${JSON.stringify(visualAssetEvidence)}
Benchmark Query Plan: ${JSON.stringify(benchmarkQueryPlan)}
Benchmark Cases: ${JSON.stringify(benchmarkCases)}

只返回 JSON：
{"visualOpportunitySynthesis":{"category_conventions":{"commonly_used_visual_language":[],"useful_industry_codes":[],"overused_templates":[]},"brand_existing_position":{"strengths_to_keep":[],"weaknesses_to_fix":[],"underused_assets":[]},"differentiation_opportunities":[{"opportunity_id":"VO01","title":"string","visual_problem":"string","brand_evidence":["VF001"],"benchmark_evidence":[],"opportunity_statement":"string","reusable_asset_potential":[],"suitable_touchpoints":[],"risks":[],"confidence":0.8}],"prohibited_shortcuts":[],"direction_generation_constraints":[],"recommended_direction_families":[{"family":"A","opportunity_id":"VO01","reason":"string"}]}}` }];
}
