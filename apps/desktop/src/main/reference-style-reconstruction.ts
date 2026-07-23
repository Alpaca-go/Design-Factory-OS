import type {
  CurrentProjectProfile,
  ProjectRecord,
  ReconstructionQualityValidation,
  ReferenceStyleProfile,
  ReferenceStyleReconstruction,
  ReferenceStyleRule,
  ReferenceTranslationProfile,
  StyleApplicationPlan,
  VisualReconstructionDirection
} from '../shared/types.ts';

const INCOMPLETE_VALUE = /待确认|待补充|未知|未识别|未命名/iu;
const MARKDOWN_FRAGMENT = /^(?:#{1,6}\s|\|.*\||```|\d+(?:\.\d+)*[.)、]\s)/u;
const ASSET_NUMBER = /\bAsset[-_\s]?\d+\b/iu;
const DESIGN_ADVICE = /(?:\d+(?:\.\d+)?\s*%.*(?:色|背景)|字号|字重|摄影|构图|版式|材质|灯光|渲染|升级|替换|删除|保留|应当|建议|Hierarchy is King|Creative Brief|GPT Execution|Runtime Protocol|竞品)/iu;
const INTERNAL_CONTENT = /GPT Execution Core|Creative Authority|runtime protocol|运行时协议|竞品分析|资产决策|PTM-\d+/iu;
const FIXED_WRAPPER = /通过可重复的节奏、密度和对比关系形成|通过网格、留白与信息区之间的稳定关系组织|将可识别形态抽象为可缩放、裁切和组合的图形语法|通过材质表面、光线方向与影像景深共同形成|通过母版结构与变量替换在不同触点延展/iu;
const PEOPLE_TERMS = /用户|人群|消费者|顾客|客户|客群|上班族|家庭|亲子|年轻|年龄|岁|人群|食客|游客|学生|白领|居民|从业者/iu;
const OFFERING_ADVICE = /需|建议|应|通过|呈现|强调|优先|避免|替代|升级|摄影|色彩|构图|字号|材质|灯光/iu;

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

export interface ProjectProfileValidation {
  coreProductsContainOnlyOfferings: boolean;
  targetAudienceContainsOnlyPeople: boolean;
  noDesignAdviceInFacts: boolean;
  noMarkdownFragments: boolean;
  noAssetNumbers: boolean;
  noReferenceBrandTerms: boolean;
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
    ...profile.confirmedFacts
  ].filter(Boolean);
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
    requiredFieldsComplete: Boolean(
      profile.brandName && !INCOMPLETE_VALUE.test(profile.brandName)
      && profile.industry && !INCOMPLETE_VALUE.test(profile.industry)
      && profile.coreProducts.length
      && profile.targetAudience.length
      && profile.businessTouchpoints.length
      && profile.lockedAssets.length
    )
  };
  const issues = Object.entries(validation).filter(([, passed]) => !passed).map(([key]) => key);
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
  const message = missing.length
    ? `当前项目资料不足，无法生成可靠的视觉重构文档。请先补充：${missing.join('、')}。`
    : `当前项目事实含有设计建议、Markdown、资产编号或非事实内容：${validation.issues.join('、')}`;
  throw Object.assign(new Error(message), {
    code: missing.length ? 'CURRENT_PROJECT_CONTEXT_INCOMPLETE' : 'CURRENT_PROJECT_PROFILE_CONTAMINATED',
    validation,
    missingFields: missing
  });
}

/** Legacy/local fallback. Formal user flow uses the dedicated multimodal Current Project Facts step. */
export function buildCurrentProjectProfile(project: ProjectRecord, analysisMarkdown: string): CurrentProjectProfile {
  const lines = reportLines(analysisMarkdown);
  const assets = (project.assets || []).map((asset) => asset.originalName);
  const profile: CurrentProjectProfile = {
    schemaVersion: 'current-project-profile-v2',
    projectId: project.id,
    projectName: project.projectName,
    brandName: confirmedOrAnalyzed(
      [project.brandName, project.detectedBrandName],
      labeledValues(lines, '品牌名称|品牌名|品牌', 1)[0]
    ),
    industry: confirmedOrAnalyzed(
      [project.industry, project.detectedIndustry],
      labeledValues(lines, '所属行业|行业定位|行业|所属品类|核心品类|品类|赛道', 1)[0]
    ),
    coreProducts: labeledValues(lines, '核心产品(?:或服务)?|产品与服务|主营产品|主营服务'),
    targetAudience: labeledValues(lines, '目标用户|目标人群|核心客群|主要客群|受众'),
    pricePositioning: labeledValues(lines, '价格带|价格定位|客单价', 1)[0],
    brandPositioning: labeledValues(lines, '品牌定位|价值主张|品牌角色', 1)[0] || '',
    usageScenarios: labeledValues(lines, '消费场景|使用场景|业务场景'),
    businessTouchpoints: labeledValues(lines, '业务触点|品牌触点|应用触点').length
      ? labeledValues(lines, '业务触点|品牌触点|应用触点')
      : inferTouchpoints(analysisMarkdown, assets),
    packagingStructures: labeledValues(lines, '包装结构|包装盒型|产品结构'),
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
    schemaVersion: 'reference-style-profile-v2',
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
  return {
    directionName: `${motif}成景`,
    coreProposition: `以 ${current.brandName} 的 ${product} 为绝对主体，在 ${current.usageScenarios[0] || '真实消费场景'} 中建立清晰、可延展的视觉识别。`,
    visualAnchor: `从 ${product} 的真实轮廓、使用动作与呈现过程提取连续图形路径，结合主体摄影形成可用于包装裁切、海报动线和 VI 分区的视觉锚点。`,
    currentProjectIdentityToRetain: unique([current.brandName, current.industry, ...current.coreProducts, ...current.lockedAssets]),
    currentVisualElementsToRedesign: ['未锁定的色彩比例与背景', '构图网格与信息层级', '辅助图形、材质、灯光与摄影表现'],
    compositionSystem: composition,
    graphicSystem: [`辅助图形只取自 ${product} 的轮廓、动作与真实场景，不复用参考项目专属符号。`],
    colorSystem: color,
    typographySystem: style.typographySystem.map((item) => item.rule),
    materialSystem: material,
    lightingSystem: style.lightingSystem.map((item) =>
      `光线以当前项目主体为中心设置明确方向、柔和过渡与受控阴影，形成${item.designEffect || '清晰层次'}。`),
    photographySystem: style.photographySystem.map((item) =>
      `摄影以 ${product} 的真实近景为主体，控制镜头距离、背景和景深，形成${item.designEffect || '真实质感'}。`),
    touchpointRules: {
      packaging: [
        `包装以 ${product} 为正面摄影主体，主背景使用受控低饱和色，品牌色只承担识别重点。`,
        'Logo 保持固定安全区，产品名、规格和说明形成三级信息层级。',
        '辅助图形位于主体与信息区之间，包装材质和工艺服从真实结构。',
        '渲染使用柔和侧光，系列仅改变受控色块、产品摄影与规格信息。'
      ],
      poster: [
        `海报以 ${product} 近景为主体，占据主要视觉区域并保留标题区和呼吸留白。`,
        '镜头、背景和光线保持一致，辅助图形只负责连接主体与说明信息。',
        '系列海报仅改变产品、标题和局部图形路径，不改变母版构图。'
      ],
      vi: [
        '手提袋、菜单、贴纸、工作服和数字模板共用固定母版与色彩比例。',
        'Logo 始终遵守安全区，辅助图形按触点尺寸裁切。',
        '不同触点只替换产品信息和必要变量，不改变信息层级。'
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
      && missing.vi.length === 0
  };
  return { checks, missing };
}

export function completeVisualDirectionTouchpoints(
  direction: VisualReconstructionDirection,
  current: CurrentProjectProfile,
  style: ReferenceStyleProfile
): VisualReconstructionDirection {
  const fallback = generateVisualReconstructionDirection(current, style);
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
  return { ...direction, touchpointRules };
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

export function compileReconstructionBrief(
  reconstruction: Omit<ReferenceStyleReconstruction, 'validation'>
): string {
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

## 4. 当前项目风格应用策略
${bullet(applications)}

### 禁止事项
${bullet(direction.prohibitedActions)}

## 5. 重构后的核心视觉方向
- 方向名称：${direction.directionName}
- 核心命题：${direction.coreProposition}
- 核心视觉锚点：${direction.visualAnchor}
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
  const checks = {
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
  const issues = Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key);
  return { ...checks, passed: issues.length === 0, issues };
}

export function finalizeReferenceStyleReconstruction(input: {
  currentProjectProfile: CurrentProjectProfile;
  referenceStyleProfile: ReferenceStyleProfile;
  visualReconstructionDirection: VisualReconstructionDirection;
  referenceIdentityTerms?: string[];
}): { reconstruction: ReferenceStyleReconstruction; markdown: string } {
  assertCurrentProjectProfile(input.currentProjectProfile, input.referenceIdentityTerms);
  validateReferenceStyleProfile(input.referenceStyleProfile, input.referenceIdentityTerms);
  validateOutputDuplication(input.visualReconstructionDirection);
  validateReferenceIdentityLeakage(input.visualReconstructionDirection, input.referenceIdentityTerms || []);
  validateVisualDirectionExecutability(input.visualReconstructionDirection, input.currentProjectProfile);
  const partial = {
    currentProjectProfile: input.currentProjectProfile,
    referenceStyleProfile: input.referenceStyleProfile,
    visualReconstructionDirection: input.visualReconstructionDirection
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
