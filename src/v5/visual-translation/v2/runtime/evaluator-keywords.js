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

// ── v2.1.1 (P2): single source of truth for the Fabricated Data Gate ──
// Every evaluator that inspects model output for forged / unverified data
// imports these shared pattern sets so the detection口径 can no longer drift
// between asset-authorization-evaluator.js and evaluator-keywords.js.
//
// Each pattern carries detection_type / rule_id / reason / rewrite so the gate
// output is fully explainable (doc section 七 / 十). risk_level: 'blocked'
// stops execution; 'warning' (field_structure / placeholder_value) is allowed
// but must be flagged.

// Concrete, unverified values (doc section 七 / 十 / 十一).
export const FABRICATION_SPECIFIC_PATTERNS = Object.freeze([
  { re: /注册证号[\s:：]*[A-Za-z0-9]{4,}/, rule_id: 'FABRICATED_DATA_REG_NUMBER', reason: '项目 Evidence 未提供真实注册证编号', rewrite: '改为「注册证结构示意」或脱敏占位', type: 'specific_unverified_value' },
  { re: /注册证[\s\S]{0,12}(号|编号)[\s:：]*[A-Za-z0-9]{4,}/, rule_id: 'FABRICATED_DATA_REG_NUMBER', reason: '项目 Evidence 未提供真实注册证编号', rewrite: '改为「注册证结构示意」或脱敏占位', type: 'specific_unverified_value' },
  { re: /批次编码[\s:：]*[A-Za-z0-9]{4,}/, rule_id: 'FABRICATED_DATA_BATCH_CODE', reason: '项目 Evidence 未提供真实批次编码', rewrite: '改为批次结构示意 / 脱敏占位', type: 'specific_unverified_value' },
  { re: /批次号[\s:：]*[A-Za-z0-9]{4,}/, rule_id: 'FABRICATED_DATA_BATCH_CODE', reason: '项目 Evidence 未提供真实批次编号', rewrite: '改为批次结构示意 / 脱敏占位', type: 'specific_unverified_value' },
  { re: /\b(?:19|20)\d{2}[-_][A-Za-z0-9]{1,5}[-_][A-Za-z0-9]{2,}\b/, rule_id: 'FABRICATED_DATA_BATCH_CODE', reason: '疑似未经 Evidence 支撑的具体批次编号', rewrite: '改为批次结构示意 / 脱敏占位', type: 'specific_unverified_value' },
  { re: /合格率[\s:：]*\d{1,3}(\.\d+)?\s?%/, rule_id: 'FABRICATED_DATA_PASS_RATE', reason: '项目 Evidence 未提供真实合格率数据', rewrite: '改为合格率结构示意', type: 'specific_unverified_value' },
  { re: /资质编号[\s:：]*[A-Za-z0-9]{4,}/, rule_id: 'FABRICATED_DATA_QUALIFICATION_ID', reason: '项目 Evidence 未提供真实资质编号', rewrite: '改为资质结构示意 / 脱敏占位', type: 'specific_unverified_value' },
  { re: /责任人[\s:：]*[一-龥]{2,4}/, rule_id: 'FABRICATED_DATA_PERSON_NAME', reason: '项目 Evidence 未提供真实责任人姓名', rewrite: '改为脱敏字段占位「责任角色」', type: 'specific_unverified_value' },
  { re: /采购匹配度[\s\S]{0,8}评分[\s:：]*\d/, rule_id: 'FABRICATED_DATA_PROCUREMENT_SCORE', reason: '项目 Evidence 未提供真实采购匹配评分', rewrite: '改为评分结构示意', type: 'specific_unverified_value' },
  { re: /有效期倒计时[\s:：]*\d/, rule_id: 'FABRICATED_DATA_EXPIRY_COUNTDOWN', reason: '疑似未经 Evidence 支撑的具体有效期倒计时', rewrite: '改为有效期结构示意', type: 'specific_unverified_value' }
]);

// Forged official credentials / icons (doc section 七 / 十一).
export const FABRICATION_CREDENTIAL_PATTERNS = Object.freeze([
  { re: /认证徽章/, rule_id: 'FABRICATED_DATA_CREDENTIAL_BADGE', reason: '不得伪造官方认证徽章', rewrite: '使用抽象化资质示意，不仿制官方徽章', type: 'official_credential_imitation' },
  { re: /官方资质图标/, rule_id: 'FABRICATED_DATA_CREDENTIAL_ICON', reason: '不得仿制官方资质图标', rewrite: '使用抽象化资质示意，不仿制官方图标', type: 'official_credential_imitation' }
]);

// Generic metric words with a concrete number attached (doc section 十):
// 数 / 指数 / 评分 / 比例 / 覆盖率 / 参数 / 区间 / 排名 / 增长率 / 达标率 /
// 准确率 / 合格率 / 时效 / 容量 / 规模 ...
export const FABRICATION_DATA_METRIC_PATTERNS = Object.freeze([
  { re: /[一-龥]{2,}(?:数|指数|评分|比例|覆盖率|参数|区间|排名|增长率|达标率|准确率|合格率|时效|容量|规模)[\s:：]*\d/, rule_id: 'FABRICATED_DATA_METRIC_VALUE', reason: '项目 Evidence 未提供该具体指标数值', rewrite: '改为指标结构示意 / 占位，并标注 structure_only', type: 'specific_unverified_value' },
  // A bare percentage alone is NOT enough — layout ratios (subject 45% / info
  // 35% / whitespace 20%) are legitimate design proportions, not fabricated
  // metrics. Only a percentage attached to a metric word is blocked.
  { re: /[一-龥]{1,6}(?:率|比例|覆盖率|达标率|准确率|合格率|增长|提升|指数|参数)[\s\S]{0,6}\d{1,3}(\.\d+)?\s?%/, rule_id: 'FABRICATED_DATA_METRIC_PERCENTAGE', reason: '项目 Evidence 未提供该具体百分比指标', rewrite: '改为百分比结构示意 / 占位', type: 'specific_unverified_value' },
  { re: /[一-龥]{2,}(?:入驻|合作|服务|覆盖|合作机构|上游品牌)[\s:：]*\d{2,}\s?(?:家|个|项|家次|家机构)/, rule_id: 'FABRICATED_DATA_COUNT', reason: '项目 Evidence 未提供该具体数量', rewrite: '改为数量结构示意 / 占位', type: 'specific_unverified_value' }
]);

// Unsupported scientific / efficacy claims (doc section 十):
// 安全性提升 30% / 功效提升 X% / 有效率 X% ...
export const FABRICATION_SCIENTIFIC_PATTERNS = Object.freeze([
  { re: /[一-龥]{2,}(?:安全性|功效|有效|吸收|满意|复购|转化)[\s\S]{0,6}(?:提升|提高|达|达至|增长)[\s\S]{0,6}\d{1,3}(\.\d+)?\s?%/, rule_id: 'FABRICATED_DATA_SCIENTIFIC_CLAIM', reason: '不得输出未经 Evidence 支撑的功效/安全性提升百分比', rewrite: '改为「经临床/检测验证」的定性表述或结构示意', type: 'unsupported_scientific_claim' },
  { re: /[一-龥]{2,}(?:提升|提高|达至|增长)[\s\S]{0,6}\d{1,3}(\.\d+)?\s?%/, rule_id: 'FABRICATED_DATA_SCIENTIFIC_CLAIM', reason: '不得输出未经 Evidence 支撑的提升百分比', rewrite: '改为定性表述或结构示意', type: 'unsupported_scientific_claim' }
]);

// Bare field names / placeholders without a concrete value (doc section 十).
// Negative lookaheads ensure we do NOT double-flag a concrete value (those are
// already caught above as blocked).
export const FABRICATION_FIELD_STRUCTURE_PATTERNS = Object.freeze([
  { re: /责任人(?![\s:：]*[一-龥]{2,4})/, rule_id: 'FABRICATED_DATA_FIELD_STRUCTURE', reason: '责任人字段可保留结构，但不得填入真实姓名；标注为 structure_only / placeholder', rewrite: '改为「责任角色」占位', type: 'field_structure' },
  { re: /注册证(?![\s\S]{0,12}(号|编号)[\s:：]*[A-Za-z0-9]{4,})/, rule_id: 'FABRICATED_DATA_FIELD_STRUCTURE', reason: '注册证字段可保留结构 / 占位，不得填具体编号', rewrite: '改为「注册证结构示意」', type: 'field_structure' },
  { re: /证书(?![\s:：]*[A-Za-z0-9]{4,})/, rule_id: 'FABRICATED_DATA_FIELD_STRUCTURE', reason: '证书字段可保留结构 / 占位', rewrite: '改为证书结构示意 / 占位', type: 'field_structure' },
  { re: /[一-龥]{2,}(?:指数|覆盖率|增长率|达标率|准确率|合格率|时效|容量|规模)(?![\s:：]*\d)/, rule_id: 'FABRICATED_DATA_FIELD_STRUCTURE', reason: '该业务指标字段可保留结构 / 占位，不得填具体数值', rewrite: '改为指标结构示意 / 占位（structure_only）', type: 'field_structure' }
]);

export const FABRICATION_PLACEHOLDER_PATTERNS = Object.freeze([
  { re: /(占位|示意|待补充|XXX|xxx|XX|xx|示例)/, rule_id: 'FABRICATED_DATA_PLACEHOLDER', reason: '检测到占位 / 示意标记，可作为 structure_only 字段保留', rewrite: '保留占位标记并标注 structure_only', type: 'placeholder_value' }
]);

export const PERSONAL_DATA_PATTERNS = Object.freeze([
  { re: /责任人[\s:：]*[一-龥]{2,4}/, rule_id: 'FABRICATED_DATA_PERSON_NAME', reason: '项目 Evidence 未提供真实责任人姓名', rewrite: '改为脱敏字段占位「责任角色」', type: 'specific_unverified_value' }
]);

export function countKeywordHits(text, keywords) {
  if (!text) return 0;
  let hits = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) hits += 1;
  }
  return hits;
}
