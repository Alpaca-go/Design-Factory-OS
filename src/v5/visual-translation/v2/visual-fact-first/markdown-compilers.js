const list = (values) => values?.length ? values.map((item) => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`).join('\n') : '- 未确认';

export function compileVisualFactsMarkdown(facts) {
  return `# Visual-Relevant Brand Facts\n\n- Schema：${facts.schema_version}\n- 品牌：${facts.project_identity.brand_name}\n- 行业：${facts.project_identity.industry}\n- 业务类型：${facts.project_identity.business_type}\n- 品牌角色：${facts.project_identity.brand_role}\n- 商业模式：${facts.project_identity.business_model}\n- 价格层级：${facts.offer_structure.price_tier}\n- 决策成本：${facts.offer_structure.decision_cost}\n\n## 主要客户\n${list(facts.audience_structure.primary_customer)}\n\n## 真实业务对象\n${list(Object.values(facts.business_objects).flat())}\n\n## 禁止误读\n${list(facts.prohibited_misinterpretations)}\n\n## 未解决字段\n${list(facts.confidence.unresolved_fields)}\n`;
}

export function compileVisualAssetEvidenceMarkdown(evidence) {
  const sections = Object.entries(evidence).filter(([key, value]) => Array.isArray(value) && key !== 'unresolved')
    .map(([key, values]) => `## ${key}\n${list(values.map((item) => `${item.observation}（${item.authorization}）`))}`).join('\n\n');
  return `# Visual Asset Evidence\n\n${sections}\n\n## Unresolved\n${list(evidence.unresolved)}\n`;
}

export function compileVisualOpportunityMarkdown(synthesis) {
  const opportunities = synthesis.differentiation_opportunities.map((item) => `## ${item.opportunity_id} · ${item.title}\n\n- 视觉问题：${item.visual_problem}\n- 视觉机会：${item.opportunity_statement}\n- 适用触点：${item.suitable_touchpoints.join('、') || '未确认'}\n- 风险：${item.risks.join('、') || '无'}`).join('\n\n');
  return `# Visual Opportunity Synthesis\n\n## 行业常用视觉语言\n${list(synthesis.category_conventions.commonly_used_visual_language)}\n\n## 过度使用模板\n${list(synthesis.category_conventions.overused_templates)}\n\n${opportunities}\n\n## 方向生成约束\n${list(synthesis.direction_generation_constraints)}\n`;
}
