import { validateBenchmarkQueryPlan } from './schemas.js';

const clean = (values) => [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
const query = (terms, purpose, expected, exclusions, priority = 'medium') => ({
  query: clean(terms).join(' '), purpose, expected_case_type: expected,
  exclusion_terms: clean(exclusions), priority
});

export function compileBenchmarkQueryPlan(visualFacts) {
  const identity = visualFacts.project_identity;
  const offer = visualFacts.offer_structure;
  const audience = visualFacts.audience_structure;
  const positioning = visualFacts.brand_positioning;
  const tags = visualFacts.search_tags;
  const exclusions = clean([...tags.exclusion_tags, ...visualFacts.prohibited_misinterpretations]);
  return validateBenchmarkQueryPlan({
    industry_queries: [query([identity.industry, ...tags.industry_tags, 'visual identity'], '识别同行业的有效视觉代码', 'direct_industry', exclusions, 'high')],
    business_model_queries: [query([identity.business_type, identity.business_model, ...tags.business_model_tags, 'brand identity'], '寻找相同商业模式的连接与交付表达', 'business_model', exclusions, 'high')],
    tone_queries: [query([offer.price_tier, ...positioning.desired_perception, ...positioning.emotional_tone, 'brand system'], '寻找相近价格带与气质的审美机制', 'tone_price', exclusions)],
    touchpoint_queries: [query([...tags.touchpoint_tags, ...audience.primary_customer, 'design system'], '验证关键触点的可执行方式', 'touchpoint', exclusions)],
    anti_template_queries: [query([identity.industry, 'branding cliché template'], '识别行业中过度使用且应规避的模板', 'anti_template', exclusions, 'high')]
  });
}
