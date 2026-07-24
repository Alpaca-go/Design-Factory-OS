const unique = (values) => [...new Set(values.filter(Boolean).map(String))];

function projectFacts(context = {}) {
  const identity = context.brandIdentity || context.brand_identity || context.project_identity || context.brand || {};
  const facts = [
    identity.brandName || identity.brand_name || identity.name || context.brandName,
    identity.industry || context.industry,
    identity.brandRole || identity.brand_role || context.brandRole,
    context.product || context.primaryProduct || context.primary_offer,
    ...(context.audience || context.primaryAudience || context.targetAudience || []),
    context.pricePositioning || context.price_tier,
    context.businessModel || context.business_model
  ];
  return unique(facts.flat()).join('、') || '当前项目事实尚不完整';
}

function lockedAssets(context = {}) {
  const locked = context.lockedAssets || context.locked_assets || context.brand?.lockedAssets || [];
  if (Array.isArray(locked)) return unique(locked);
  return Object.entries(locked).filter(([, value]) => value === true || typeof value === 'string')
    .map(([key, value]) => typeof value === 'string' ? value : key);
}

export function mapReferenceToProject({ referenceVisualDNA, transferability, projectContext, preference = '' }) {
  const byName = new Map(Object.values(referenceVisualDNA).flat().map((rule) => [rule.name, rule]));
  const condition = projectFacts(projectContext);
  const locked = lockedAssets(projectContext);
  const candidates = [
    ...(transferability.directlyTransferable || []),
    ...(transferability.requiresReinterpretation || [])
  ];
  if (!candidates.length) {
    return Object.freeze([Object.freeze({
      translation_id: 'PTM-001',
      referenceMechanism: '参考视觉证据不足，暂不继承具体形式',
      referenceFunction: '保留参考驱动路径，但避免在证据不足时伪造稳定视觉规律。',
      projectCondition: condition,
      translatedMechanism: `以“${condition}”为唯一语义来源重新构造视觉机制，参考方案仅保留为待补证据。`,
      retainedProperties: ['参考方案作为研究线索'],
      changedProperties: ['全部核心图形', '构图', '色彩', '场景与文案'],
      prohibitedElements: unique([
        '参考 Logo、品牌名称与原项目文案',
        '参考项目完整构图和高识别度组合',
        ...locked.map((asset) => `不得修改当前 Locked Asset：${asset}`)
      ]),
      confidence: 0.2
    })]);
  }
  return Object.freeze(candidates.map((item, index) => {
    const rule = byName.get(item.name);
    const direct = transferability.directlyTransferable.includes(item);
    return Object.freeze({
      translation_id: `PTM-${String(index + 1).padStart(3, '0')}`,
      referenceMechanism: rule?.mechanism || item.name,
      referenceFunction: rule?.function || item.reason,
      projectCondition: condition,
      translatedMechanism: direct
        ? `保留其运行属性，以“${condition}”替换参考内容，并由当前项目信息与触点重新填充。`
        : `保留视觉功能，以“${condition}”重建图形母题、场景和叙事；${preference ? `偏好仅作权重：${preference}` : '不沿用参考品牌表层形式。'}`,
      retainedProperties: direct ? ['秩序关系', '信息功能', '跨触点变化原则'] : ['视觉功能', '节奏关系'],
      changedProperties: direct ? ['品牌内容', '色彩资产', '业务语义'] : ['核心图形', '行业语义', '构图细节', '品牌色'],
      prohibitedElements: unique([
        '参考 Logo、品牌名称与原项目文案',
        '参考项目完整构图和高识别度组合',
        ...locked.map((asset) => `不得修改当前 Locked Asset：${asset}`)
      ]),
      confidence: Math.max(0.2, Math.min(1, Number(item.confidence || 0.6) * (condition.includes('尚不完整') ? 0.75 : 1)))
    });
  }));
}

export function extractLockedAssets(projectContext) {
  return Object.freeze(lockedAssets(projectContext));
}
