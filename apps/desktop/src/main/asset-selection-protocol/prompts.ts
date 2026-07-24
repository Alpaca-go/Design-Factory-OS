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
  return `你正在执行 Current Project Core Pack Selector。
目标是保留当前品牌身份、产品事实、Logo/品牌字形、包装与产品结构、真实触点和 Locked Assets 的证据。
旧视觉风格只能标记为 legacy_visual_style_only，绝不能作为新输出的风格依据。参考项目资产不得混入。

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
  "keepInCorePack":true,
  "keepReason":"基于可观察内容的理由",
  "extractedFacts":["只写明确事实"],
  "lockedEvidence":["不可修改的身份或结构证据"],
  "containsLegacyStyle":false,
  "legacyStyleShouldInfluenceOutput":false,
  "confidence":0.0,
  "requiresHumanReview":false
}]}

duplicate、irrelevant、legacy_visual_style_only 必须 keepInCorePack=false。
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
