export const DEFAULT_INDUSTRY_RULES = Object.freeze({
  version: 'default-v1',
  requiredChecks: [
    '区分文档事实、品牌愿景与模型建议',
    '检查定位、人群、产品能力和使用场景是否互相支持',
    '未提供行业合规依据时标记 missing，不代替专业审查',
    '视觉建议不得套用行业默认风格'
  ],
  imageProhibitions: [
    '不得创造未确认的产品结构、服务流程、人物身份或业务场景',
    '不得伪造正式 Logo、认证、市场数据或准确长文字'
  ]
});
