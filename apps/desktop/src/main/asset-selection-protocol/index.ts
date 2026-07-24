import type {
  AssetSelectionProtocolResult,
  CurrentProjectAssetDecision,
  CurrentProjectAssetRole,
  CurrentProjectCorePack,
  CurrentProjectCorePackValidation,
  GenerationOutputType,
  ProjectAsset,
  ProjectRecord,
  ReferenceAssetDecision,
  ReferenceAssetRole,
  ReferenceMasterSet,
  ReferenceMasterSetValidation,
  StyleCarrier,
  StyleCarrierCategory,
  TaskReferenceSubset,
  TaskSubsetValidation
} from '../../shared/types.ts';
import path from 'node:path';
import sharp from 'sharp';

const OUTPUT_TYPES: GenerationOutputType[] = [
  'anchor_vi_system',
  'packaging_single',
  'packaging_series',
  'brand_poster',
  'product_poster',
  'vi_application',
  'spatial_scene',
  'digital_campaign'
];

const ROLE_OUTPUTS: Partial<Record<ReferenceAssetRole, GenerationOutputType[]>> = {
  system_overview: OUTPUT_TYPES,
  packaging: ['anchor_vi_system', 'packaging_single', 'packaging_series'],
  packaging_detail: ['packaging_single', 'packaging_series'],
  poster: ['anchor_vi_system', 'brand_poster', 'product_poster', 'digital_campaign'],
  vi_application: ['anchor_vi_system', 'vi_application', 'digital_campaign'],
  material_detail: ['packaging_single', 'packaging_series', 'spatial_scene'],
  typography_detail: ['brand_poster', 'product_poster', 'vi_application', 'digital_campaign'],
  graphic_detail: ['anchor_vi_system', 'brand_poster', 'vi_application', 'digital_campaign'],
  spatial: ['spatial_scene'],
  display_layout: ['vi_application', 'spatial_scene', 'digital_campaign'],
  photography_style: ['packaging_single', 'brand_poster', 'product_poster', 'digital_campaign']
};

const ROLE_CARRIERS: Partial<Record<ReferenceAssetRole, StyleCarrierCategory[]>> = {
  system_overview: ['color', 'layout', 'typography', 'graphic'],
  packaging: ['color', 'layout', 'typography', 'graphic', 'material'],
  packaging_detail: ['typography', 'graphic', 'material'],
  poster: ['color', 'layout', 'typography', 'graphic', 'photography'],
  vi_application: ['color', 'layout', 'typography', 'graphic', 'display'],
  material_detail: ['material'],
  typography_detail: ['typography'],
  graphic_detail: ['graphic'],
  spatial: ['material', 'display', 'spatial'],
  display_layout: ['layout', 'display'],
  photography_style: ['photography']
};

const DIRECT_ROLES: Record<GenerationOutputType, ReferenceAssetRole[]> = {
  anchor_vi_system: ['system_overview'],
  packaging_single: ['packaging', 'packaging_detail'],
  packaging_series: ['packaging', 'packaging_detail'],
  brand_poster: ['poster'],
  product_poster: ['photography_style'],
  vi_application: ['vi_application'],
  spatial_scene: ['spatial'],
  digital_campaign: ['poster']
};

function secondaryRolesFor(role: ReferenceAssetRole): ReferenceAssetRole[] {
  if (role === 'system_overview') return ['vi_application', 'packaging', 'display_layout', 'typography_detail', 'material_detail'];
  if (role === 'vi_application') return ['system_overview', 'packaging', 'display_layout', 'typography_detail', 'material_detail'];
  if (role === 'poster') return ['typography_detail', 'graphic_detail', 'photography_style'];
  if (role === 'packaging') return ['packaging_detail', 'typography_detail', 'graphic_detail', 'material_detail'];
  return [];
}

function boundedConfidence(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function hammingDistance(first: string, second: string): number {
  if (first.length !== second.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) distance += 1;
  }
  return distance;
}

export function groupReferenceNearDuplicates(
  decisions: ReferenceAssetDecision[],
  perceptualHashes: Record<string, string>,
  threshold = 6
): ReferenceAssetDecision[] {
  const groups: Array<{ id: string; hash: string }> = [];
  return decisions.map((decision) => {
    const hash = perceptualHashes[decision.assetId];
    if (!hash) return decision;
    const matched = groups.find((group) => hammingDistance(group.hash, hash) <= threshold);
    const group = matched || {
      id: `visual-similarity-${String(groups.length + 1).padStart(3, '0')}`,
      hash
    };
    if (!matched) groups.push(group);
    return { ...decision, duplicationGroupId: decision.duplicationGroupId || group.id };
  });
}

export async function detectReferenceNearDuplicates(
  decisions: ReferenceAssetDecision[],
  assets: ProjectAsset[],
  projectInputRoot: string
): Promise<ReferenceAssetDecision[]> {
  const hashes: Record<string, string> = {};
  await Promise.all(assets.map(async (asset) => {
    try {
      const pixels = await sharp(path.join(projectInputRoot, asset.relativePath))
        .rotate()
        .resize(9, 8, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer();
      let hash = '';
      for (let row = 0; row < 8; row += 1) {
        for (let column = 0; column < 8; column += 1) {
          const left = pixels[row * 9 + column]!;
          const right = pixels[row * 9 + column + 1]!;
          hash += left > right ? '1' : '0';
        }
      }
      hashes[asset.id] = hash;
    } catch {
      // Unsupported or damaged images remain eligible; the model decision still applies.
    }
  }));
  return groupReferenceNearDuplicates(decisions, hashes);
}

function currentRole(filename: string): CurrentProjectAssetRole {
  const name = filename.toLowerCase();
  if (/logo|标志|标识|商标/u.test(name)) return 'logo_evidence';
  if (/pack|包装|盒|瓶|袋|杯/u.test(name)) return 'packaging_structure_evidence';
  if (/product|产品|商品|sku/u.test(name)) return 'product_fact_evidence';
  if (/space|store|shop|空间|门店|导视/u.test(name)) return 'spatial_structure_evidence';
  if (/poster|menu|vi|touch|海报|菜单|物料/u.test(name)) return 'touchpoint_evidence';
  return 'uncertain';
}

function referenceRole(filename: string): ReferenceAssetRole {
  const name = filename.toLowerCase();
  if (/overview|system|全案|总览|规范/u.test(name)) return 'system_overview';
  if (/pack|包装|盒|瓶|袋/u.test(name)) return /detail|细节|局部/u.test(name) ? 'packaging_detail' : 'packaging';
  if (/poster|海报|kv/u.test(name)) return 'poster';
  if (/space|store|shop|空间|门店/u.test(name)) return 'spatial';
  if (/material|texture|材质|肌理/u.test(name)) return 'material_detail';
  if (/type|font|字体|字形/u.test(name)) return 'typography_detail';
  if (/graphic|pattern|图形|纹样/u.test(name)) return 'graphic_detail';
  if (/photo|摄影|影像/u.test(name)) return 'photography_style';
  if (/vi|application|应用/u.test(name)) return 'vi_application';
  return 'display_layout';
}

export function createFallbackCurrentProjectDecisions(
  assets: ProjectAsset[]
): CurrentProjectAssetDecision[] {
  const firstByHash = new Map<string, string>();
  return assets.filter((asset) => asset.status !== 'deleted' && /^image\//iu.test(asset.mimeType)).map((asset) => {
    const duplicateOf = firstByHash.get(asset.sha256);
    if (!duplicateOf) firstByHash.set(asset.sha256, asset.id);
    const role = duplicateOf ? 'duplicate' : currentRole(asset.originalName);
    const uncertain = role === 'uncertain';
    return {
      assetId: asset.id,
      filename: asset.originalName,
      role,
      roles: [role],
      keepInCorePack: !['duplicate', 'irrelevant', 'legacy_visual_style_only'].includes(role),
      includeInAnalysisEvidencePack: !['duplicate', 'irrelevant'].includes(role),
      includeInGenerationIdentityPack: !['duplicate', 'irrelevant', 'legacy_visual_style_only', 'touchpoint_evidence', 'spatial_structure_evidence'].includes(role),
      generationUsage: role === 'logo_evidence' || role === 'logo_typography_evidence' || role === 'brand_name_evidence'
        ? 'identity'
        : role === 'product_fact_evidence' ? 'product'
          : ['packaging_structure_evidence', 'product_structure_evidence'].includes(role) ? 'structure_only'
            : role === 'locked_asset_evidence' ? 'locked_asset' : 'exclude',
      keepReason: duplicateOf
        ? `与 ${duplicateOf} 内容重复`
        : uncertain ? '文件名不足以判定角色，保留并标记人工复核' : '包含当前项目事实或结构证据',
      extractedFacts: [],
      lockedEvidence: role === 'logo_evidence' ? ['当前项目 Logo'] : [],
      containsLegacyStyle: false,
      legacyStyleShouldInfluenceOutput: false,
      confidence: uncertain ? 0.55 : 0.82,
      requiresHumanReview: uncertain
    };
  });
}

export function createFallbackReferenceDecisions(assets: ProjectAsset[]): ReferenceAssetDecision[] {
  const firstByHash = new Map<string, string>();
  return assets.filter((asset) => asset.status !== 'deleted' && /^image\//iu.test(asset.mimeType)).map((asset) => {
    const duplicateOf = firstByHash.get(asset.sha256);
    if (!duplicateOf) firstByHash.set(asset.sha256, asset.id);
    const role = duplicateOf ? 'duplicate' : referenceRole(asset.originalName);
    return {
      assetId: asset.id,
      filename: asset.originalName,
      role,
      primaryRole: role,
      secondaryRoles: secondaryRolesFor(role),
      styleCarrierStrength: role === 'system_overview' ? 'high' : role === 'duplicate' ? 'low' : 'medium',
      includeInMasterSet: role !== 'duplicate',
      eligibleOutputTypes: ROLE_OUTPUTS[role] || [],
      representedStyleCarriers: ROLE_CARRIERS[role] || [],
      duplicationGroupId: duplicateOf ? `sha256:${assets.find((item) => item.id === duplicateOf)?.sha256}` : undefined,
      confidence: role === 'display_layout' ? 0.65 : 0.82,
      reason: duplicateOf ? `与 ${duplicateOf} 内容重复` : '作为参考视觉形式证据',
      requiresHumanReview: role === 'display_layout'
    };
  });
}

export function normalizeCurrentProjectDecisions(
  raw: CurrentProjectAssetDecision[],
  assets: ProjectAsset[]
): CurrentProjectAssetDecision[] {
  const fallback = createFallbackCurrentProjectDecisions(assets);
  const byId = new Map(raw.map((item) => [item.assetId, item]));
  return fallback.map((base) => {
    const item = byId.get(base.assetId);
    if (!item) return base;
    const role = item.role || base.role;
    return {
      ...base,
      ...item,
      filename: base.filename,
      role,
      roles: unique((item.roles || [role]) as string[]) as CurrentProjectAssetRole[],
      keepInCorePack: !['duplicate', 'irrelevant', 'legacy_visual_style_only'].includes(role)
        && Boolean(item.keepInCorePack),
      includeInAnalysisEvidencePack: !['duplicate', 'irrelevant'].includes(role),
      includeInGenerationIdentityPack: !['duplicate', 'irrelevant', 'legacy_visual_style_only', 'touchpoint_evidence', 'spatial_structure_evidence'].includes(role)
        && Boolean(item.keepInCorePack),
      generationUsage: item.generationUsage || base.generationUsage,
      extractedFacts: unique(item.extractedFacts || []),
      lockedEvidence: unique(item.lockedEvidence || []),
      legacyStyleShouldInfluenceOutput: false,
      confidence: boundedConfidence(item.confidence, base.confidence),
      requiresHumanReview: Boolean(item.requiresHumanReview) || boundedConfidence(item.confidence, 0) < 0.8
    };
  });
}

export function normalizeReferenceDecisions(
  raw: ReferenceAssetDecision[],
  assets: ProjectAsset[]
): ReferenceAssetDecision[] {
  const fallback = createFallbackReferenceDecisions(assets);
  const byId = new Map(raw.map((item) => [item.assetId, item]));
  return fallback.map((base) => {
    const item = byId.get(base.assetId);
    if (!item) return base;
    const role = item.role || base.role;
    return {
      ...base,
      ...item,
      filename: base.filename,
      role,
      primaryRole: role,
      secondaryRoles: unique((item.secondaryRoles || base.secondaryRoles || secondaryRolesFor(role)) as string[]) as ReferenceAssetRole[],
      includeInMasterSet: !['duplicate', 'irrelevant', 'pure_text_slide', 'brand_strategy_text'].includes(role)
        && Boolean(item.includeInMasterSet),
      eligibleOutputTypes: unique(item.eligibleOutputTypes || ROLE_OUTPUTS[role] || []) as GenerationOutputType[],
      representedStyleCarriers: unique(item.representedStyleCarriers || ROLE_CARRIERS[role] || []) as StyleCarrierCategory[],
      confidence: boundedConfidence(item.confidence, base.confidence),
      requiresHumanReview: Boolean(item.requiresHumanReview) || boundedConfidence(item.confidence, 0) < 0.8
    };
  });
}

function emptyTouchpoints() {
  return {
    primaryPackaging: [],
    secondaryPackaging: [],
    serviceMaterials: [],
    viApplications: [],
    spatialTouchpoints: [],
    digitalTouchpoints: []
  };
}

export function buildCurrentProjectCorePack(
  project: ProjectRecord,
  decisions: CurrentProjectAssetDecision[]
): CurrentProjectCorePack {
  const kept = decisions.filter((item) => item.keepInCorePack);
  const roles = (role: CurrentProjectAssetRole) => kept.filter((item) => item.role === role);
  const logoAssets = roles('logo_evidence');
  const logoTypography = roles('logo_typography_evidence');
  const structures = [...roles('packaging_structure_evidence'), ...roles('product_structure_evidence')];
  return {
    projectId: project.id,
    brandName: project.brandName || project.detectedBrandName || '',
    industry: project.industry || project.detectedIndustry || '',
    productFacts: unique([
      ...roles('product_fact_evidence').flatMap((item) => item.extractedFacts),
      ...(project.lockedFacts || [])
    ]),
    logoAssetIds: logoAssets.map((item) => item.assetId),
    logoTypographyAssetIds: logoTypography.map((item) => item.assetId),
    packagingStructures: structures.map((item) => ({
      assetId: item.assetId,
      description: item.extractedFacts.join('；') || item.keepReason,
      confidence: item.confidence
    })),
    productAssets: roles('product_fact_evidence').map((item) => item.assetId),
    touchpoints: emptyTouchpoints(),
    confirmedBrandCopy: unique(roles('brand_copy_evidence').flatMap((item) => item.extractedFacts)),
    lockedAssets: unique([
      ...(project.logoLocked ? ['当前项目原始 Logo'] : []),
      ...(project.logoFiles || []),
      ...(project.lockedFacts || []),
      ...kept.flatMap((item) => item.lockedEvidence)
    ]).map((name) => ({
      name,
      assetIds: kept.filter((item) => item.lockedEvidence.includes(name)
        || (item.role === 'logo_evidence' && /logo/i.test(name))).map((item) => item.assetId),
      reason: '当前项目身份或用户锁定事实'
    })),
    excludedLegacyStyleAssetIds: decisions.filter((item) => item.role === 'legacy_visual_style_only').map((item) => item.assetId),
    uncertainAssetIds: decisions.filter((item) => item.role === 'uncertain').map((item) => item.assetId),
    sourceAssetIds: kept.map((item) => item.assetId),
    schemaVersion: 'current-project-core-pack-v1'
  };
}

export function validateCurrentProjectCorePack(
  pack: CurrentProjectCorePack,
  decisions: CurrentProjectAssetDecision[]
): CurrentProjectCorePackValidation {
  const source = new Set(pack.sourceAssetIds);
  const warnings: string[] = [];
  const hasLogoEvidence = pack.logoAssetIds.length > 0 || pack.lockedAssets.some((item) => /logo|标志|标识/u.test(item.name));
  const hasLogoTypographyEvidence = pack.logoTypographyAssetIds.length > 0 || hasLogoEvidence;
  const hasProductFactEvidence = pack.productFacts.length > 0 || pack.productAssets.length > 0;
  const hasRequiredStructureEvidence = pack.packagingStructures.length > 0
    || Object.values(pack.touchpoints).some((items) => items.length > 0);
  if (!hasProductFactEvidence) warnings.push('核心资料包未识别到明确产品事实');
  if (!hasRequiredStructureEvidence) warnings.push('核心资料包未识别到明确结构或触点证据');
  if (pack.uncertainAssetIds.length) warnings.push(`${pack.uncertainAssetIds.length} 个当前项目资产需要人工确认`);
  const passed = Boolean(pack.brandName)
    && hasLogoEvidence
    && decisions.every((item) => item.role !== 'duplicate' || !source.has(item.assetId))
    && decisions.every((item) => item.role !== 'legacy_visual_style_only' || !source.has(item.assetId));
  return {
    hasBrandName: Boolean(pack.brandName),
    hasLogoEvidence,
    hasLogoTypographyEvidence,
    hasProductFactEvidence,
    hasRequiredStructureEvidence,
    hasLockedAssetEvidence: pack.lockedAssets.length > 0,
    excludesLegacyStyleOnlyAssets: decisions.every((item) => item.role !== 'legacy_visual_style_only' || !source.has(item.assetId)),
    excludesDuplicateAssets: decisions.every((item) => item.role !== 'duplicate' || !source.has(item.assetId)),
    noReferenceAssetsMixedIn: true,
    unresolvedUncertainAssets: pack.uncertainAssetIds,
    passed,
    warnings
  };
}

export function buildReferenceMasterSet(decisions: ReferenceAssetDecision[]): ReferenceMasterSet {
  const candidates = decisions.filter((item) => item.includeInMasterSet)
    .sort((a, b) => {
      const strength = { high: 3, medium: 2, low: 1 };
      return strength[b.styleCarrierStrength] - strength[a.styleCarrierStrength] || b.confidence - a.confidence;
    });
  const selected: ReferenceAssetDecision[] = [];
  const groups = new Set<string>();
  for (const item of candidates) {
    if (selected.length >= 12) break;
    if (item.duplicationGroupId && groups.has(item.duplicationGroupId)) continue;
    selected.push(item);
    if (item.duplicationGroupId) groups.add(item.duplicationGroupId);
  }
  const styleCarriers: StyleCarrier[] = [];
  for (const category of unique(selected.flatMap((item) => item.representedStyleCarriers)) as StyleCarrierCategory[]) {
    const support = selected.filter((item) => item.representedStyleCarriers.includes(category));
    styleCarriers.push({
      id: `style-carrier-${category}`,
      category,
      description: `${category} 的跨参考视觉规律`,
      priority: support.length >= 2 ? 'primary' : 'secondary',
      supportingAssetIds: support.map((item) => item.assetId),
      mustBeVisibleInOutput: support.length >= 2,
      confidence: Math.min(0.95, support.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, support.length))
    });
  }
  const primary = styleCarriers
    .filter((item) => item.priority === 'primary')
    .sort((a, b) => b.confidence - a.confidence);
  if (primary.length > 6) {
    for (const item of primary.slice(6)) {
      item.priority = 'secondary';
      item.mustBeVisibleInOutput = false;
    }
  }
  if (primary.length < 4) {
    const promotable = styleCarriers
      .filter((item) => item.priority !== 'primary')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, Math.max(0, Math.min(4, styleCarriers.length) - primary.length));
    for (const item of promotable) {
      item.priority = 'primary';
      item.mustBeVisibleInOutput = true;
    }
  }
  return {
    assetIds: selected.map((item) => item.assetId),
    decisions: selected,
    styleCarriers,
    schemaVersion: 'reference-master-set-v1'
  };
}

export function validateReferenceMasterSet(
  master: ReferenceMasterSet,
  allDecisions: ReferenceAssetDecision[]
): ReferenceMasterSetValidation {
  const roles = new Set(master.decisions.map((item) => item.role));
  const source = new Set(master.assetIds);
  const missingCoverageRoles: ReferenceAssetRole[] = [];
  if (!roles.has('packaging') && !roles.has('packaging_detail')) missingCoverageRoles.push('packaging');
  if (!roles.has('poster') && !roles.has('display_layout')) missingCoverageRoles.push('poster');
  if (!roles.has('material_detail') && !roles.has('packaging_detail')) missingCoverageRoles.push('material_detail');
  const warnings: string[] = [];
  if (master.assetIds.length < 6) warnings.push(`参考母集仅 ${master.assetIds.length} 张，按单参考降级模式运行`);
  if (missingCoverageRoles.length) warnings.push(`缺少参考覆盖：${missingCoverageRoles.join('、')}`);
  const groups = master.decisions.map((item) => item.duplicationGroupId).filter(Boolean);
  const excludesNearDuplicates = new Set(groups).size === groups.length;
  const passed = master.assetIds.length >= 1
    && allDecisions.every((item) => !['pure_text_slide', 'brand_strategy_text', 'duplicate'].includes(item.role)
      || !source.has(item.assetId))
    && excludesNearDuplicates;
  return {
    hasSystemOverview: roles.has('system_overview') || master.assetIds.length <= 2,
    hasCrossTouchpointCoverage: new Set(master.decisions.flatMap((item) => item.eligibleOutputTypes)).size >= 2,
    hasPrimaryStyleCarrierEvidence: master.styleCarriers.some((item) => item.priority === 'primary') || master.assetIds.length === 1,
    hasPackagingEvidence: roles.has('packaging') || roles.has('packaging_detail'),
    hasPosterOrLayoutEvidence: roles.has('poster') || roles.has('display_layout'),
    hasMaterialOrDetailEvidence: roles.has('material_detail') || roles.has('packaging_detail'),
    excludesPureTextSlides: allDecisions.every((item) => item.role !== 'pure_text_slide' || !source.has(item.assetId)),
    excludesBusinessAnalysisPages: allDecisions.every((item) => item.role !== 'brand_strategy_text' || !source.has(item.assetId)),
    excludesNearDuplicates,
    missingCoverageRoles,
    passed,
    warnings
  };
}

export function buildTaskReferenceSubsets(master: ReferenceMasterSet): {
  subsets: TaskReferenceSubset[];
  validations: TaskSubsetValidation[];
} {
  const primaryCarriers = master.styleCarriers.filter((item) => item.priority === 'primary');
  const subsets = OUTPUT_TYPES.map((outputType) => {
    const exact = master.decisions.filter((item) => DIRECT_ROLES[outputType].includes(item.primaryRole || item.role));
    const compatible = master.decisions.filter((item) =>
      !exact.includes(item)
      && item.eligibleOutputTypes.includes(outputType)
      && (item.secondaryRoles || []).some((role) => DIRECT_ROLES[outputType].includes(role)));
    const inferred = master.decisions.filter((item) =>
      !exact.includes(item) && !compatible.includes(item) && item.eligibleOutputTypes.includes(outputType));
    const matched = exact.length ? exact : compatible.length ? compatible : inferred;
    const pool = matched.length ? matched : master.decisions;
    const selected = pool.slice(0, master.assetIds.length === 1 ? 1 : 4);
    const primary = selected.find((item) => item.styleCarrierStrength === 'high') || selected[0];
    const covered = primaryCarriers.filter((carrier) =>
      selected.some((item) => carrier.supportingAssetIds.includes(item.assetId)));
    const matchLevel = exact.length ? 'exact'
      : compatible.length ? 'compatible'
        : inferred.length ? 'inferred' : 'insufficient';
    const confidence = selected.length
      ? selected.reduce((sum, item) => sum + item.confidence, 0) / selected.length
      : 0;
    return {
      outputType,
      selectedAssetIds: selected.map((item) => item.assetId),
      primaryReferenceAssetId: primary?.assetId || '',
      supportingReferenceAssetIds: selected.filter((item) => item.assetId !== primary?.assetId).map((item) => item.assetId),
      coveredPrimaryStyleCarrierIds: covered.map((item) => item.id),
      missingStyleCarrierIds: primaryCarriers.filter((item) => !covered.includes(item)).map((item) => item.id),
      selectionReason: matchLevel === 'exact'
        ? `选择主角色与 ${outputType} 精确匹配并覆盖主要风格载体的参考`
        : matchLevel === 'compatible'
          ? `选择包含 ${outputType} 对应触点与主要风格证据的兼容参考`
          : matchLevel === 'inferred'
            ? `没有同类或兼容参考，使用其他触点证据推导 ${outputType}`
            : `参考证据不足，当前仅保留最强证据并等待人工确认`,
      confidence,
      matchLevel,
      requiresHumanReview: matchLevel === 'inferred' || matchLevel === 'insufficient' || confidence < 0.8,
      coveredStyleCarrierIds: covered.map((item) => item.id),
      missingEvidence: matchLevel === 'exact' ? [] : [`缺少 ${outputType} 的主角色精确参考`]
    } satisfies TaskReferenceSubset;
  });
  const validations = subsets.map((subset) => {
    const selected = master.decisions.filter((item) => subset.selectedAssetIds.includes(item.assetId));
    const groups = selected.map((item) => item.duplicationGroupId).filter(Boolean);
    const matchesOutputType = selected.some((item) => item.eligibleOutputTypes.includes(subset.outputType));
    const assetCountValid = subset.selectedAssetIds.length === 1
      ? master.assetIds.length === 1
      : subset.selectedAssetIds.length >= 2 && subset.selectedAssetIds.length <= 4;
    const validation: TaskSubsetValidation = {
      matchesOutputType,
      hasHighStrengthPrimaryReference: selected.some((item) => item.styleCarrierStrength === 'high')
        || (master.assetIds.length === 1 && selected.length === 1),
      coversPrimaryStyleCarriers: subset.missingStyleCarrierIds.length === 0,
      avoidsCrossTypeNoise: selected.every((item) =>
        item.eligibleOutputTypes.includes(subset.outputType) || !matchesOutputType),
      avoidsNearDuplicates: new Set(groups).size === groups.length,
      assetCountValid,
      passed: false
    };
    validation.passed = validation.matchesOutputType
      && validation.avoidsCrossTypeNoise
      && validation.avoidsNearDuplicates
      && validation.assetCountValid;
    return validation;
  });
  return { subsets, validations };
}

export function assembleAssetSelectionProtocol(
  project: ProjectRecord,
  currentDecisions: CurrentProjectAssetDecision[],
  referenceDecisions: ReferenceAssetDecision[]
): AssetSelectionProtocolResult {
  const currentProjectCorePack = buildCurrentProjectCorePack(project, currentDecisions);
  const currentCorePackValidation = validateCurrentProjectCorePack(currentProjectCorePack, currentDecisions);
  const referenceMasterSet = buildReferenceMasterSet(referenceDecisions);
  const referenceMasterSetValidation = validateReferenceMasterSet(referenceMasterSet, referenceDecisions);
  const { subsets, validations } = buildTaskReferenceSubsets(referenceMasterSet);
  return {
    currentProjectAssetDecisions: currentDecisions,
    currentProjectCorePack,
    currentCorePackValidation,
    referenceAssetDecisions: referenceDecisions,
    referenceMasterSet,
    referenceMasterSetValidation,
    taskReferenceSubsets: subsets,
    taskSubsetValidations: validations,
    requiresHumanConfirmation: [
      ...currentDecisions.map((item) => item.confidence),
      ...referenceDecisions.map((item) => item.confidence)
    ].some((confidence) => confidence < 0.8)
      || currentDecisions.some((item) => item.requiresHumanReview)
      || referenceDecisions.some((item) => item.requiresHumanReview),
    schemaVersion: 'asset-selection-protocol-v1'
  };
}

export function assertAssetSelectionProtocol(protocol: AssetSelectionProtocolResult): void {
  if (!protocol.currentCorePackValidation.passed) {
    throw Object.assign(new Error('当前项目核心资料包不完整或混入旧视觉样式、重复素材'), {
      code: protocol.currentCorePackValidation.excludesLegacyStyleOnlyAssets
        && protocol.currentCorePackValidation.excludesDuplicateAssets
        ? 'CURRENT_CORE_PACK_INCOMPLETE'
        : 'CURRENT_CORE_PACK_CONTAMINATED'
    });
  }
  if (!protocol.referenceMasterSetValidation.passed) {
    throw Object.assign(new Error('参考母集不足：没有可用于风格分析的有效视觉证据'), {
      code: 'REFERENCE_MASTER_SET_INSUFFICIENT'
    });
  }
}
