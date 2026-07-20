// Shared keyword vocabulary for the v2 specialized-fix evaluators
// (doc: Masterpiece OS v2 执行向视觉方向专项修复开发文档).
//
// Every evaluator that inspects *real model output* (whose structured fields
// may be missing) falls back to lightweight keyword heuristics over the
// direction's free text. The keyword sets live here so the six gate modules
// stay consistent and testable.

export const BUSINESS_MODEL_DIMENSIONS = Object.freeze({
  // 1. 上游品牌 / 产品 / 材料
  upstream: ['上游', '品牌方', '品牌商', '产品', '材料', '厂商', '供应商', '供应链上游', '器械', '成分'],
  // 2. 九州美学平台能力
  platform: ['平台', '中台', '协同', '连接', '生态', 'B2B2C', 'B2B', '赋能', '枢纽'],
  // 3. 医美机构与专业服务
  institution: ['机构', '诊所', '医院', '门店', '服务商', '专业服务', '医师', '医护', '运营'],
  // 4. 消费者安心与美学价值
  consumer: ['消费者', '安心', '用户体验', '美学价值', '信任', '价值', '用户', '终端']
});

export const COMPLIANCE_WEIGHT_KEYWORDS = Object.freeze({
  compliance_weight: ['合规', '资质', '认证', '法规', '批文', '许可', '审核', '单据', '批次', '温控', 'GSP', '标准'],
  supply_chain_weight: ['供应链', '仓储', '物流', '配送', '温控', '节点', '冷链', '分拣'],
  product_material_weight: ['产品', '材料', '器械', '成分', '微观', '精密', '科学', '结构'],
  ecosystem_weight: ['生态', '协同', '平台', '上游', '机构', '连接', 'B2B2C', '网络'],
  brand_aesthetic_weight: ['品牌', '美学', '视觉', '价值', '主张', '辨识', '形象'],
  consumer_value_weight: ['消费者', '安心', '体验', '用户', '信任', '关怀']
});

export const INDUSTRY_RECOGNITION_CATEGORIES = Object.freeze({
  regulatory_objects: ['合规', '资质', '认证', '法规', '批文', '许可', '标准', 'GSP'],
  supply_chain_objects: ['供应链', '仓储', '物流', '配送', '温控', '节点', '冷链', '分拣', '追溯'],
  product_material_objects: ['产品', '材料', '器械', '成分', '微观', '精密', '科学', '结构'],
  institution_service_objects: ['机构', '诊所', '医院', '门店', '服务', '专业', '医师', '运营'],
  consumer_value_objects: ['消费者', '安心', '用户体验', '美学价值', '信任', '用户'],
  aesthetic_culture_objects: ['美学', '文化', '艺术', '品牌价值', '视觉', '审美']
});

// Brand-name detection. Only STRONG brand-indicator suffixes are scanned —
// generic industry words (医美 / 美学 / 机构 / 平台 / 供应链 / 健康 …) are NOT
// brand names and would cause false positives in medical-aesthetics copy. The
// primary, reliable check is the explicit forbidden-brand denylist.
export const BRAND_NAME_SUFFIX = /([一-龥]{2,6})(集团|控股|实业|生物科技|生命科学|药业|大健康|健康科技|文化传媒|品牌管理)/g;

// Forgery / fabricated-data indicators (doc section 9). Matched as substrings.
export const FORGERY_PATTERNS = Object.freeze([
  /注册证号[\s:：]*[A-Za-z0-9]{4,}/,
  /注册证[\s\S]{0,12}(号|编号)[\s:：]*[A-Za-z0-9]{4,}/,
  /批次编码[\s:：]*[A-Za-z0-9]{4,}/,
  /批次号[\s:：]*[A-Za-z0-9]{4,}/,
  /合格率[\s:：]*\d{1,3}(\.\d+)?\s?%/,
  /采购匹配度[\s\S]{0,8}评分[\s:：]*\d/,
  /认证徽章/,
  /官方资质图标/,
  /责任人[\s:：]*[一-龥]{2,4}/,
  /有效期倒计时/,
  /资质编号[\s:：]*[A-Za-z0-9]{4,}/
]);

// Brand-role / strategic-thesis keyword sets used by the identity gate.
export const BRAND_ROLE_KEYWORDS = ['平台', 'B2B', 'B2B2C', '生态', '协同', '供应链', '机构'];
export const STRATEGIC_THESIS_KEYWORDS = ['B2B2C', 'B2B', '供应链', '仓储', '温控', '合规', '上游', '平台', '机构', '消费者', '生态'];

export function countKeywordHits(text, keywords) {
  if (!text) return 0;
  let hits = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) hits += 1;
  }
  return hits;
}
