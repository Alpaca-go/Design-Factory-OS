import type { ProjectAsset, ProjectRecord } from '../../shared/types.ts';

const JSON_ONLY = `
只返回合法 JSON，不要 Markdown、代码围栏或解释。必须为每个 assetId 返回且仅返回一条决定，不得遗漏、合并或虚构资产。
confidence 使用 0 到 1。低于 0.8 时 requiresHumanReview 必须为 true。`;

function manifest(assets: ProjectAsset[]) {
  return assets.map((asset) => ({
    assetId: asset.id,
    filename: asset.originalName,
    mimeType: asset.mimeType,
    sha256: asset.sha256
  }));
}

export function buildCurrentProjectAssetSelectionPrompt(
  project: ProjectRecord,
  assets: ProjectAsset[]
): string {
  return `你正在执行 Current Project Analysis/Generation Pack Selector。
必须把分析证据包与生图身份包分开：分析包可以观察旧视觉；生图身份包只保留品牌身份、产品事实、真实结构和 Locked Assets。
旧视觉风格绝不能进入生图身份包或作为新输出的风格依据。带旧贴图的包装结构只能使用 structure_only。

项目元数据：
${JSON.stringify({
  projectId: project.id,
  projectName: project.projectName,
  brandName: project.brandName,
  industry: project.industry,
  logoLocked: project.logoLocked,
  logoFiles: project.logoFiles,
  lockedFacts: project.lockedFacts
}, null, 2)}

资产清单：
${JSON.stringify(manifest(assets), null, 2)}

输出：
{"decisions":[{
  "assetId":"清单中的 ID",
  "filename":"清单中的文件名",
  "role":"logo_evidence | logo_typography_evidence | brand_name_evidence | product_fact_evidence | packaging_structure_evidence | product_structure_evidence | touchpoint_evidence | locked_asset_evidence | brand_copy_evidence | spatial_structure_evidence | legacy_visual_style_only | duplicate | irrelevant | uncertain",
  "roles":["允许同一资产具有多个上述角色"],
  "keepInCorePack":true,
  "includeInAnalysisEvidencePack":true,
  "includeInGenerationIdentityPack":false,
  "generationUsage":"identity | product | structure_only | locked_asset | exclude",
  "keepReason":"基于可观察内容的理由",
  "extractedFacts":["只写明确事实"],
  "lockedEvidence":["不可修改的身份或结构证据"],
  "containsLegacyStyle":false,
  "legacyStyleShouldInfluenceOutput":false,
  "confidence":0.0,
  "requiresHumanReview":false
}]}

duplicate、irrelevant 不得进入任一包。legacy_visual_style_only 可以进入分析包，但不得进入生图身份包。
从旧视觉中观察到的 Slogan 不得自动视为 Locked Asset 或保留文案。
legacyStyleShouldInfluenceOutput 永远为 false。
${JSON_ONLY}`;
}

export function buildReferenceAssetSelectionPrompt(assets: ProjectAsset[]): string {
  return `你正在执行 Reference Master Set Selector。
参考资产只提供视觉形式证据。筛掉纯文字、商业分析、无关页、重复与近重复页；优先覆盖系统总览、包装、海报/版式、材质细节、字体/图形和跨触点应用。

资产清单：
${JSON.stringify(manifest(assets), null, 2)}

输出：
{"decisions":[{
  "assetId":"清单中的 ID",
  "filename":"清单中的文件名",
  "role":"system_overview | packaging | packaging_detail | poster | vi_application | material_detail | typography_detail | graphic_detail | spatial | display_layout | photography_style | brand_strategy_text | pure_text_slide | duplicate | irrelevant | uncertain",
  "primaryRole":"与 role 相同的主角色",
  "secondaryRoles":["该图明确包含的其他角色；例如 VI 总览可同时包含 packaging、display_layout、typography_detail"],
  "styleCarrierStrength":"high | medium | low",
  "includeInMasterSet":true,
  "eligibleOutputTypes":["anchor_vi_system | packaging_single | packaging_series | brand_poster | product_poster | vi_application | spatial_scene | digital_campaign"],
  "representedStyleCarriers":["color | layout | typography | graphic | material | photography | display | spatial"],
  "duplicationGroupId":"近重复组 ID，可省略",
  "confidence":0.0,
  "reason":"基于可观察内容的理由",
  "requiresHumanReview":false
}]}

pure_text_slide、brand_strategy_text、duplicate、irrelevant 必须 includeInMasterSet=false。
同一 duplicationGroupId 最多只能有一个资产进入母集。
${JSON_ONLY}`;
}
