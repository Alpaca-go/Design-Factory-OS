import type { CurrentProjectProfile, ProjectRecord, ReferenceStyleProfile } from '../shared/types.ts';

const jsonOnly = `
只返回一个合法 JSON 对象。不要 Markdown、代码围栏、解释、标题或表格。
禁止输出“待确认”“待补充”。证据不足时使用空数组，不得编造。
`;

export function buildCurrentProjectFactsPrompt(project: ProjectRecord): string {
  return `你正在执行 Current Project Facts Extractor。
只从随附的当前项目视觉方案中识别项目身份和业务事实，不做视觉审计，不给设计建议。

已知且优先级最高的项目元数据：
${JSON.stringify({
  projectId: project.id,
  projectName: project.projectName,
  brandName: project.brandName,
  industry: project.industry,
  lockedAssets: [
    ...(project.logoLocked ? ['当前项目原始 Logo'] : []),
    ...(project.logoFiles || []),
    ...(project.lockedFacts || [])
  ]
}, null, 2)}

输出结构：
{
  "brandName": "明确品牌名",
  "industry": "明确行业／品类",
  "coreProducts": ["只能是产品或服务名称"],
  "targetAudience": ["只能是具体人群描述"],
  "brandPositioning": "一句事实性定位",
  "pricePositioning": "可选价格带",
  "usageScenarios": ["真实使用或消费场景"],
  "businessTouchpoints": ["包装、海报、菜单、门店、数字端等真实触点"],
  "packagingStructures": ["真实盒型、瓶型、袋型、容器或产品结构"],
  "visualSources": {
    "productForms": ["产品可观察形态、部件或内容物"],
    "cookingActions": ["制作、加工或服务动作；非餐饮项目填写真实生产或使用动作"],
    "sensorySignals": ["温度、流动、气味、触感、声音等可视觉化信号"],
    "consumptionActions": ["用户实际使用、消费或互动动作"],
    "brandNameSemantics": ["品牌名称中明确可用的语义，不得臆造"],
    "spatialObjects": ["真实场景中的桌面、器具、设备、招牌或空间物件"]
  },
  "touchpointInventory": {
    "primaryPackaging": ["直接容纳或交付核心产品的主包装"],
    "secondaryPackaging": ["调料包、湿巾包装等辅助包装"],
    "serviceMaterials": ["筷子套、纸巾等服务物料"],
    "viApplications": ["菜单、工作服、桌牌等 VI 应用"],
    "spatialTouchpoints": ["招牌、墙面、导视等空间触点"],
    "digitalTouchpoints": ["社交媒体海报、平台头图等数字触点"]
  },
  "confirmedFacts": ["图片或已知元数据明确支持的事实"]
}

严禁把以下内容写入任何事实字段：色彩比例、字号、摄影、构图、材质、灯光、竞品、审计结论、升级／替换／保留／删除建议、Asset 编号、Markdown 片段、GPT 指令。
coreProducts 中每项必须是产品或服务名；targetAudience 中每项必须描述人。
包装结构只能填写真实包装；筷子套和纸巾进入 serviceMaterials，工作服和菜单进入 viApplications，不得混入 packagingStructures。
${jsonOnly}`;
}

export function buildReferenceStylePrompt(): string {
  return `你正在执行 Reference Style Visual Analysis。参考图片只是视觉样式样本，不是品牌项目。
只分析可观察的视觉形式，不保留图片中文字的品牌、产品、Slogan、客户或行业语义。

输出结构：
{
  "overallTemperament": [StyleRule],
  "colorSystem": [StyleRule],
  "compositionSystem": [StyleRule],
  "graphicLanguage": [StyleRule],
  "typographySystem": [StyleRule],
  "materialSystem": [StyleRule],
  "lightingSystem": [StyleRule],
  "photographySystem": [StyleRule],
  "packagingPresentation": [StyleRule],
  "posterPresentation": [StyleRule],
  "viExtensionSystem": [StyleRule],
  "excludedIdentityTerms": ["识别到但必须排除的品牌名、产品名、Slogan、竞品名或专属符号"],
  "sourceAssetIds": ["实际观察的视觉附件 ID"]
}

StyleRule：
{"rule":"完整、自然、可执行的视觉规律句子。","inheritanceLevel":"principle | relationship | surface","evidence":["视觉附件 ID + 可观察证据，不抄图片文案"],"designEffect":"该规律带来的设计效果。","confidence":0.0}

每个风格类别必须输出 1–4 条，跨图重复规律优先。规则不得逐字转录参考报告或图片文案。
禁止固定模板前缀，尤其禁止“通过网格、留白与信息区之间的稳定关系组织”“通过材质表面、光线方向与影像景深共同形成”等句式。
禁止品牌名、Logo、Slogan、产品名、客户名、竞品、审计问题、Creative Brief、GPT Execution Core、Runtime Protocol、Asset-008 或 Markdown 表格进入 StyleRule。
${jsonOnly}`;
}

export function buildVisualReconstructionDecisionPrompt(input: {
  currentProjectProfile: CurrentProjectProfile;
  referenceStyleProfile: ReferenceStyleProfile;
  preference?: string;
}): string {
  return `你正在执行独立的 Visual Reconstruction Decision。
只能使用下面两个干净 JSON 和可选偏好，不得假设或引用任何上游 Markdown 报告。

CURRENT_PROJECT_PROFILE:
${JSON.stringify(input.currentProjectProfile, null, 2)}

REFERENCE_STYLE_PROFILE:
${JSON.stringify(input.referenceStyleProfile, null, 2)}

USER_STYLE_PREFERENCE:
${input.preference?.trim() || '无'}

输出结构：
{
  "directionName": "2–8 个汉字的项目专属创意方向名，不得叫参考风格重构或视觉重构",
  "coreProposition": "必须包含当前品牌和核心产品语义",
  "visualAnchor": {
    "name": "2–8 个汉字的锚点名",
    "sourceElements": ["至少两个，且来自当前项目 visualSources 的不同来源类别"],
    "transformationLogic": "如何将产品、动作、感官或品牌语义转为图形",
    "visualForm": "GPT 可直接画出的具体视觉形态",
    "extensionTouchpoints": ["至少三个真实触点"],
    "referenceSurfaceSimilarityRisk": "low | medium | high"
  },
  "executionDetailLevel": "gpt_visual",
  "referenceInheritance": [
    {"level":"principle","weight":1.0,"rule":"可继承的组织原则"},
    {"level":"relationship","weight":0.8,"rule":"可继承的视觉关系"},
    {"level":"surface","weight":0.35,"rule":"仅作弱参考且不得完整复制的表层形式"}
  ],
  "currentProjectIdentityToRetain": ["当前项目身份与 Locked Assets"],
  "currentVisualElementsToRedesign": ["需要重构的未锁定视觉内容"],
  "flexibleCompositionSystem": {
    "fixedPrinciples": ["产品或服务主体、信息层级等不变原则"],
    "allowedVariations": ["不同触点、系列和画幅允许的构图变化"],
    "seriesConsistencyRules": ["系列一致性来自哪些关系，而非固定母版"],
    "prohibitedLayouts": ["会削弱主体或信息的构图"]
  },
  "graphicSystem": ["从当前产品、动作和场景产生的具体图形来源"],
  "flexibleColorSystem": {
    "identityColorRole": "品牌识别色承担的角色，不写死面积",
    "backgroundOptions": ["按触点可选的背景策略"],
    "textAndStructureColors": ["文字与结构色"],
    "accentOptions": ["少量强调色选择"],
    "saturationGuideline": "饱和度关系级原则",
    "touchpointVariations": ["包装、海报、VI、空间的色彩差异"]
  },
  "typographySystem": ["标题、正文、说明信息的具体层级"],
  "materialSystem": ["按具体触点选择材质及理由，不得把参考材质组合全量复制"],
  "lightingSystem": ["关系级光线方向与影调"],
  "photographySystem": ["关系级主体、景别、背景和质感"],
  "touchpointRules": {
    "packaging": ["至少 4 条；合计覆盖背景与品牌识别色、Logo/品牌标志及安全区、产品摄影、信息层级、辅助图形、包装材质与制作工艺、光影和系列变量"],
    "poster": ["至少 3 条；合计覆盖产品主体比例、标题与呼吸留白、镜头景别与背景、光影与辅助图形、系列变化"],
    "vi": ["至少 3 条；合计覆盖母版或网格、色彩系统、图形系统、Logo/品牌标志安全区、信息层级和不同触点的可替换变量"],
    "space": ["如适用，覆盖墙面、灯箱、材质、导视、招牌和真实场景"]
  },
  "prohibitedActions": ["参考身份只允许在这里以不得复制的形式出现"]
}

整体应用策略应收敛为主体、色彩、构图、图形、字体、材质、摄影和跨触点统一，不要按参考规则逐条映射。
禁止“以当前项目内容替换参考内容”“保留其运行属性”“采用该面积关系”“后续重新填充”等空泛模板句。
包装、海报、VI、空间必须是不同且具体的执行规则，任何句子不得重复。
参考方案的表层形式只作为弱参考。优先继承视觉关系与组织原则，不得机械复制具体色彩比例、徽章结构、书法形式和材质组合。
核心视觉锚点必须从当前项目的产品形态、制作动作、感官信号、消费行为或品牌名称语义中产生，并至少结合两类来源、延展到三个触点。
不得使用牛头加脸谱、砂锅加印章、辣椒加火焰、传统纹样加书法、城市地标加红色徽章作为主要锚点，除非它们是当前项目 Locked Asset。
当前输出面向 GPT 生图，只生成关系级规则。除非当前项目明确提供，否则不要输出镜头焦段、光圈、色温、光比、厘米、精确百分比和固定网格交点。
色彩不写死占比，不禁止全部冷色，不要求所有背景纯色；构图必须同时给出固定原则与允许变化。
Logo 之外的标题字体不强制复制参考书法；正文使用高可读性的现代字体。材质必须按触点选择。
字段名必须严格使用上面的英文键名，尤其不得把 packaging、poster、vi 改为中文键名。
${jsonOnly}`;
}
