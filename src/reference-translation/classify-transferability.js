const PROHIBITED = /logo|标志|品牌名称|品牌字|定制字形|专属字体|ip|角色|吉祥物|独占|原文案|完整构图|主海报|原始轮廓/iu;
const REINTERPRET = /母题|隐喻|行业|产品陈列|叙事|核心图形|主视觉|色彩|配色|包装结构|场景/iu;

export function classifyTransferability(referenceVisualDNA) {
  const result = {
    directlyTransferable: [],
    requiresReinterpretation: [],
    prohibitedToCopy: []
  };
  let sequence = 0;
  for (const [category, rules] of Object.entries(referenceVisualDNA || {})) {
    for (const rule of rules || []) {
      sequence += 1;
      const text = `${rule.name} ${rule.mechanism}`;
      const target = PROHIBITED.test(text) ? 'prohibitedToCopy'
        : REINTERPRET.test(text) ? 'requiresReinterpretation'
          : 'directlyTransferable';
      result[target].push(Object.freeze({
        item_id: `RTI-${String(sequence).padStart(3, '0')}`,
        name: rule.name,
        source_rule: category,
        reason: target === 'directlyTransferable'
          ? '属于可脱离参考品牌身份运行的通用视觉方法。'
          : target === 'requiresReinterpretation'
            ? '其视觉功能可保留，但图形、行业语义或品牌表达必须由当前项目重建。'
            : '包含参考项目高识别度或品牌专属内容，不得进入当前项目执行资产。',
        evidence: rule.evidence,
        confidence: rule.confidence
      }));
    }
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(result).map(([key, items]) => [key, Object.freeze(items)])
  ));
}

