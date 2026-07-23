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
  "confirmedFacts": ["图片或已知元数据明确支持的事实"]
}

严禁把以下内容写入任何事实字段：色彩比例、字号、摄影、构图、材质、灯光、竞品、审计结论、升级／替换／保留／删除建议、Asset 编号、Markdown 片段、GPT 指令。
coreProducts 中每项必须是产品或服务名；targetAudience 中每项必须描述人。
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
{"rule":"完整、自然、可执行的视觉规律句子。","evidence":["视觉附件 ID + 可观察证据，不抄图片文案"],"designEffect":"该规律带来的设计效果。","confidence":0.0}

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
  "visualAnchor": "可被画出来、来自当前项目且可跨触点复用的具体视觉锚点",
  "currentProjectIdentityToRetain": ["当前项目身份与 Locked Assets"],
  "currentVisualElementsToRedesign": ["需要重构的未锁定视觉内容"],
  "compositionSystem": ["具体构图规则"],
  "graphicSystem": ["从当前产品、动作和场景产生的具体图形来源"],
  "colorSystem": ["包含主背景、品牌色面积和对比关系的具体规则"],
  "typographySystem": ["标题、正文、说明信息的具体层级"],
  "materialSystem": ["具体材质与工艺"],
  "lightingSystem": ["具体光线方向与影调"],
  "photographySystem": ["具体主体、景别、镜头、背景和质感"],
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
字段名必须严格使用上面的英文键名，尤其不得把 packaging、poster、vi 改为中文键名。
${jsonOnly}`;
}
