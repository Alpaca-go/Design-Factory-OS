const FIELD_CONTEXT_RULES = Object.freeze([
  ['layout_ratio', /photography_ratio|graphic_ratio|information_ratio|width_percentage|height_percentage|width_or_height|subject_scale|real_content_ratio|模块.*(?:比例|占比)|(?:摄影|图形|信息|宽度|高度).*占比/iu],
  ['visual_opacity', /opacity|透明度/iu],
  ['canvas_dimension', /canvas_ratio|画布比例|构图比例|multi_size_adaptation|responsive_adaptation/iu],
  ['readiness_score', /structural_readiness|content_readiness|readiness_score|结构完整度|内容就绪度/iu],
  ['critic_score', /critic_score|critic.*score/iu],
  ['identifier', /(?:^|\.)(?:direction_id|example_id|asset_id|template_id|evidence_id)(?:\.|\[|$)/iu],
  ['business_metric', /core_capabilities|industry_data_objects|brand_evidence|capability_info|capability_product_info|business_claims|specific_business_data|coverage|qualification|service_commitment/iu]
]);

const BUSINESS_METRIC_CONTEXT = /覆盖率|市场份额|合作比例|成功率|达成率|区域覆盖|机构覆盖|合格率|业务承诺|履约率|增长率|准确率/iu;
const VISUAL_RATIO_CONTEXT = /摄影|图形|信息区|信息|宽度|高度|透明度|构图|画布|模块|缩放|版式|占比/iu;

export function classifyNumericContext({ fieldPath = '', text = '', rawValue = '' } = {}) {
  if (/℃/u.test(rawValue)) return 'temperature_value';
  if (/(?:分钟|小时|天|工作日)(?:内)?$/u.test(rawValue)) return 'time_value';
  if (/(?:公里|千米|km)$/iu.test(rawValue)) return 'distance_value';
  for (const [context, expression] of FIELD_CONTEXT_RULES) {
    if (expression.test(fieldPath)) return context;
  }
  if (BUSINESS_METRIC_CONTEXT.test(text)) return 'business_metric';
  if (rawValue.includes('%') && VISUAL_RATIO_CONTEXT.test(text)) {
    return /透明度|opacity/iu.test(text) ? 'visual_opacity' : 'layout_ratio';
  }
  return 'unknown';
}

export function numericContextRequiresEvidence(context, fieldPath = '') {
  if (['business_metric', 'temperature_value', 'time_value', 'distance_value'].includes(context)) return true;
  if (context !== 'unknown') return false;
  return FIELD_CONTEXT_RULES.some(([candidate, expression]) => candidate === 'business_metric' && expression.test(fieldPath));
}
