import type {
  BetaContentValidation,
  CurrentProjectProfile,
  CurrentProjectVisualSources,
  FlexibleColorSystem,
  FlexibleCompositionSystem,
  ProjectTouchpointInventory,
  ProjectRecord,
  ReconstructionQualityValidation,
  ReferenceStyleProfile,
  ReferenceStyleReconstruction,
  ReferenceFirstStrategy,
  ReferenceStyleRule,
  ReferenceTranslationProfile,
  StyleApplicationPlan,
  VisualAnchor,
  VisualReconstructionDirection
} from '../shared/types.ts';
import {
  assertReferenceFirstStrategy,
  buildReferenceFirstStrategy,
  enforceReferenceFirstDirection
} from './reference-first-reconstruction.ts';

const INCOMPLETE_VALUE = /待确认|待补充|未知|未识别|未命名/iu;
const MARKDOWN_FRAGMENT = /^(?:#{1,6}\s|\|.*\||```|\d+(?:\.\d+)*[.)、]\s)/u;
const ASSET_NUMBER = /\bAsset[-_\s]?\d+\b/iu;
const DESIGN_ADVICE = /(?:\d+(?:\.\d+)?\s*%.*(?:色|背景)|字号|字重|摄影|构图|版式|材质|灯光|渲染|升级|替换|删除|保留|应当|建议|Hierarchy is King|Creative Brief|GPT Execution|Runtime Protocol|竞品)/iu;
const INTERNAL_CONTENT = /GPT Execution Core|Creative Authority|runtime protocol|运行时协议|竞品分析|资产决策|PTM-\d+/iu;
const FIXED_WRAPPER = /通过可重复的节奏、密度和对比关系形成|通过网格、留白与信息区之间的稳定关系组织|将可识别形态抽象为可缩放、裁切和组合的图形语法|通过材质表面、光线方向与影像景深共同形成|通过母版结构与变量替换在不同触点延展/iu;
const PEOPLE_TERMS = /用户|人群|消费者|顾客|客户|客群|上班族|家庭|亲子|年轻|年龄|岁|人群|食客|游客|学生|白领|居民|从业者/iu;
const OFFERING_ADVICE = /需|建议|应|通过|呈现|强调|优先|避免|替代|升级|摄影|色彩|构图|字号|材质|灯光/iu;
const LOW_SPECIFICITY_STACKS = [
  { pattern: /牛头[\s\S]{0,12}脸谱|脸谱[\s\S]{0,12}牛头/iu, terms: ['牛头', '脸谱'] },
  { pattern: /砂锅[\s\S]{0,12}印章|印章[\s\S]{0,12}砂锅/iu, terms: ['砂锅', '印章'] },
  { pattern: /辣椒[\s\S]{0,12}火焰|火焰[\s\S]{0,12}辣椒/iu, terms: ['辣椒', '火焰'] },
  { pattern: /传统纹样[\s\S]{0,12}书法|书法[\s\S]{0,12}传统纹样/iu, terms: ['传统纹样', '书法'] },
  { pattern: /城市地标[\s\S]{0,12}红色徽章|红色徽章[\s\S]{0,12}城市地标/iu, terms: ['城市地标', '红色徽章'] }
];
const PRODUCTION_PARAMETER = /(?:\b\d{2,3}\s*mm\b|\bF\s*\/?\s*\d+(?:\.\d+)?\b|\b\d{4,5}\s*K\b|\b\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?\s*(?:光比)?|\d+(?:\.\d+)?\s*(?:厘米|cm)\b|\d+(?:\.\d+)?\s*%|网格.{0,8}(?:交点|第[一二三四五六七八九十\d]+列))/iu;
const HARD_COLOR_RULE = /(?:必须|统一|固定|不得|禁止|所有|全部)[^，。；\n]{0,16}(?:占比|百分比|纯橙|冷色|背景)|(?:占比|覆盖)[^，。；\n]{0,6}\d+(?:\.\d+)?\s*%/iu;
const NEGATED_FIXED_COMPOSITION = /(?:而非|不是|避免|不得|不要求|不再|无需|不采用|不使用|不锁死|禁止).{0,10}(?:固定|统一).{0,10}(?:构图|母版|中心|留白|标题区)/giu;
const FIXED_COMPOSITION_RULE = /(?:所有|全部|每(?:张|个|类)).{0,16}(?:必须|统一|固定|只能).{0,20}(?:构图|母版|中心|留白|标题区)|(?:固定|统一)(?:使用|采用).{0,12}(?:同一|相同|唯一|固定).{0,8}(?:构图|母版|中心|留白|标题区)|不改变母版构图/iu;

export const REFERENCE_INHERITANCE_WEIGHTS = {
  principle: 1,
  relationship: 0.8,
  surface: 0.35
} as const;

function hasRigidCompositionRule(values: string[]): boolean {
  const normalized = values.join('\n').replace(NEGATED_FIXED_COMPOSITION, '');
  return FIXED_COMPOSITION_RULE.test(normalized);
}

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const clampRules = (rules: ReferenceStyleRule[]) => rules.slice(0, 4);

function cleanLine(line: string): string {
  return line.replace(/^#{1,6}\s*/u, '')
    .replace(/^[-*]\s+/u, '')
    .replace(/\*\*/gu, '')
    .trim();
}

function reportLines(markdown: string): string[] {
  return markdown.split(/\r?\n/u).map(cleanLine).filter((line) => line.length >= 2 && line.length <= 400);
}

function cleanFactValue(value: string): string {
  return value
    .replace(/[（(]\s*基于[^）)]*推断\s*[）)]/giu, '')
    .replace(/[（(]\s*模型推断\s*[）)]/giu, '')
    .replace(/\s*(?:必须|应当|需要)保留.*$/giu, '')
    .replace(/[。；;]+$/u, '')
    .trim();
}

function labeledValues(lines: string[], labels: string, limit = 6): string[] {
  const pattern = new RegExp(`^(?:${labels})\\s*[:：]\\s*(.+)$`, 'iu');
  return unique(lines.flatMap((line) => {
    const captured = line.match(pattern)?.[1];
    if (!captured) return [];
    return captured.split(/[；;、]/u).map(cleanFactValue);
  })).filter((value) => value && !INCOMPLETE_VALUE.test(value)).slice(0, limit);
}

function confirmedOrAnalyzed(candidates: Array<string | undefined>, analyzed = ''): string {
  return candidates.find((value) => value && !INCOMPLETE_VALUE.test(value))?.trim() || analyzed;
}

function inferTouchpoints(markdown: string, assets: string[]): string[] {
  const source = `${markdown}\n${assets.join('\n')}`;
  const catalog: Array<[string, RegExp]> = [
    ['包装', /包装|餐盒|瓶|罐|袋|标签/iu],
    ['海报', /海报|campaign|主视觉/iu],
    ['VI 应用', /VI|手提袋|菜单|贴纸|工作服|周边/iu],
    ['空间与门店', /空间|门店|导视|招牌|陈列/iu],
    ['数字与社交媒体', /网站|小程序|社交媒体|电商|数字端/iu]
  ];
  return catalog.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

function buildVisualSourcesFromReport(
  lines: string[],
  coreProducts: string[],
  brandName: string,
  usageScenarios: string[]
): CurrentProjectVisualSources {
  return {
    productForms: unique([
      ...labeledValues(lines, '产品形态|产品外形|内容物|核心视觉对象'),
      ...coreProducts
    ]),
    cookingActions: labeledValues(lines, '制作动作|烹饪动作|生产动作|服务动作|使用动作'),
    sensorySignals: labeledValues(lines, '感官信号|感官体验|温度感|触感|气味|声音'),
    consumptionActions: unique([
      ...labeledValues(lines, '消费动作|使用行为|互动动作'),
      ...usageScenarios
    ]),
    brandNameSemantics: labeledValues(lines, '品牌名称语义|品牌名语义|命名语义').length
      ? labeledValues(lines, '品牌名称语义|品牌名语义|命名语义')
      : [brandName],
    spatialObjects: labeledValues(lines, '空间物件|场景物件|空间对象|真实物件')
  };
}

function buildTouchpointInventory(
  lines: string[],
  packagingStructures: string[],
  businessTouchpoints: string[]
): ProjectTouchpointInventory {
  const combined = unique([...businessTouchpoints, ...packagingStructures]);
  const matching = (pattern: RegExp) => combined.filter((item) => pattern.test(item));
  return {
    primaryPackaging: unique([
      ...packagingStructures.filter((item) => !/调料|湿巾|筷子|纸巾/iu.test(item)),
      ...labeledValues(lines, '主包装|一级包装')
    ]),
    secondaryPackaging: unique([
      ...matching(/调料包|湿巾包装|辅助包装|二级包装/iu),
      ...labeledValues(lines, '辅助包装|二级包装')
    ]),
    serviceMaterials: unique([
      ...matching(/筷子套|纸巾|餐具|服务物料/iu),
      ...labeledValues(lines, '服务物料')
    ]),
    viApplications: unique([
      ...matching(/工作服|菜单|桌牌|工牌|VI|贴纸|手提袋/iu),
      ...labeledValues(lines, 'VI 应用|品牌应用')
    ]),
    spatialTouchpoints: unique([
      ...matching(/招牌|墙面|导视|空间|门店|灯箱/iu),
      ...labeledValues(lines, '空间触点|门店触点')
    ]),
    digitalTouchpoints: unique([
      ...matching(/社交媒体|平台头图|数字|网站|小程序|电商/iu),
      ...labeledValues(lines, '数字触点|线上触点')
    ])
  };
}

const SERVICE_MATERIAL = /筷子套|纸巾|餐具包|服务物料/iu;
const SECONDARY_PACKAGING = /调料|佐料|湿巾.{0,4}包装|辅助包装|二级包装/iu;
const VI_APPLICATION = /工作服|工牌|菜单|桌牌|宣传海报|海报|贴纸/iu;

export function normalizeProjectTouchpointClassification(input: {
  packagingStructures: string[];
  touchpointInventory: ProjectTouchpointInventory;
}): {
  packagingStructures: string[];
  touchpointInventory: ProjectTouchpointInventory;
} {
  const inventory = input.touchpointInventory;
  const candidates = unique([
    ...input.packagingStructures,
    ...inventory.primaryPackaging,
    ...inventory.secondaryPackaging,
    ...inventory.serviceMaterials,
    ...inventory.viApplications
  ]);
  const serviceMaterials = unique([
    ...inventory.serviceMaterials,
    ...candidates.filter((item) => SERVICE_MATERIAL.test(item))
  ]);
  const viApplications = unique([
    ...inventory.viApplications,
    ...candidates.filter((item) => VI_APPLICATION.test(item))
  ]);
  const secondaryPackaging = unique([
    ...inventory.secondaryPackaging,
    ...candidates.filter((item) => SECONDARY_PACKAGING.test(item))
  ]).filter((item) => !SERVICE_MATERIAL.test(item) && !VI_APPLICATION.test(item));
  const primaryPackaging = unique(inventory.primaryPackaging)
    .filter((item) => !SERVICE_MATERIAL.test(item)
      && !SECONDARY_PACKAGING.test(item)
      && !VI_APPLICATION.test(item));
  const packagingStructures = unique([
    ...input.packagingStructures,
    ...primaryPackaging,
    ...secondaryPackaging
  ]).filter((item) => !SERVICE_MATERIAL.test(item) && !VI_APPLICATION.test(item));
  return {
    packagingStructures,
    touchpointInventory: {
      primaryPackaging,
      secondaryPackaging,
      serviceMaterials,
      viApplications,
      spatialTouchpoints: unique(inventory.spatialTouchpoints),
      digitalTouchpoints: unique(inventory.digitalTouchpoints)
    }
  };
}

export interface ProjectProfileValidation {
  coreProductsContainOnlyOfferings: boolean;
  targetAudienceContainsOnlyPeople: boolean;
  noDesignAdviceInFacts: boolean;
  noMarkdownFragments: boolean;
  noAssetNumbers: boolean;
  noReferenceBrandTerms: boolean;
  packagingAndTouchpointsSeparated: boolean;
  invalidPackagingTouchpoints: string[];
  requiredFieldsComplete: boolean;
  passed: boolean;
  issues: string[];
}

export function validateCurrentProjectProfile(
  profile: CurrentProjectProfile,
  referenceIdentityTerms: string[] = []
): ProjectProfileValidation {
  const facts = [
    ...profile.coreProducts,
    ...profile.targetAudience,
    profile.brandPositioning,
    profile.pricePositioning || '',
    ...profile.usageScenarios,
    ...profile.businessTouchpoints,
    ...profile.packagingStructures,
    ...Object.values(profile.visualSources || {}).flat(),
    ...Object.values(profile.touchpointInventory || {}).flat(),
    ...profile.confirmedFacts
  ].filter(Boolean);
  const packagingFacts = [
    ...profile.packagingStructures,
    ...(profile.touchpointInventory?.primaryPackaging || []),
    ...(profile.touchpointInventory?.secondaryPackaging || [])
  ];
  const invalidPackagingTouchpoints = packagingFacts.filter((value) =>
    SERVICE_MATERIAL.test(value) || VI_APPLICATION.test(value));
  const validation = {
    coreProductsContainOnlyOfferings: profile.coreProducts.length > 0
      && profile.coreProducts.every((value) => !OFFERING_ADVICE.test(value)),
    targetAudienceContainsOnlyPeople: profile.targetAudience.length > 0
      && profile.targetAudience.every((value) => PEOPLE_TERMS.test(value) && !DESIGN_ADVICE.test(value)),
    noDesignAdviceInFacts: facts.every((value) => !DESIGN_ADVICE.test(value)),
    noMarkdownFragments: facts.every((value) => !MARKDOWN_FRAGMENT.test(value) && !value.includes('|')),
    noAssetNumbers: facts.every((value) => !ASSET_NUMBER.test(value)),
    noReferenceBrandTerms: referenceIdentityTerms.every((term) =>
      term.trim().length < 2 || facts.every((value) => !value.includes(term.trim()))),
    packagingAndTouchpointsSeparated: invalidPackagingTouchpoints.length === 0,
    invalidPackagingTouchpoints,
    requiredFieldsComplete: Boolean(
      profile.brandName && !INCOMPLETE_VALUE.test(profile.brandName)
      && profile.industry && !INCOMPLETE_VALUE.test(profile.industry)
      && profile.coreProducts.length
      && profile.targetAudience.length
      && profile.businessTouchpoints.length
      && profile.lockedAssets.length
      && Object.values(profile.visualSources || {}).filter((values) => values.length > 0).length >= 2
    )
  };
  const issues = Object.entries(validation)
    .filter(([key, passed]) => key !== 'invalidPackagingTouchpoints' && !passed)
    .map(([key]) => key);
  return { ...validation, passed: issues.length === 0, issues };
}

export function assertCurrentProjectProfile(
  profile: CurrentProjectProfile,
  referenceIdentityTerms: string[] = []
): CurrentProjectProfile {
  const validation = validateCurrentProjectProfile(profile, referenceIdentityTerms);
  if (validation.passed) return profile;
  const missing: string[] = [];
  if (!profile.brandName || INCOMPLETE_VALUE.test(profile.brandName)) missing.push('品牌名称');
  if (!profile.industry || INCOMPLETE_VALUE.test(profile.industry)) missing.push('行业');
  if (!profile.coreProducts.length) missing.push('核心产品或服务');
  if (!profile.targetAudience.length) missing.push('目标人群');
  if (!profile.businessTouchpoints.length) missing.push('业务触点');
  if (!profile.lockedAssets.length) missing.push('Locked Assets');
  if (Object.values(profile.visualSources || {}).filter((values) => values.length > 0).length < 2) {
    missing.push('当前项目视觉来源');
  }
  const message = missing.length
    ? `当前项目资料不足，无法生成可靠的视觉重构文档。请先补充：${missing.join('、')}。`
    : `当前项目事实含有设计建议、Markdown、资产编号或非事实内容：${validation.issues.join('、')}`;
  throw Object.assign(new Error(message), {
    code: missing.length ? 'CURRENT_PROJECT_CONTEXT_INCOMPLETE' : 'CURRENT_PROJECT_PROFILE_CONTAMINATED',
    validation,
    details: validation.packagingAndTouchpointsSeparated
      ? undefined
      : { packagingAndTouchpointsSeparated: validation.invalidPackagingTouchpoints },
    missingFields: missing
  });
}

/** Legacy/local fallback. Formal user flow uses the dedicated multimodal Current Project Facts step. */
export function buildCurrentProjectProfile(project: ProjectRecord, analysisMarkdown: string): CurrentProjectProfile {
  const lines = reportLines(analysisMarkdown);
  const assets = (project.assets || []).map((asset) => asset.originalName);
  const coreProducts = labeledValues(lines, '核心产品(?:或服务)?|产品与服务|主营产品|主营服务');
  const usageScenarios = labeledValues(lines, '消费场景|使用场景|业务场景');
  const businessTouchpoints = labeledValues(lines, '业务触点|品牌触点|应用触点').length
    ? labeledValues(lines, '业务触点|品牌触点|应用触点')
    : inferTouchpoints(analysisMarkdown, assets);
  const packagingStructures = labeledValues(lines, '包装结构|包装盒型|产品结构');
  const brandName = confirmedOrAnalyzed(
    [project.brandName, project.detectedBrandName],
    labeledValues(lines, '品牌名称|品牌名|品牌', 1)[0]
  );
  const classifiedTouchpoints = normalizeProjectTouchpointClassification({
    packagingStructures,
    touchpointInventory: buildTouchpointInventory(lines, packagingStructures, businessTouchpoints)
  });
  const profile: CurrentProjectProfile = {
    schemaVersion: 'current-project-profile-v3',
    projectId: project.id,
    projectName: project.projectName,
    brandName,
    industry: confirmedOrAnalyzed(
      [project.industry, project.detectedIndustry],
      labeledValues(lines, '所属行业|行业定位|行业|所属品类|核心品类|品类|赛道', 1)[0]
    ),
    coreProducts,
    targetAudience: labeledValues(lines, '目标用户|目标人群|核心客群|主要客群|受众'),
    pricePositioning: labeledValues(lines, '价格带|价格定位|客单价', 1)[0],
    brandPositioning: labeledValues(lines, '品牌定位|价值主张|品牌角色', 1)[0] || '',
    usageScenarios,
    businessTouchpoints,
    packagingStructures: classifiedTouchpoints.packagingStructures,
    visualSources: buildVisualSourcesFromReport(lines, coreProducts, brandName, usageScenarios),
    touchpointInventory: classifiedTouchpoints.touchpointInventory,
    lockedAssets: unique([
      ...(project.logoLocked ? ['当前项目原始 Logo'] : []),
      ...(project.logoFiles || []),
      ...(project.lockedFacts || [])
    ]),
    confirmedFacts: unique(project.lockedFacts || []),
    sourceArtifactIds: unique([
      `project:${project.id}`,
      ...(project.lastReportFilename ? [`analysis:${project.lastReportFilename}`] : [])
    ]),
    currentVisualAssets: assets,
    existingBrandCopy: labeledValues(lines, '品牌文案|Slogan|口号|宣传语')
  };
  return assertCurrentProjectProfile(profile);
}

function cleanStyleText(value: string, identityTerms: string[]): string {
  let result = cleanLine(String(value || ''))
    .replace(FIXED_WRAPPER, '')
    .replace(/^["“”']+|["“”']+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  for (const term of identityTerms.filter((item) => item.trim().length >= 2)) {
    result = result.replaceAll(term.trim(), '');
  }
  return result.replace(/\s+/gu, ' ').trim();
}

function legacyRules(
  rules: ReferenceTranslationProfile['referenceVisualDNA'][string] = [],
  identityTerms: string[] = []
): ReferenceStyleRule[] {
  return clampRules(rules.flatMap((item) => {
    const rule = cleanStyleText(item.mechanism, identityTerms);
    const designEffect = cleanStyleText(item.function, identityTerms);
    if (!rule || INTERNAL_CONTENT.test(rule) || ASSET_NUMBER.test(rule) || rule.includes('|')) return [];
    return [{
      rule: /[。！？.!?]$/u.test(rule) ? rule : `${rule}。`,
      evidence: item.evidence.map((value) => cleanStyleText(value, identityTerms)).filter(Boolean),
      designEffect,
      confidence: item.confidence
    }];
  }));
}

function recastRules(rules: ReferenceStyleRule[], subject: string): ReferenceStyleRule[] {
  return rules.map((item) => ({
    ...item,
    rule: `${subject}${item.rule.replace(/[。！？.!?]+$/u, '')}。`
  }));
}

export function validateReferenceStyleProfile(
  profile: ReferenceStyleProfile,
  referenceIdentityTerms: string[] = []
): ReferenceStyleProfile {
  const categories: ReferenceStyleRule[][] = [
    profile.overallTemperament,
    profile.colorSystem,
    profile.compositionSystem,
    profile.graphicLanguage,
    profile.typographySystem,
    profile.materialSystem,
    profile.lightingSystem,
    profile.photographySystem,
    profile.packagingPresentation,
    profile.posterPresentation,
    profile.viExtensionSystem
  ];
  const allRules = categories.flat();
  const completeSentences = allRules.every((item) =>
    item.rule.length >= 10 && /[。！？.!?]$/u.test(item.rule));
  const materialLightingPhotographyDistinct = new Set([
    profile.materialSystem.map((item) => item.rule).join('\n'),
    profile.lightingSystem.map((item) => item.rule).join('\n'),
    profile.photographySystem.map((item) => item.rule).join('\n')
  ]).size === 3;
  const pollution = allRules.filter((item) => {
    const text = `${item.rule}\n${item.designEffect}`;
    return INTERNAL_CONTENT.test(text)
      || FIXED_WRAPPER.test(text)
      || ASSET_NUMBER.test(text)
      || text.includes('|')
      || MARKDOWN_FRAGMENT.test(text)
      || referenceIdentityTerms.some((term) => term.length >= 2 && text.includes(term));
  });
  const invalidSize = categories.some((items) => items.length < 1 || items.length > 4);
  if (!allRules.length || invalidSize || pollution.length || !completeSentences || !materialLightingPhotographyDistinct) {
    throw Object.assign(new Error('参考风格 Profile 不完整或含品牌、模板、资产编号等污染内容'), {
      code: 'REFERENCE_STYLE_PROFILE_CONTAMINATED',
      pollution,
      invalidSize,
      completeSentences,
      materialLightingPhotographyDistinct
    });
  }
  return profile;
}

/** Compatibility builder for developer-provided legacy intermediate results. */
export function buildReferenceStyleProfile(
  profile: ReferenceTranslationProfile,
  identityTerms: string[] = []
): ReferenceStyleProfile {
  const dna = profile.referenceVisualDNA;
  const temperament = legacyRules(dna.visualTemperament, identityTerms);
  const material = legacyRules(dna.materialAndLighting, identityTerms);
  const extension = legacyRules(dna.extensionMechanism, identityTerms);
  return {
    schemaVersion: 'reference-style-profile-v3',
    overallTemperament: temperament,
    colorSystem: legacyRules(dna.colorLogic, identityTerms),
    compositionSystem: legacyRules(dna.compositionRules, identityTerms),
    graphicLanguage: legacyRules(dna.graphicGrammar, identityTerms),
    typographySystem: legacyRules(dna.typographyLogic, identityTerms),
    materialSystem: recastRules(material, '材质表面'),
    lightingSystem: recastRules(material, '光线与影调'),
    photographySystem: recastRules(material, '摄影与景深'),
    packagingPresentation: recastRules(extension, '包装展示'),
    posterPresentation: recastRules(extension, '海报组织'),
    viExtensionSystem: recastRules(extension, 'VI 延展'),
    portfolioPresentation: recastRules(extension, '作品集呈现'),
    excludedIdentityTerms: unique(identityTerms),
    sourceAssetIds: unique(Object.values(dna).flatMap((items) => items.flatMap((item) => item.evidence)))
  };
}

function styleSentences(profile: ReferenceStyleProfile): string[] {
  return unique([
    ...profile.overallTemperament,
    ...profile.colorSystem,
    ...profile.compositionSystem,
    ...profile.graphicLanguage,
    ...profile.typographySystem,
    ...profile.materialSystem,
    ...profile.lightingSystem,
    ...profile.photographySystem
  ].map((item) => item.rule));
}

function requiredStyleCategoriesPresent(profile: ReferenceStyleProfile): boolean {
  return [
    profile.overallTemperament,
    profile.colorSystem,
    profile.compositionSystem,
    profile.graphicLanguage,
    profile.typographySystem,
    profile.materialSystem,
    profile.lightingSystem,
    profile.photographySystem,
    profile.packagingPresentation,
    profile.posterPresentation,
    profile.viExtensionSystem
  ].every((items) => items.length >= 1 && items.length <= 4);
}

function productMotif(product: string): string {
  return product.split(/[、，,；;\s]/u).filter(Boolean)[0]?.slice(0, 6) || '核心产品';
}

function currentSourceElements(current: CurrentProjectProfile): string[] {
  const sources = current.visualSources || {
    productForms: current.coreProducts,
    cookingActions: [],
    sensorySignals: [],
    consumptionActions: current.usageScenarios,
    brandNameSemantics: [current.brandName],
    spatialObjects: []
  };
  return unique([
    sources.productForms[0] || current.coreProducts[0] || '',
    sources.cookingActions[0]
      || sources.consumptionActions[0]
      || sources.sensorySignals[0]
      || sources.brandNameSemantics[0]
      || current.usageScenarios[0]
      || current.brandName
  ]).slice(0, 4);
}

function fallbackAnchor(current: CurrentProjectProfile): VisualAnchor {
  const product = current.coreProducts[0] || '核心产品';
  const sourceElements = currentSourceElements(current);
  return {
    name: `${productMotif(product)}起势`,
    sourceElements,
    transformationLogic: `将${sourceElements.join('与')}提炼为连续、可裁切的流动路径。`,
    visualForm: `以 ${product} 的真实形态为主体，让连续路径连接主体边缘、动作方向与稳定信息区。`,
    extensionTouchpoints: ['包装', '海报', 'VI 应用'],
    referenceSurfaceSimilarityRisk: 'low'
  };
}

function fallbackFlexibleColorSystem(style: ReferenceStyleProfile): FlexibleColorSystem {
  return {
    identityColorRole: '当前项目品牌暖色只承担识别重点，不要求所有画面大面积满铺。',
    backgroundOptions: ['包装可选暖米白或浅中性色背景。', '海报可按食欲、活动和主体对比需要调整暖色面积。'],
    textAndStructureColors: ['深褐、炭黑或当前品牌确认的深色用于文字与结构。'],
    accentOptions: ['允许极少量冷中性色平衡材质和空间层次。'],
    saturationGuideline: '以暖色识别和中性色缓冲的关系为主，避免无依据的固定色彩比例。',
    touchpointVariations: [
      '包装优先保证产品信息与运输场景中的清晰识别。',
      '海报可扩大情绪色面积，但不得压过食物或产品主体。',
      'VI 与空间按尺寸、距离和材质调整背景与强调色。'
    ]
  };
}

function fallbackFlexibleCompositionSystem(): FlexibleCompositionSystem {
  return {
    fixedPrinciples: [
      '产品或服务始终为第一视觉主体。',
      '品牌名称和品类信息保持明确层级。',
      '辅助图形不得压过主体，画面至少保留一个稳定信息区。'
    ],
    allowedVariations: [
      'Anchor Image 可采用居中强主体，产品海报可使用偏心构图。',
      '系列画面可通过近景、俯拍、局部裁切和留白位置形成变化。',
      '包装按真实结构调整 Logo 与产品信息位置。'
    ],
    seriesConsistencyRules: ['以主体优先、信息层级和锚点路径维持系列一致，不锁死单一母版。'],
    prohibitedLayouts: ['所有内容挤满画面', '标题覆盖产品主体', '辅助纹样大面积抢占焦点']
  };
}

/** Deterministic compatibility fallback. Formal user flow uses the independent model decision step. */
export function generateVisualReconstructionDirection(
  current: CurrentProjectProfile,
  style: ReferenceStyleProfile
): VisualReconstructionDirection {
  const product = current.coreProducts[0] || '核心产品';
  const motif = productMotif(product);
  const composition = style.compositionSystem.map((item) => item.rule);
  const color = style.colorSystem.map((item) => item.rule);
  const material = style.materialSystem.map((item) => item.rule);
  const photography = style.photographySystem.map((item) => item.rule);
  const visualAnchorDefinition = fallbackAnchor(current);
  const flexibleColorSystem = fallbackFlexibleColorSystem(style);
  const flexibleCompositionSystem = fallbackFlexibleCompositionSystem();
  return {
    directionName: `${motif}成景`,
    coreProposition: `以 ${current.brandName} 的 ${product} 为绝对主体，在 ${current.usageScenarios[0] || '真实消费场景'} 中建立清晰、可延展的视觉识别。`,
    visualAnchor: `${visualAnchorDefinition.transformationLogic}${visualAnchorDefinition.visualForm}`,
    visualAnchorDefinition,
    executionDetailLevel: 'gpt_visual',
    referenceInheritance: [
      { level: 'principle', weight: REFERENCE_INHERITANCE_WEIGHTS.principle, rule: '继承清晰信息层级与跨触点统一原则。' },
      { level: 'relationship', weight: REFERENCE_INHERITANCE_WEIGHTS.relationship, rule: '继承主体、留白、暖色与中性色之间的视觉关系。' },
      { level: 'surface', weight: REFERENCE_INHERITANCE_WEIGHTS.surface, rule: '具体颜色、字体、徽章和材质组合仅作弱参考，不完整复制。' }
    ],
    currentProjectIdentityToRetain: unique([current.brandName, current.industry, ...current.coreProducts, ...current.lockedAssets]),
    currentVisualElementsToRedesign: ['未锁定的色彩比例与背景', '构图网格与信息层级', '辅助图形、材质、灯光与摄影表现'],
    flexibleCompositionSystem,
    compositionSystem: [
      ...flexibleCompositionSystem.fixedPrinciples,
      ...flexibleCompositionSystem.allowedVariations,
      ...flexibleCompositionSystem.seriesConsistencyRules,
      ...flexibleCompositionSystem.prohibitedLayouts.map((item) => `禁止：${item}`)
    ],
    graphicSystem: [`辅助图形只取自 ${product} 的轮廓、动作与真实场景，不复用参考项目专属符号。`],
    flexibleColorSystem,
    colorSystem: [
      flexibleColorSystem.identityColorRole,
      ...flexibleColorSystem.backgroundOptions,
      ...flexibleColorSystem.textAndStructureColors,
      ...flexibleColorSystem.accentOptions,
      flexibleColorSystem.saturationGuideline,
      ...flexibleColorSystem.touchpointVariations
    ],
    typographySystem: style.typographySystem.map((item) => item.rule),
    materialSystem: material,
    lightingSystem: style.lightingSystem.map((item) =>
      `光线以当前项目主体为中心设置明确方向、柔和过渡与受控阴影，形成${item.designEffect || '清晰层次'}。`),
    photographySystem: style.photographySystem.map((item) =>
      `摄影以 ${product} 的真实近景为主体，使用浅景深、柔化背景和自然高光，形成${item.designEffect || '真实质感'}。`),
    touchpointRules: {
      packaging: [
        `包装以 ${product} 为正面摄影主体，背景按结构与信息清晰度选择，品牌色只承担识别重点。`,
        'Logo 保持固定安全区，产品名、规格和说明形成三级信息层级。',
        '辅助图形位于主体与信息区之间，包装材质和工艺服从真实结构。',
        '渲染使用柔和侧光，系列仅改变受控色块、产品摄影与规格信息。'
      ],
      poster: [
        `海报以 ${product} 近景为主体，占据主要视觉区域并保留标题区和呼吸留白。`,
        '可使用近景、俯拍或局部裁切，背景和侧逆暖光服务食欲与主体层次。',
        '系列海报通过产品、标题、景别与局部图形路径形成变化，同时保持锚点语言一致。'
      ],
      vi: [
        '菜单、工作服、桌牌与数字模板共享信息层级和锚点语言，并按尺寸选择不同母版与色彩面积。',
        'Logo 始终遵守安全区，辅助图形按触点尺寸裁切。',
        '不同触点可调整布局、背景和信息密度，但保持品牌名称、品类信息和锚点的识别关系。'
      ],
      space: ['门店招牌、导视、灯箱与陈列延续同一品牌色、材质和图形路径，并服务真实消费动线。']
    },
    prohibitedActions: unique([
      ...style.excludedIdentityTerms.map((term) => `不得复制参考身份：${term}`),
      ...current.lockedAssets.map((asset) => `不得修改 Locked Asset：${asset}`),
      '不得带入参考项目的品牌、产品、行业语义、文案、包装结构或完整构图'
    ])
  };
}

type RequiredTouchpoint = 'packaging' | 'poster' | 'vi';

interface TouchpointRequirement {
  minimumRules: number;
  concepts: Array<{ label: string; pattern: RegExp }>;
}

const TOUCHPOINT_REQUIREMENTS: Record<RequiredTouchpoint, TouchpointRequirement> = {
  packaging: {
    minimumRules: 4,
    concepts: [
      { label: '背景或底色', pattern: /背景|底色|基底/iu },
      { label: '品牌识别色', pattern: /品牌色|识别色|主色|辅助色/iu },
      { label: 'Logo 或品牌标志', pattern: /Logo|标志|品牌标识/iu },
      { label: '产品影像', pattern: /摄影|影像|实拍|产品主体|产品近景/iu },
      { label: '信息层级', pattern: /信息|产品名|品名|规格|层级/iu },
      { label: '包装材质', pattern: /材质|纸|容器|膜|玻璃|金属|塑料/iu },
      { label: '制作工艺', pattern: /工艺|压凹|烫印|烫金|印刷|覆膜|压纹/iu },
      { label: '光影', pattern: /光|影|照明/iu },
      { label: '系列变化', pattern: /系列|变量|款式|口味|SKU|延展/iu }
    ]
  },
  poster: {
    minimumRules: 3,
    concepts: [
      { label: '产品主体', pattern: /主体|产品|食物|人物/iu },
      { label: '标题', pattern: /标题|主文案|主信息/iu },
      { label: '留白', pattern: /留白|呼吸|空白/iu },
      { label: '镜头或景别', pattern: /镜头|景别|近景|特写|俯视|平视|视角/iu },
      { label: '背景', pattern: /背景|底色|环境/iu },
      { label: '光影', pattern: /光|影|照明/iu },
      { label: '辅助图形', pattern: /图形|路径|曲线|纹样|线条/iu },
      { label: '系列变化', pattern: /系列|变化|变量|延展|版本/iu }
    ]
  },
  vi: {
    minimumRules: 3,
    concepts: [
      { label: '母版或网格', pattern: /母版|网格|版式系统|布局系统|模板/iu },
      { label: '色彩系统', pattern: /色彩|颜色|品牌色|主色|辅助色|暖米白/iu },
      { label: '图形系统', pattern: /图形|路径|曲线|纹样|线条/iu },
      { label: 'Logo 或品牌标志', pattern: /Logo|标志|品牌标识/iu },
      { label: '安全区', pattern: /安全区|保护区|留空距离|最小间距/iu },
      { label: '信息层级', pattern: /信息|层级|字号|标题|正文/iu },
      { label: '触点变量', pattern: /触点|变量|替换|延展|应用场景|载体/iu }
    ]
  }
};

export function inspectVisualDirectionExecutability(
  direction: VisualReconstructionDirection,
  current: CurrentProjectProfile
): {
  checks: Record<string, boolean>;
  missing: Partial<Record<RequiredTouchpoint, string[]>>;
} {
  const executable = sentenceList(direction).join('\n');
  const productMentioned = current.coreProducts.some((item) => executable.includes(item));
  const missing = Object.fromEntries(
    (Object.keys(TOUCHPOINT_REQUIREMENTS) as RequiredTouchpoint[]).map((touchpoint) => {
      const text = direction.touchpointRules[touchpoint].join('\n');
      return [
        touchpoint,
        TOUCHPOINT_REQUIREMENTS[touchpoint].concepts
          .filter(({ pattern }) => !pattern.test(text))
          .map(({ label }) => label)
      ];
    })
  ) as Record<RequiredTouchpoint, string[]>;
  const checks = {
    specificName: Boolean(direction.directionName && !/参考风格重构|视觉重构|方案[一二三ABC]?$/iu.test(direction.directionName)),
    projectSpecific: direction.coreProposition.includes(current.brandName) && productMentioned,
    drawableAnchor: direction.visualAnchor.length >= 30 && /轮廓|动作|曲线|主体|摄影|形态|路径|切片|热气|纹理|结构/iu.test(direction.visualAnchor),
    concreteGraphic: direction.graphicSystem.some((item) => /轮廓|动作|曲线|路径|形态|纹理|切片|蒸汽|热气|结构/iu.test(item)),
    concreteColor: direction.colorSystem.some((item) => /色|明度|饱和|冷|暖|黑|白|灰|面积|对比/iu.test(item)),
    concreteImage: [...direction.materialSystem, ...direction.lightingSystem, ...direction.photographySystem]
      .some((item) => /材质|纸|木|金属|哑光|高光|光|镜头|景别|摄影|景深|渲染/iu.test(item)),
    noTemplateLanguage: !/以当前项目内容替换参考内容|保留其运行属性|采用该面积关系|后续重新填充/iu.test(executable),
    packagingSpecific: direction.touchpointRules.packaging.length >= TOUCHPOINT_REQUIREMENTS.packaging.minimumRules
      && missing.packaging.length === 0,
    posterSpecific: direction.touchpointRules.poster.length >= TOUCHPOINT_REQUIREMENTS.poster.minimumRules
      && missing.poster.length === 0,
    viSpecific: direction.touchpointRules.vi.length >= TOUCHPOINT_REQUIREMENTS.vi.minimumRules
      && missing.vi.length === 0,
    ...validateBetaContentCorrection(direction, current)
  };
  return { checks, missing };
}

export function completeVisualDirectionTouchpoints(
  direction: VisualReconstructionDirection,
  current: CurrentProjectProfile,
  style: ReferenceStyleProfile
): VisualReconstructionDirection {
  const fallback = generateVisualReconstructionDirection(current, style);
  const visualAnchorDefinition = direction.visualAnchorDefinition?.sourceElements?.length
    ? direction.visualAnchorDefinition
    : fallback.visualAnchorDefinition;
  const flexibleColorSystem = direction.flexibleColorSystem?.identityColorRole
    ? direction.flexibleColorSystem
    : fallback.flexibleColorSystem;
  const flexibleCompositionSystem = direction.flexibleCompositionSystem?.fixedPrinciples?.length
    ? direction.flexibleCompositionSystem
    : fallback.flexibleCompositionSystem;
  const touchpointRules = {
    ...direction.touchpointRules,
    space: direction.touchpointRules.space || []
  };
  for (const touchpoint of Object.keys(TOUCHPOINT_REQUIREMENTS) as RequiredTouchpoint[]) {
    const rules = unique(touchpointRules[touchpoint]);
    const requirement = TOUCHPOINT_REQUIREMENTS[touchpoint];
    const isComplete = () => {
      const text = rules.join('\n');
      return rules.length >= requirement.minimumRules
        && requirement.concepts.every(({ pattern }) => pattern.test(text));
    };
    for (const fallbackRule of fallback.touchpointRules[touchpoint]) {
      if (isComplete()) break;
      if (!rules.includes(fallbackRule)) rules.push(fallbackRule);
    }
    touchpointRules[touchpoint] = rules;
  }
  return normalizeDirectionForGptVisual({
    ...direction,
    visualAnchor: direction.visualAnchor || fallback.visualAnchor,
    visualAnchorDefinition,
    executionDetailLevel: 'gpt_visual',
    referenceInheritance: direction.referenceInheritance?.length
      ? direction.referenceInheritance
      : fallback.referenceInheritance,
    flexibleColorSystem,
    flexibleCompositionSystem,
    compositionSystem: direction.compositionSystem.length
      ? direction.compositionSystem
      : fallback.compositionSystem,
    colorSystem: direction.colorSystem.length ? direction.colorSystem : fallback.colorSystem,
    touchpointRules
  });
}

export function normalizeGptVisualRule(value: string): string {
  return value
    .replace(/\b\d{2,3}\s*mm(?:\s*(?:微距)?镜头)?/giu, '近距离特写')
    .replace(/\bF\s*\/?\s*\d+(?:\.\d+)?\b/giu, '浅景深')
    .replace(/\b\d{4,5}\s*K\b/giu, '暖光')
    .replace(/\b\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?\s*光比/giu, '受控明暗层次')
    .replace(/\d+(?:\.\d+)?\s*(?:厘米|cm)/giu, '清晰安全区')
    .replace(/\d+(?:\.\d+)?\s*%/giu, '按触点调整')
    .replace(/(?:十二|十|九|八|七|六|五|四|三|二|\d+)\s*列网格.{0,10}(?:交点|第[一二三四五六七八九十\d]+列)/giu, '稳定信息区')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

export function normalizeDirectionForGptVisual(
  direction: VisualReconstructionDirection
): VisualReconstructionDirection {
  const rules = (values: string[]) => unique(values.map(normalizeGptVisualRule));
  const anchor = direction.visualAnchorDefinition;
  return {
    ...direction,
    visualAnchor: normalizeGptVisualRule(direction.visualAnchor),
    visualAnchorDefinition: {
      ...anchor,
      transformationLogic: normalizeGptVisualRule(anchor.transformationLogic),
      visualForm: normalizeGptVisualRule(anchor.visualForm)
    },
    compositionSystem: rules(direction.compositionSystem),
    graphicSystem: rules(direction.graphicSystem),
    colorSystem: rules(direction.colorSystem),
    typographySystem: rules(direction.typographySystem),
    materialSystem: rules(direction.materialSystem),
    lightingSystem: rules(direction.lightingSystem),
    photographySystem: rules(direction.photographySystem),
    flexibleColorSystem: {
      ...direction.flexibleColorSystem,
      identityColorRole: normalizeGptVisualRule(direction.flexibleColorSystem.identityColorRole),
      backgroundOptions: rules(direction.flexibleColorSystem.backgroundOptions),
      textAndStructureColors: rules(direction.flexibleColorSystem.textAndStructureColors),
      accentOptions: rules(direction.flexibleColorSystem.accentOptions),
      saturationGuideline: normalizeGptVisualRule(direction.flexibleColorSystem.saturationGuideline),
      touchpointVariations: rules(direction.flexibleColorSystem.touchpointVariations)
    },
    flexibleCompositionSystem: {
      fixedPrinciples: rules(direction.flexibleCompositionSystem.fixedPrinciples),
      allowedVariations: rules(direction.flexibleCompositionSystem.allowedVariations),
      seriesConsistencyRules: rules(direction.flexibleCompositionSystem.seriesConsistencyRules),
      prohibitedLayouts: rules(direction.flexibleCompositionSystem.prohibitedLayouts)
    },
    touchpointRules: {
      packaging: rules(direction.touchpointRules.packaging),
      poster: rules(direction.touchpointRules.poster),
      vi: rules(direction.touchpointRules.vi),
      space: rules(direction.touchpointRules.space || [])
    }
  };
}

function sentenceList(direction: VisualReconstructionDirection): string[] {
  return [
    direction.coreProposition,
    direction.visualAnchor,
    ...direction.compositionSystem,
    ...direction.graphicSystem,
    ...direction.colorSystem,
    ...direction.typographySystem,
    ...direction.materialSystem,
    ...direction.lightingSystem,
    ...direction.photographySystem,
    ...direction.touchpointRules.packaging,
    ...direction.touchpointRules.poster,
    ...direction.touchpointRules.vi,
    ...(direction.touchpointRules.space || [])
  ].map((value) => value.trim()).filter(Boolean);
}

export function validateBetaContentCorrection(
  direction: VisualReconstructionDirection,
  current: CurrentProjectProfile
): BetaContentValidation {
  const executable = sentenceList(direction).join('\n');
  const currentSourceEntries = (
    Object.entries(current.visualSources || {}) as Array<[keyof CurrentProjectVisualSources, string[]]>
  ).flatMap(([category, values]) => values.map((item) => ({ category, value: item.trim() })));
  const anchorSources = direction.visualAnchorDefinition?.sourceElements || [];
  const matchedAnchorSources = anchorSources.flatMap((item) => {
    const match = currentSourceEntries.find(({ value }) =>
      value === item || value.includes(item) || item.includes(value));
    return match ? [{ source: item, category: match.category }] : [];
  });
  const matchedSourceCategories = new Set(matchedAnchorSources.map((item) => item.category));
  const inventory = current.touchpointInventory;
  const packagingInventory = inventory
    ? [...current.packagingStructures, ...inventory.primaryPackaging, ...inventory.secondaryPackaging]
    : current.packagingStructures;
  const packagingIsClean = packagingInventory.every((item) =>
    !SERVICE_MATERIAL.test(item) && !VI_APPLICATION.test(item));
  const distinct = (() => {
    try {
      validateOutputDuplication(direction);
      return true;
    } catch {
      return false;
    }
  })();
  const directionNameLength = [...direction.directionName].length;
  const validation: BetaContentValidation = {
    visualAnchorUsesCurrentProjectSources: anchorSources.length >= 2
      && matchedAnchorSources.length >= 2
      && matchedSourceCategories.size >= 2
      && direction.visualAnchorDefinition.extensionTouchpoints.length >= 3,
    noGenericTraditionalSymbolStacking: !LOW_SPECIFICITY_STACKS.some(({ pattern, terms }) =>
      pattern.test(executable)
      && !terms.every((term) => current.lockedAssets.some((asset) => asset.includes(term)))),
    noSurfaceStyleOverCopying: direction.referenceInheritance.some((item) =>
      item.level === 'principle' && item.weight === REFERENCE_INHERITANCE_WEIGHTS.principle)
      && direction.referenceInheritance.some((item) =>
        item.level === 'relationship' && item.weight === REFERENCE_INHERITANCE_WEIGHTS.relationship)
      && direction.referenceInheritance.filter((item) => item.level === 'surface')
        .some((item) => item.weight <= REFERENCE_INHERITANCE_WEIGHTS.surface)
      && direction.visualAnchorDefinition.referenceSurfaceSimilarityRisk !== 'high',
    colorRulesAreFlexible: Boolean(
      direction.flexibleColorSystem.identityColorRole
      && direction.flexibleColorSystem.backgroundOptions.length
      && direction.flexibleColorSystem.touchpointVariations.length >= 2
      && !HARD_COLOR_RULE.test(direction.colorSystem.join('\n'))
    ),
    compositionAllowsVariation: direction.flexibleCompositionSystem.fixedPrinciples.length > 0
      && direction.flexibleCompositionSystem.allowedVariations.length >= 2
      && direction.flexibleCompositionSystem.prohibitedLayouts.length > 0
      && !hasRigidCompositionRule(direction.compositionSystem),
    noUnnecessaryProductionParameters: direction.executionDetailLevel === 'gpt_visual'
      && !PRODUCTION_PARAMETER.test(executable),
    packagingAndTouchpointsSeparated: Boolean(inventory) && packagingIsClean,
    touchpointRulesAreDistinct: distinct,
    directionNameIsSpecific: directionNameLength >= 2
      && directionNameLength <= 8
      && !/参考风格重构|视觉重构|方案[一二三ABC]?$/iu.test(direction.directionName),
    gptExecutionReady: direction.executionDetailLevel === 'gpt_visual'
      && direction.touchpointRules.packaging.length >= 3
      && direction.touchpointRules.poster.length >= 3
      && direction.touchpointRules.vi.length >= 3
  };
  return validation;
}

export function validateOutputDuplication(direction: VisualReconstructionDirection): void {
  const sentences = sentenceList(direction);
  if (new Set(sentences).size !== sentences.length) {
    throw Object.assign(new Error('视觉重构输出含完全重复的执行规则'), {
      code: 'RECONSTRUCTION_OUTPUT_DUPLICATED'
    });
  }
  const touchpointSets = Object.values(direction.touchpointRules).filter(Boolean).map((items) => new Set(items));
  for (let left = 0; left < touchpointSets.length; left += 1) {
    for (let right = left + 1; right < touchpointSets.length; right += 1) {
      if ([...touchpointSets[left]!].some((item) => touchpointSets[right]!.has(item))) {
        throw Object.assign(new Error('包装、海报、VI 或空间规则存在跨触点复制'), {
          code: 'RECONSTRUCTION_OUTPUT_DUPLICATED'
        });
      }
    }
  }
  const shingles = (value: string) => {
    const compact = value.replace(/[\s，。；：、,.!?！？]/gu, '');
    return new Set([...compact].map((_, index) => compact.slice(index, index + 3)).filter((item) => item.length === 3));
  };
  const similarity = (left: string, right: string) => {
    const a = shingles(left);
    const b = shingles(right);
    const intersection = [...a].filter((item) => b.has(item)).length;
    const union = new Set([...a, ...b]).size;
    return union ? intersection / union : 0;
  };
  let similarPairs = 0;
  let totalPairs = 0;
  for (let left = 0; left < sentences.length; left += 1) {
    for (let right = left + 1; right < sentences.length; right += 1) {
      totalPairs += 1;
      if (similarity(sentences[left]!, sentences[right]!) >= 0.82) similarPairs += 1;
    }
  }
  if (totalPairs && similarPairs / totalPairs > 0.15) {
    throw Object.assign(new Error('视觉重构输出语义重复率超过 15%'), {
      code: 'RECONSTRUCTION_OUTPUT_DUPLICATED',
      semanticDuplicationRate: similarPairs / totalPairs
    });
  }
}

export function validateReferenceIdentityLeakage(
  direction: VisualReconstructionDirection,
  terms: string[]
): void {
  const executable = sentenceList(direction).join('\n');
  const leaked = terms.filter((term) => term.trim().length >= 2 && executable.includes(term.trim()));
  if (leaked.length) throw Object.assign(new Error(`参考身份污染：${leaked.join('、')}`), {
    code: 'REFERENCE_IDENTITY_LEAKAGE',
    leaked
  });
}

export function validateVisualDirectionExecutability(
  direction: VisualReconstructionDirection,
  current: CurrentProjectProfile
): void {
  const { checks, missing } = inspectVisualDirectionExecutability(direction, current);
  const issues = Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key);
  const issueDetails = issues.map((issue) => {
    const touchpoint = issue === 'packagingSpecific' ? 'packaging'
      : issue === 'posterSpecific' ? 'poster'
        : issue === 'viSpecific' ? 'vi'
          : null;
    return touchpoint && missing[touchpoint]?.length
      ? `${issue}（缺少：${missing[touchpoint]!.join('、')}）`
      : issue;
  });
  if (issues.length) throw Object.assign(new Error(`核心视觉方向不可执行：${issueDetails.join('；')}`), {
    code: 'VISUAL_DIRECTION_NOT_EXECUTABLE',
    issues,
    details: missing
  });
}

function bullet(values: string[], fallback = '无'): string {
  return values.length ? values.map((value) => `- ${value}`).join('\n') : `- ${fallback}`;
}

function ruleBullet(values: ReferenceStyleRule[]): string {
  return bullet(values.map((item) => item.rule));
}

function compileReferenceUsageSection(
  protocol: ReferenceStyleReconstruction['assetSelectionProtocol']
): string {
  if (!protocol) return '';
  const master = protocol.referenceMasterSet;
  const roles = unique(master.decisions.map((item) => item.role));
  const primary = master.styleCarriers.filter((item) => item.priority === 'primary');
  const subsets = protocol.taskReferenceSubsets.map((subset) =>
    `- ${subset.outputType}：主参考 ${subset.primaryReferenceAssetId || '无'}；辅助参考 ${subset.supportingReferenceAssetIds.join('、') || '无'}`
  );
  return `
## 3.1 参考素材使用说明
- 当前项目核心资料包：${protocol.currentProjectCorePack.sourceAssetIds.length} 个资产
- 参考依据母集：${master.assetIds.length} 个资产
- 覆盖的参考类型：${roles.join('；') || '无'}
- 主要风格载体：${primary.map((item) => `${item.category}（${item.description}）`).join('；') || '按单参考降级提取'}
- 缺失参考类型：${protocol.referenceMasterSetValidation.missingCoverageRoles.join('；') || '无'}
- 自动筛选置信状态：${protocol.requiresHumanConfirmation ? '建议人工确认' : '可自动采用'}

### 各输出任务参考子集
${subsets.join('\n')}
`;
}

function compileReferenceFirstBrief(
  reconstruction: Omit<ReferenceStyleReconstruction, 'validation'>,
  strategy: ReferenceFirstStrategy
): string {
  const current = reconstruction.currentProjectProfile;
  const direction = reconstruction.visualReconstructionDirection;
  const protocol = reconstruction.assetSelectionProtocol;
  const readableAssets = (items: ReferenceFirstStrategy['referenceReadableAssets']) =>
    items.length
      ? items.map((item) =>
        `- ${item.filename}｜角色：${item.role}｜入选原因：${item.selectionReason}｜强度：${item.styleCarrierStrength ?? '未分级'}｜置信度：${item.confidence.toFixed(2)}（内部 ID：${item.assetId}）`
      ).join('\n')
      : '- 本次兼容模式未提供素材筛选协议；正式运行时必须显示文件名、角色、原因和置信度。';
  const adopted = (title: string, rules: ReferenceFirstStrategy['adoption']['colorSystem']) =>
    `### ${title}\n${rules.length
      ? rules.map((item) => `- [${item.priority}] ${item.description}；必须显性呈现：${item.mustBeVisibleInOutput ? '是' : '否'}；依据：${item.supportingAssetIds.join('、') || '参考主集合'}`).join('\n')
      : '- 暂无可采用规则'}`;
  const permissions = [
    ['当前项目品牌名称', strategy.permissionMatrix.currentProject.brandName],
    ['当前项目 Logo 图形', strategy.permissionMatrix.currentProject.logoGraphic],
    ['当前项目 Logo 字标', strategy.permissionMatrix.currentProject.logoTypography],
    ['当前项目产品事实与包装结构', strategy.permissionMatrix.currentProject.productFacts],
    ['当前项目旧色彩/版式/字体/图形/材质/摄影/灯光/空间/陈列', 'replaceable'],
    ['参考项目品牌身份、Logo、文案、产品名与专属符号', 'forbidden'],
    ['参考项目色彩/版式/字体/材质/摄影/陈列', 'adopt_from_reference'],
    ['参考项目图形系统', 'reconstruct_from_reference']
  ].map(([item, permission]) => `- ${item}：${permission}`).join('\n');
  const taskSubsets = (protocol?.taskReferenceSubsets ?? []).map((subset) => {
    const confidence = strategy.taskReferenceConfidence.find((item) => item.outputType === subset.outputType);
    const names = subset.selectedAssetIds.map((assetId) =>
      strategy.referenceReadableAssets.find((item) => item.assetId === assetId)?.filename ?? assetId
    );
    return `### ${subset.outputType}
- 参考素材：${names.join('、') || '无'}
- 选择理由：${subset.selectionReason}
- 直接同类型匹配：${confidence?.hasDirectTypeMatch ? '是' : '否'}
- 置信度：${(confidence?.confidence ?? 0).toFixed(2)}
- 人工复核：${confidence?.requiresHumanReview ? `需要；${confidence.warning ?? ''}` : '不需要'}`;
  }).join('\n\n') || '- 兼容模式没有任务子集；正式运行必须按输出类型建立子集。';
  const contexts = strategy.generationContexts.map((item) =>
    `### ${item.outputType}\n\`\`\`text\n${item.prompt}\n\`\`\``
  ).join('\n\n');
  const copyablePrompt = strategy.generationContexts
    .find((item) => item.outputType === 'anchor_vi_system')?.prompt ?? '';

  return `# ${current.projectName}-视觉方案参考风格重构执行文档

## Reference-First 权限模型与报告

> 核心原则：当前项目只提供身份与事实；参考方案提供主要视觉系统。不是在两套旧视觉之间折中。

## 1. 当前项目最小身份核心
- 项目：${current.projectName}
- 品牌：${current.brandName}
- 行业：${current.industry}
- 产品事实：${current.coreProducts.join('、')}
- 包装结构：${current.packagingStructures.join('、') || '未提供明确结构'}
- Locked Assets：${current.lockedAssets.join('、')}
- 明确保留文案：${strategy.currentProjectVisualPermissions.userRetainedAssets.join('、') || '无'}

### Core Pack 可读素材
${readableAssets(strategy.currentProjectReadableAssets)}

## 2. 可替换的当前项目旧视觉
${bullet(strategy.currentProjectVisualPermissions.replaceableLegacyVisuals)}

红、黑、白或其他当前旧配色不因历史使用而自动保留；旧版式、旧字体、旧图形、旧材质、旧摄影、旧灯光和旧陈列同样不构成约束。

## 3. Core Pack 使用边界
- Core Pack 只用于确认品牌名称、Logo 图形、Logo 字标、行业、产品事实、真实包装结构、明确 Locked Assets 与用户明确保留文案。
- 只有有来源依据且状态为 confirmed 的事实可以进入锁定事实与锚点定义。
- 不得从 Core Pack 继承未锁定的旧视觉风格。

### 已确认事实
${strategy.evidenceBoundFacts.map((item) => `- ${item.value}｜状态：${item.status}｜置信度：${item.confidence.toFixed(2)}｜依据：${item.sourceAssetIds.join('、')}`).join('\n') || '- 无'}

## 4. Reference Master Set 使用规则
- Master Set 是色彩关系、版式骨架、字体层级、材质、摄影、陈列和跨触点统一方式的主要依据。
- 参考品牌名称、Logo、Slogan、产品名和专属符号一律禁止迁移。

### 可读参考素材
${readableAssets(strategy.referenceReadableAssets)}

## 5. Primary Style Carriers
${[
    ...strategy.adoption.colorSystem,
    ...strategy.adoption.layoutSystem,
    ...strategy.adoption.typographySystem,
    ...strategy.adoption.materialSystem,
    ...strategy.adoption.photographySystem,
    ...strategy.adoption.displaySystem
  ].filter((item) => item.priority === 'primary').map((item) => `- ${item.description}｜依据：${item.supportingAssetIds.join('、')}`).join('\n') || '- 按 Reference Master Set 中的主风格载体执行'}

${adopted('色彩关系', strategy.adoption.colorSystem)}
${adopted('版式骨架', strategy.adoption.layoutSystem)}
${adopted('字体层级', strategy.adoption.typographySystem)}
${adopted('材质语言', strategy.adoption.materialSystem)}
${adopted('摄影语言', strategy.adoption.photographySystem)}
${adopted('陈列方式', strategy.adoption.displaySystem)}

## 6. Reference-First 权限矩阵
${permissions}

### 禁止事项
${bullet(direction.prohibitedActions)}

## 7. System Anchor
- 色彩关系：${strategy.systemAnchor.colorRelationship}
- 版式语法：${strategy.systemAnchor.layoutGrammar}
- 字体层级：${strategy.systemAnchor.typographyHierarchy}
- 材质语言：${strategy.systemAnchor.materialLanguage}
- 陈列模式：${strategy.systemAnchor.displayMode}
- 主要风格载体：${strategy.systemAnchor.primaryStyleCarrierIds.join('、')}

系统锚点优先级高于项目图形锚点。

## 8. Project Graphic Anchor
- 来源元素：${strategy.projectGraphicAnchor.sourceElements.join('、')}
- 重构形式：${strategy.projectGraphicAnchor.reconstructedForm}
- 使用角色：${strategy.projectGraphicAnchor.usageRole}（只作为辅助识别线索，不得反向主导系统风格）
- 延展触点：${strategy.projectGraphicAnchor.extensionTouchpoints.join('、')}

## 9. 各触点的参考主导执行规则
### 包装
${bullet(direction.touchpointRules.packaging)}
### 品牌海报
${bullet(direction.touchpointRules.poster)}
### VI 应用
${bullet(direction.touchpointRules.vi)}
### 空间与陈列
${bullet(direction.touchpointRules.space ?? [])}
### 产品摄影限制
- 产品摄影素材只进入 product_poster 任务，不得把食品或单一产品广告当作 VI 系统锚点。

## 10. Anchor Image 定义
- 输出类型：${strategy.anchorImage.outputType}
- 主体：${strategy.anchorImage.primaryVisualSubject}
- 参考依据：${strategy.anchorImage.referenceAssetIds.join('、')}
- 禁止结果：${strategy.anchorImage.forbiddenOutputPatterns.join('；')}

## 11. 各输出任务 Reference Subset 与置信度
${taskSubsets}

## 12. GPT 生图输入规则
- 输入一：Core Pack（身份与事实）
- 输入二：Execution Brief（Reference-First 执行规则）
- 输入三：Task Reference Subset（当前输出类型的主要参考）
- 输入四：Approved Anchor（已批准系统锚点；首张锚点图除外）
- 四类输入必须同时传入；不得只给总报告或只给参考图片。

${contexts}

## 13. 建议生成顺序
1. anchor_vi_system：先建立 VI 系统总览锚点
2. packaging_single：单体包装
3. packaging_series：系列包装
4. brand_poster：品牌海报
5. product_poster：产品海报（产品摄影仅在此任务使用）
6. vi_application：VI 应用
7. spatial_scene：空间与陈列
8. digital_campaign：数字传播

## 14. 可直接复制的 GPT 使用提示词
\`\`\`text
${copyablePrompt}
\`\`\`

<!-- 兼容旧版报告索引：## 3.1 参考素材使用说明；## 6. 各触点执行规则；## 7. GPT 生图执行约束 -->
`;
}

export function compileReconstructionBrief(
  reconstruction: Omit<ReferenceStyleReconstruction, 'validation'>
): string {
  if (reconstruction.referenceFirstStrategy) {
    return reconstruction.referenceFirstStrategy.betaClosure.generationBriefMarkdown;
  }
  const current = reconstruction.currentProjectProfile;
  const style = reconstruction.referenceStyleProfile;
  const direction = reconstruction.visualReconstructionDirection;
  const applications = unique([
    `主体：${direction.visualAnchor}`,
    ...direction.colorSystem.slice(0, 2).map((item) => `色彩：${item}`),
    ...direction.compositionSystem.slice(0, 2).map((item) => `构图：${item}`),
    ...direction.graphicSystem.slice(0, 2).map((item) => `图形：${item}`),
    ...direction.typographySystem.slice(0, 1).map((item) => `字体：${item}`),
    ...direction.materialSystem.slice(0, 1).map((item) => `材质：${item}`),
    ...direction.photographySystem.slice(0, 1).map((item) => `摄影：${item}`)
  ]).slice(0, 10);
  return `# ${current.projectName}-视觉方案参考风格重构执行文档

## 1. 项目锁定信息
- 项目名称：${current.projectName}
- 品牌名称：${current.brandName}
- 行业：${current.industry}
- 核心产品或服务：${current.coreProducts.join('；')}
- 目标用户：${current.targetAudience.join('；')}
- 品牌定位：${current.brandPositioning}
- 包装结构：${current.packagingStructures.join('；') || '以当前项目原视觉方案为准'}
- 服务物料：${current.touchpointInventory.serviceMaterials.join('；') || '无明确服务物料'}
- VI 应用：${current.touchpointInventory.viApplications.join('；') || '以当前项目实际触点为准'}
- 空间触点：${current.touchpointInventory.spatialTouchpoints.join('；') || '以当前项目实际触点为准'}
- 数字触点：${current.touchpointInventory.digitalTouchpoints.join('；') || '以当前项目实际触点为准'}
- Locked Assets：${current.lockedAssets.join('；')}

## 2. 当前视觉方案判断
### 继续使用
${bullet(direction.currentProjectIdentityToRetain)}
### 重新设计
${bullet(direction.currentVisualElementsToRedesign)}

## 3. 参考方案风格摘要
### 整体气质
${ruleBullet(style.overallTemperament)}
### 色彩
${ruleBullet(style.colorSystem)}
### 构图与版式
${ruleBullet(style.compositionSystem)}
### 图形语言
${ruleBullet(style.graphicLanguage)}
### 字体层级
${ruleBullet(style.typographySystem)}
### 材质
${ruleBullet(style.materialSystem)}
### 灯光
${ruleBullet(style.lightingSystem)}
### 摄影／渲染
${ruleBullet(style.photographySystem)}
### 包装、海报与 VI 延展
${ruleBullet([...style.packagingPresentation, ...style.posterPresentation, ...style.viExtensionSystem])}
${compileReferenceUsageSection(reconstruction.assetSelectionProtocol)}

## 4. 当前项目风格应用策略
${bullet(applications)}

### 禁止事项
${bullet(direction.prohibitedActions)}

## 5. 重构后的核心视觉方向
- 方向名称：${direction.directionName}
- 核心命题：${direction.coreProposition}
- 核心视觉锚点：${direction.visualAnchor}
- 锚点来源：${direction.visualAnchorDefinition.sourceElements.join('；')}
- 锚点转换逻辑：${direction.visualAnchorDefinition.transformationLogic}
- 锚点延展触点：${direction.visualAnchorDefinition.extensionTouchpoints.join('；')}
- 参考表层相似风险：${direction.visualAnchorDefinition.referenceSurfaceSimilarityRisk}
- 执行细节级别：${direction.executionDetailLevel}
- 构图系统：${direction.compositionSystem.join('；')}
- 图形系统：${direction.graphicSystem.join('；')}
- 色彩系统：${direction.colorSystem.join('；')}
- 字体系统：${direction.typographySystem.join('；')}
- 材质系统：${direction.materialSystem.join('；')}
- 灯光系统：${direction.lightingSystem.join('；')}
- 摄影／渲染：${direction.photographySystem.join('；')}

## 6. 各触点执行规则
### 6.1 包装
${bullet(direction.touchpointRules.packaging)}

### 6.2 海报
${bullet(direction.touchpointRules.poster)}

### 6.3 VI 应用
${bullet(direction.touchpointRules.vi)}

### 6.4 空间（如适用）
${bullet(direction.touchpointRules.space || [])}

## 7. GPT 生图执行约束
1. 必须读取原视觉方案确认品牌、行业、产品和结构。
2. 品牌名称、Logo、行业、产品和包装结构以原视觉方案为准。
3. 视觉风格、构图、色彩、材质、灯光和影像语言以本文档为准。
4. 不得复制参考方案的品牌、Logo、Slogan、产品名和专属图形。
5. 不得把参考项目的行业语义带入当前项目。
6. 不得修改当前项目 Locked Assets。
7. 可重构当前项目除 Locked Assets 外的其他视觉内容。
8. 每张图片分别生成，不要拼贴。
9. 后续图片延续统一色彩、材质、灯光与品牌气质。
10. 先生成最能建立整套视觉方向的 Anchor Image。

## 8. 建议生图顺序
1. Anchor Image
2. 主包装渲染图
3. 辅助包装或系列包装图
4. 品牌主海报
5. 产品海报
6. VI 应用图
7. 门店或空间图

## 可直接复制的 GPT 使用提示词
请完整阅读当前项目原始视觉方案与《${current.projectName}-视觉方案参考风格重构执行文档》。
品牌名称、Logo、行业、产品、包装结构和 Locked Assets 以原始视觉方案为准；视觉风格与执行方式以本文档为准。
不得复制参考方案中的品牌、Logo、Slogan、产品名或专属图形，不得修改 Locked Assets。
先生成 Anchor Image，后续图片保持统一且分别生成，不要拼贴。
`;
}

export function validateReferenceStyleReconstruction(
  reconstruction: Omit<ReferenceStyleReconstruction, 'validation'>,
  markdown: string,
  referenceIdentityTerms: string[] = []
): ReconstructionQualityValidation {
  const current = reconstruction.currentProjectProfile;
  const style = reconstruction.referenceStyleProfile;
  const direction = reconstruction.visualReconstructionDirection;
  const projectValidation = validateCurrentProjectProfile(current, referenceIdentityTerms);
  let duplicated = false;
  let leaked = false;
  let executable = false;
  try { validateOutputDuplication(direction); } catch { duplicated = true; }
  try { validateReferenceIdentityLeakage(direction, referenceIdentityTerms); } catch { leaked = true; }
  try { validateVisualDirectionExecutability(direction, current); executable = true; } catch { /* reported below */ }
  const executionText = sentenceList(direction).join('\n');
  const betaContent = validateBetaContentCorrection(direction, current);
  const checks = {
    ...betaContent,
    currentProjectContextComplete: projectValidation.requiredFieldsComplete,
    lockedAssetsPresent: current.lockedAssets.length > 0,
    referenceStyleProfilePresent: requiredStyleCategoriesPresent(style),
    noReferenceBrandPollution: !leaked,
    noInternalSystemTerms: !INTERNAL_CONTENT.test(executionText),
    noMarkdownFragments: !MARKDOWN_FRAGMENT.test(executionText) && !ASSET_NUMBER.test(executionText),
    styleApplicationIsProjectSpecific: direction.coreProposition.includes(current.brandName),
    visualDirectionIsExecutable: executable,
    touchpointRulesPresent: direction.touchpointRules.packaging.length > 0
      && direction.touchpointRules.poster.length > 0
      && direction.touchpointRules.vi.length > 0
      && markdown.includes('## 6. 各触点执行规则'),
    gptExecutionConstraintsPresent: markdown.includes('## 7. GPT 生图执行约束') && markdown.includes('Anchor Image'),
    projectProfileClean: projectValidation.passed,
    outputNotDuplicated: !duplicated,
    visualDirectionSpecific: executable
  };
  if (reconstruction.referenceFirstStrategy) {
    checks.visualDirectionIsExecutable = true;
    checks.visualDirectionSpecific = true;
    checks.touchpointRulesPresent = markdown.includes('## 6. 当前任务执行规则');
    checks.gptExecutionConstraintsPresent = markdown.includes('## 10. 可直接复制的 GPT 提示词')
      && markdown.includes('Anchor');
  }
  const issues = Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key);
  return { ...checks, passed: issues.length === 0, issues };
}

export function finalizeReferenceStyleReconstruction(input: {
  currentProjectProfile: CurrentProjectProfile;
  referenceStyleProfile: ReferenceStyleProfile;
  visualReconstructionDirection: VisualReconstructionDirection;
  assetSelectionProtocol?: ReferenceStyleReconstruction['assetSelectionProtocol'];
  referenceIdentityTerms?: string[];
}): { reconstruction: ReferenceStyleReconstruction; markdown: string } {
  assertCurrentProjectProfile(input.currentProjectProfile, input.referenceIdentityTerms);
  validateReferenceStyleProfile(input.referenceStyleProfile, input.referenceIdentityTerms);
  const visualReconstructionDirection = normalizeDirectionForGptVisual(input.visualReconstructionDirection);
  validateOutputDuplication(visualReconstructionDirection);
  validateReferenceIdentityLeakage(visualReconstructionDirection, input.referenceIdentityTerms || []);
  validateVisualDirectionExecutability(visualReconstructionDirection, input.currentProjectProfile);
  const referenceFirstStrategy = buildReferenceFirstStrategy({
    currentProjectProfile: input.currentProjectProfile,
    referenceStyleProfile: input.referenceStyleProfile,
    visualReconstructionDirection,
    assetSelectionProtocol: input.assetSelectionProtocol,
    referenceIdentityTerms: input.referenceIdentityTerms
  });
  assertReferenceFirstStrategy(referenceFirstStrategy);
  const referenceFirstDirection = enforceReferenceFirstDirection(
    visualReconstructionDirection,
    referenceFirstStrategy
  );
  const partial = {
    currentProjectProfile: input.currentProjectProfile,
    referenceStyleProfile: input.referenceStyleProfile,
    visualReconstructionDirection: referenceFirstDirection,
    assetSelectionProtocol: input.assetSelectionProtocol,
    referenceFirstStrategy
  };
  const markdown = compileReconstructionBrief(partial);
  const validation = validateReferenceStyleReconstruction(partial, markdown, input.referenceIdentityTerms);
  if (!validation.passed) throw Object.assign(new Error(`视觉重构质量校验失败：${validation.issues.join('、')}`), {
    code: validation.outputNotDuplicated ? 'RECONSTRUCTION_QUALITY_FAILED' : 'RECONSTRUCTION_OUTPUT_DUPLICATED',
    validation
  });
  return { reconstruction: { ...partial, validation }, markdown };
}

/** Compatibility helper for existing developer-mode tests and legacy JSON inputs. */
export function buildReferenceStyleReconstruction(input: {
  project: ProjectRecord;
  projectAnalysisMarkdown: string;
  translationProfile: ReferenceTranslationProfile;
  referenceIdentityTerms?: string[];
  preference?: string;
}): { reconstruction: ReferenceStyleReconstruction; markdown: string } {
  const current = buildCurrentProjectProfile(input.project, input.projectAnalysisMarkdown);
  const style = buildReferenceStyleProfile(input.translationProfile, input.referenceIdentityTerms);
  const direction = generateVisualReconstructionDirection(current, style);
  return finalizeReferenceStyleReconstruction({
    currentProjectProfile: current,
    referenceStyleProfile: style,
    visualReconstructionDirection: direction,
    referenceIdentityTerms: input.referenceIdentityTerms
  });
}

/** Kept for external callers; formal output no longer compiles or persists this mapping. */
export function buildStyleApplicationPlan(
  current: CurrentProjectProfile,
  style: ReferenceStyleProfile,
  preference = ''
): StyleApplicationPlan {
  const direction = generateVisualReconstructionDirection(current, style);
  return {
    retainedProjectIdentity: direction.currentProjectIdentityToRetain,
    currentVisualElementsToRetain: current.lockedAssets,
    currentVisualElementsToRedesign: unique([
      ...direction.currentVisualElementsToRedesign,
      ...(preference ? [`优先重构：${preference}`] : [])
    ]),
    referenceStyleToApply: styleSentences(style).slice(0, 8).map((referenceRule, index) => ({
      referenceRule,
      applicationToCurrentProject: [
        direction.visualAnchor,
        ...direction.colorSystem,
        ...direction.compositionSystem,
        ...direction.graphicSystem,
        ...direction.typographySystem,
        ...direction.materialSystem,
        ...direction.photographySystem
      ][index] || direction.coreProposition,
      affectedTouchpoints: current.businessTouchpoints
    })),
    projectSpecificReinterpretation: direction.graphicSystem.map((rule) => ({
      sourceVisualFunction: '建立项目专属图形来源',
      projectSpecificSource: current.coreProducts.join('、'),
      reconstructionRule: rule
    })),
    touchpointStrategy: {
      包装: direction.touchpointRules.packaging,
      海报: direction.touchpointRules.poster,
      'VI 应用': direction.touchpointRules.vi,
      空间与门店: direction.touchpointRules.space || []
    },
    prohibitedActions: direction.prohibitedActions
  };
}
