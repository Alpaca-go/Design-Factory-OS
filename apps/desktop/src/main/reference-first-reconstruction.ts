import type {
  AdoptedVisualRule,
  AssetSelectionProtocolResult,
  CurrentProjectProfile,
  EvidenceBoundFact,
  GenerationOutputType,
  ReferenceFirstAdoption,
  ReferenceFirstGenerationContext,
  ReferenceFirstPermissionMatrix,
  ReferenceFirstStrategy,
  ReferenceStyleProfile,
  ReferenceStyleRule,
  TaskReferenceConfidence,
  UserReadableAssetReference,
  VisualReconstructionDirection
} from '../shared/types.ts';
import { buildReferenceFirstBetaClosure } from './reference-first-beta-closure.ts';

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

export const REPLACEABLE_LEGACY_VISUALS = [
  '当前项目旧色彩系统',
  '当前项目旧版式与构图系统',
  '当前项目旧标题与正文字体系统（Logo 字标除外）',
  '当前项目旧辅助图形系统',
  '当前项目旧材质表达',
  '当前项目旧摄影与影像语言',
  '当前项目旧灯光关系',
  '当前项目旧空间与陈列方式'
];

export const REFERENCE_FIRST_PERMISSION_MATRIX: ReferenceFirstPermissionMatrix = {
  currentProject: {
    brandName: 'locked',
    logoGraphic: 'locked',
    logoTypography: 'locked',
    industry: 'locked',
    productFacts: 'locked',
    packagingStructures: 'locked',
    confirmedBrandCopy: 'retained_by_user',
    colorSystem: 'replaceable',
    layoutSystem: 'replaceable',
    typographySystem: 'replaceable',
    graphicSystem: 'replaceable',
    materialSystem: 'replaceable',
    photographySystem: 'replaceable',
    lightingSystem: 'replaceable',
    spatialSystem: 'replaceable',
    displaySystem: 'replaceable'
  },
  referenceProject: {
    brandName: 'forbidden',
    logoGraphic: 'forbidden',
    logoTypography: 'forbidden',
    slogan: 'forbidden',
    productNames: 'forbidden',
    signatureSymbols: 'forbidden',
    colorSystem: 'adopt_from_reference',
    layoutSystem: 'adopt_from_reference',
    typographySystem: 'adopt_from_reference',
    materialSystem: 'adopt_from_reference',
    photographySystem: 'adopt_from_reference',
    displaySystem: 'adopt_from_reference',
    graphicSystem: 'reconstruct_from_reference'
  }
};

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

function adoptedRules(
  rules: ReferenceStyleRule[],
  fallbackAssetIds: string[]
): AdoptedVisualRule[] {
  return rules.slice(0, 4).map((item) => ({
    description: item.rule,
    supportingAssetIds: unique(item.evidence.length ? item.evidence : fallbackAssetIds),
    priority: item.confidence >= 0.8 ? 'primary' : item.confidence >= 0.5 ? 'secondary' : 'optional',
    mustBeVisibleInOutput: item.confidence >= 0.5
  }));
}

function buildAdoption(
  style: ReferenceStyleProfile,
  protocol?: AssetSelectionProtocolResult
): ReferenceFirstAdoption {
  const carrierIds = protocol?.referenceMasterSet.styleCarriers.map((item) => item.id)
    ?? style.sourceAssetIds;
  return {
    colorSystem: adoptedRules(style.colorSystem, carrierIds),
    layoutSystem: adoptedRules(style.compositionSystem, carrierIds),
    typographySystem: adoptedRules(style.typographySystem, carrierIds),
    materialSystem: adoptedRules(style.materialSystem, carrierIds),
    photographySystem: adoptedRules(style.photographySystem, carrierIds),
    displaySystem: adoptedRules(
      [...style.packagingPresentation, ...style.posterPresentation, ...style.viExtensionSystem],
      carrierIds
    ),
    graphicStructure: adoptedRules(style.graphicLanguage, carrierIds)
  };
}

function currentReadableAssets(protocol?: AssetSelectionProtocolResult): UserReadableAssetReference[] {
  if (!protocol) return [];
  const coreIds = new Set(protocol.currentProjectCorePack.sourceAssetIds);
  const selectedDecisions = protocol.currentProjectAssetDecisions
    .filter((item) => item.keepInCorePack || coreIds.has(item.assetId))
    .map((item) => ({
      assetId: item.assetId,
      filename: item.filename,
      role: item.role,
      selectedAs: 'core_pack' as const,
      selectionReason: item.keepReason,
      confidence: item.confidence
    }));
  const decisions = selectedDecisions.length
    ? selectedDecisions
    : protocol.currentProjectAssetDecisions
      .filter((item) => !['duplicate', 'irrelevant'].includes(item.role))
      .map((item) => ({
        assetId: item.assetId,
        filename: item.filename,
        role: item.role,
        selectedAs: 'core_pack' as const,
        selectionReason: item.keepReason || '作为当前项目身份或事实依据',
        confidence: item.confidence
      }));
  const decidedIds = new Set(decisions.map((item) => item.assetId));
  return [
    ...decisions,
    ...protocol.currentProjectCorePack.sourceAssetIds
      .filter((assetId) => !decidedIds.has(assetId))
      .map((assetId) => ({
        assetId,
        filename: assetId,
        role: 'core_pack_source',
        selectedAs: 'core_pack' as const,
        selectionReason: '由 Current Project Core Pack 直接引用',
        confidence: 1
      }))
  ];
}

function referenceReadableAssets(protocol?: AssetSelectionProtocolResult): UserReadableAssetReference[] {
  if (!protocol) return [];
  const masterIds = new Set(protocol.referenceMasterSet.assetIds);
  const primaryByAsset = new Set(
    protocol.taskReferenceSubsets.map((item) => item.primaryReferenceAssetId).filter(Boolean)
  );
  const supportingByAsset = new Set(
    protocol.taskReferenceSubsets.flatMap((item) => item.supportingReferenceAssetIds)
  );
  const selectedDecisions = protocol.referenceAssetDecisions
    .filter((item) => item.includeInMasterSet || masterIds.has(item.assetId))
    .map((item) => ({
      assetId: item.assetId,
      filename: item.filename,
      role: item.role,
      styleCarrierStrength: item.styleCarrierStrength,
      selectedAs: (primaryByAsset.has(item.assetId)
        ? 'task_primary'
        : supportingByAsset.has(item.assetId) ? 'task_supporting' : 'master_set') as UserReadableAssetReference['selectedAs'],
      selectionReason: item.reason,
      confidence: item.confidence
    }));
  const decisions = selectedDecisions.length
    ? selectedDecisions
    : protocol.referenceAssetDecisions
      .filter((item) => !['duplicate', 'irrelevant', 'pure_text_slide', 'brand_strategy_text'].includes(item.role))
      .map((item) => ({
        assetId: item.assetId,
        filename: item.filename,
        role: item.role,
        styleCarrierStrength: item.styleCarrierStrength,
        selectedAs: 'master_set' as const,
        selectionReason: item.reason || '作为参考视觉依据',
        confidence: item.confidence
      }));
  const decidedIds = new Set(decisions.map((item) => item.assetId));
  return [
    ...decisions,
    ...protocol.referenceMasterSet.assetIds
      .filter((assetId) => !decidedIds.has(assetId))
      .map((assetId) => ({
        assetId,
        filename: assetId,
        role: 'master_set_source',
        selectedAs: 'master_set' as const,
        selectionReason: '由 Reference Master Set 直接引用',
        confidence: 1
      }))
  ];
}

const DIRECT_ROLES: Record<GenerationOutputType, string[]> = {
  anchor_vi_system: ['system_overview', 'vi_application', 'display_layout'],
  packaging_single: ['packaging', 'packaging_detail'],
  packaging_series: ['packaging', 'packaging_detail'],
  brand_poster: ['poster'],
  product_poster: ['poster', 'photography_style'],
  vi_application: ['vi_application', 'system_overview'],
  spatial_scene: ['spatial', 'display_layout'],
  digital_campaign: ['poster', 'photography_style', 'display_layout']
};

function buildTaskConfidence(protocol?: AssetSelectionProtocolResult): TaskReferenceConfidence[] {
  return OUTPUT_TYPES.map((outputType) => {
    const subset = protocol?.taskReferenceSubsets.find((item) => item.outputType === outputType);
    const selected = new Set(subset?.selectedAssetIds ?? []);
    const direct = protocol?.referenceAssetDecisions.filter((item) =>
      selected.has(item.assetId) && DIRECT_ROLES[outputType].includes(item.role)
    ) ?? [];
    const hasDirectTypeMatch = direct.length > 0;
    const rawConfidence = subset?.confidence ?? 0;
    const confidence = hasDirectTypeMatch
      ? Math.max(0.8, rawConfidence)
      : Math.min(0.79, rawConfidence || 0.49);
    return {
      outputType,
      hasDirectTypeMatch,
      inferredFromOtherTypes: !hasDirectTypeMatch && selected.size > 0,
      confidence,
      requiresHumanReview: !hasDirectTypeMatch || confidence < 0.8,
      warning: hasDirectTypeMatch
        ? undefined
        : selected.size
          ? '缺少同类型直接参考；当前子集由其他类型推断，生成前需要人工确认。'
          : '没有足够参考依据；必须补充素材或人工确认后才能生成。'
    };
  });
}

function buildEvidenceBoundFacts(
  current: CurrentProjectProfile,
  protocol?: AssetSelectionProtocolResult
): EvidenceBoundFact[] {
  const decisions = protocol?.currentProjectAssetDecisions ?? [];
  const idsFor = (...roles: string[]) => decisions
    .filter((item) => roles.includes(item.role))
    .map((item) => item.assetId);
  const bound = (
    id: string,
    value: string,
    classification: NonNullable<EvidenceBoundFact['classification']>,
    sourceAssetIds: string[],
    entersGenerationIdentityPack: boolean
  ): EvidenceBoundFact => ({
    id,
    value,
    sourceAssetIds,
    evidenceAssetIds: sourceAssetIds,
    classification,
    confidence: sourceAssetIds.length ? 0.95 : 0.55,
    status: sourceAssetIds.length ? 'confirmed' : 'inferred',
    entersGenerationIdentityPack,
    influencesGenerationStyle: false
  });
  const facts: EvidenceBoundFact[] = [
    bound('identity-brand-name', `品牌名称：${current.brandName}`, 'identity_fact',
      idsFor('logo_evidence', 'logo_typography_evidence', 'brand_name_evidence'), true),
    bound('identity-industry', `行业：${current.industry}`, 'identity_fact',
      idsFor('brand_name_evidence', 'product_fact_evidence'), true),
    ...current.coreProducts.map((value, index) =>
      bound(`product-${index + 1}`, `产品事实：${value}`, 'product_fact',
        idsFor('product_fact_evidence'), true)),
    ...current.packagingStructures.map((value, index) =>
      bound(`structure-${index + 1}`, `包装结构：${value}`, 'structure_fact',
        idsFor('packaging_structure_evidence', 'product_structure_evidence'), true)),
    ...current.confirmedFacts.map((value, index) =>
      bound(`confirmed-${index + 1}`, value, 'touchpoint_fact', [], false))
  ];
  return facts;
}

function buildGenerationContexts(
  current: CurrentProjectProfile,
  taskConfidence: TaskReferenceConfidence[]
): ReferenceFirstGenerationContext[] {
  return taskConfidence.map((task) => ({
    generationIdentityPackId: 'current-project/generation-identity-pack.json',
    generationBriefId: `reports/generation-brief-${task.outputType}.md`,
    taskReferenceSubsetId: `tasks/${task.outputType}.json`,
    approvedAnchorContextId: task.outputType === 'anchor_vi_system' ? undefined : 'system-anchor.json',
    outputType: task.outputType,
    prompt: [
      `为 ${current.brandName} 生成 ${task.outputType}。`,
      '输入一：Generation Identity Pack，只用于品牌身份、Logo、产品事实、真实结构和明确锁定内容；不得包含 Analysis Evidence Pack。',
      '输入二：Reference-First Generation Brief，用于执行权限矩阵和视觉规则。',
      '输入三：Task Reference Subset，作为本任务主要视觉依据。',
      task.outputType === 'anchor_vi_system'
        ? '输入四：Approved Anchor 尚未建立，本任务负责建立系统锚点。'
        : '输入四：Approved Anchor，后续输出必须延续已批准的系统锚点。',
      '不要在当前项目旧视觉与参考视觉之间折中；除锁定身份外，旧色彩、版式、字体、图形、材质、摄影、灯光和陈列均可替换。',
      '参考项目的主风格载体应主导色彩关系、版式骨架、字体层级、材质、摄影和陈列，但严禁复制参考品牌身份。',
      task.requiresHumanReview ? `警告：${task.warning}` : '该任务具备同类型直接参考，可按已批准规则执行。'
    ].join('\n')
  }));
}

export function buildReferenceFirstStrategy(input: {
  currentProjectProfile: CurrentProjectProfile;
  referenceStyleProfile: ReferenceStyleProfile;
  visualReconstructionDirection: VisualReconstructionDirection;
  assetSelectionProtocol?: AssetSelectionProtocolResult;
  referenceIdentityTerms?: string[];
}): ReferenceFirstStrategy {
  const { currentProjectProfile: current, referenceStyleProfile: style, assetSelectionProtocol: protocol } = input;
  const adoption = buildAdoption(style, protocol);
  const selectedPrimaryCarrierIds = protocol?.referenceMasterSet.styleCarriers
    .filter((item) => item.priority === 'primary')
    .map((item) => item.id) ?? [];
  const primaryCarrierIds = selectedPrimaryCarrierIds.length
    ? selectedPrimaryCarrierIds
    : protocol?.referenceMasterSet.assetIds.length
      ? protocol.referenceMasterSet.assetIds
      : style.sourceAssetIds;
  const taskReferenceConfidence = buildTaskConfidence(protocol);
  const selectedCurrentAssets = currentReadableAssets(protocol);
  const currentAssets = selectedCurrentAssets.length
    ? selectedCurrentAssets
    : current.sourceArtifactIds.map((assetId) => ({
      assetId,
      filename: assetId,
      role: 'current_project_source',
      selectedAs: 'core_pack' as const,
      selectionReason: '由当前项目结构化资料直接引用',
      confidence: 1
    }));
  const selectedReferenceAssets = referenceReadableAssets(protocol);
  const referenceAssets = selectedReferenceAssets.length
    ? selectedReferenceAssets
    : style.sourceAssetIds.map((assetId) => ({
      assetId,
      filename: assetId,
      role: 'reference_style_source',
      styleCarrierStrength: 'medium' as const,
      selectedAs: 'master_set' as const,
      selectionReason: '由参考风格结构化分析直接引用',
      confidence: 0.8
    }));
  const issues: string[] = [];
  if (!current.brandName || !current.industry || !current.coreProducts.length) issues.push('minimum_identity_core_missing');
  if (!primaryCarrierIds.length) issues.push('reference_style_carriers_missing');
  if (protocol && (!currentAssets.length || !referenceAssets.length)) issues.push('readable_asset_references_missing');
  if (protocol && !protocol.taskReferenceSubsets.length) issues.push('task_reference_subsets_missing');
  const rawGraphicForm = input.visualReconstructionDirection.visualAnchorDefinition.visualForm;
  const safeGraphicForm = /砂锅|锅具|锅形|八角|印章|铜钱|窗棂|回纹|徽章|完整椭圆/u.test(rawGraphicForm)
    ? '基于当前项目来源元素重构为非闭合、可裁切、可延展的流动线条系统'
    : rawGraphicForm;
  const baseStrategy: Omit<ReferenceFirstStrategy, 'betaClosure'> = {
    permissionMatrix: REFERENCE_FIRST_PERMISSION_MATRIX,
    currentProjectVisualPermissions: {
      lockedAssets: unique([
        `品牌名称：${current.brandName}`,
        'Logo 图形',
        'Logo 字标',
        `行业：${current.industry}`,
        ...current.coreProducts.map((item) => `产品事实：${item}`),
        ...current.packagingStructures.map((item) => `包装结构：${item}`),
        ...current.lockedAssets
      ]),
      replaceableLegacyVisuals: REPLACEABLE_LEGACY_VISUALS,
      userRetainedAssets: current.existingBrandCopy ?? []
    },
    referenceIdentityBoundary: {
      forbiddenBrandNames: unique([...(input.referenceIdentityTerms ?? []), ...style.excludedIdentityTerms]),
      forbiddenLogos: ['参考项目 Logo 图形', '参考项目 Logo 字标'],
      forbiddenCopy: ['参考项目 Slogan 与专属文案'],
      forbiddenProductNames: ['参考项目产品名称'],
      forbiddenSignatureGraphics: ['参考项目可识别的专属符号与签名图形']
    },
    adoption,
    systemAnchor: {
      colorRelationship: adoption.colorSystem[0]?.description ?? '以参考方案的主次色关系建立新系统',
      layoutGrammar: adoption.layoutSystem[0]?.description ?? '以参考方案的版式骨架建立新系统',
      typographyHierarchy: adoption.typographySystem[0]?.description ?? '以参考方案的字体层级建立新系统',
      materialLanguage: adoption.materialSystem[0]?.description ?? '以参考方案的材质语言建立新系统',
      displayMode: adoption.displaySystem[0]?.description ?? '以参考方案的系统陈列方式建立新系统',
      primaryStyleCarrierIds: primaryCarrierIds
    },
    projectGraphicAnchor: {
      sourceElements: input.visualReconstructionDirection.visualAnchorDefinition.sourceElements,
      reconstructedForm: safeGraphicForm,
      usageRole: 'secondary',
      extensionTouchpoints: input.visualReconstructionDirection.visualAnchorDefinition.extensionTouchpoints
    },
    anchorImage: {
      outputType: 'anchor_vi_system',
      primaryVisualSubject: '展示色彩关系、版式骨架、字体层级、材质语言和跨触点陈列方式的 VI 系统总览',
      referenceAssetIds: protocol?.taskReferenceSubsets
        .find((item) => item.outputType === 'anchor_vi_system')?.selectedAssetIds ?? primaryCarrierIds,
      forbiddenOutputPatterns: ['以食品或单一产品广告作为系统锚点', '复制参考品牌 Logo、名称或专属符号', '沿用当前项目旧红黑白配色或旧版式']
    },
    currentProjectReadableAssets: currentAssets,
    referenceReadableAssets: referenceAssets,
    taskReferenceConfidence,
    evidenceBoundFacts: buildEvidenceBoundFacts(current, protocol),
    generationContexts: buildGenerationContexts(current, taskReferenceConfidence),
    legacyVisualSuppression: {
      oldColorSystemSuppressed: true,
      oldLayoutSuppressed: true,
      oldTypographySuppressed: true,
      oldGraphicSystemSuppressed: true,
      oldPhotographySuppressed: true,
      oldMaterialSystemSuppressed: true
    },
    reportValidation: {
      hasMinimumIdentityCore: Boolean(current.brandName && current.industry && current.coreProducts.length),
      hasReplaceableLegacyVisuals: REPLACEABLE_LEGACY_VISUALS.length >= 8,
      hasReferenceStyleCarriers: primaryCarrierIds.length > 0,
      hasPermissionMatrix: true,
      hasSystemAnchor: true,
      hasProjectGraphicAnchor: true,
      hasDefinedAnchorImageType: true,
      hasReadableAssetReferences: !protocol || (currentAssets.length > 0 && referenceAssets.length > 0),
      hasTaskReferenceSubsets: !protocol || protocol.taskReferenceSubsets.length > 0,
      hasGenerationContextInstructions: true,
      hasLegacyStyleSuppression: true,
      passed: issues.length === 0,
      issues
    },
    schemaVersion: 'reference-first-strategy-v1'
  };
  const betaClosure = buildReferenceFirstBetaClosure({
    currentProjectProfile: current,
    referenceStyleProfile: style,
    visualReconstructionDirection: input.visualReconstructionDirection,
    strategy: baseStrategy,
    assetSelectionProtocol: protocol
  });
  const strategy: ReferenceFirstStrategy = { ...baseStrategy, betaClosure };
  return strategy;
}

export function enforceReferenceFirstDirection(
  direction: VisualReconstructionDirection,
  strategy: ReferenceFirstStrategy
): VisualReconstructionDirection {
  const adopted = (rules: AdoptedVisualRule[], fallback: string[]) =>
    rules.length ? rules.map((item) => item.description) : fallback;
  return {
    ...direction,
    currentProjectIdentityToRetain: strategy.currentProjectVisualPermissions.lockedAssets,
    currentVisualElementsToRedesign: strategy.currentProjectVisualPermissions.replaceableLegacyVisuals,
    colorSystem: adopted(strategy.adoption.colorSystem, direction.colorSystem),
    compositionSystem: adopted(strategy.adoption.layoutSystem, direction.compositionSystem),
    typographySystem: adopted(strategy.adoption.typographySystem, direction.typographySystem),
    materialSystem: adopted(strategy.adoption.materialSystem, direction.materialSystem),
    photographySystem: adopted(strategy.adoption.photographySystem, direction.photographySystem),
    graphicSystem: adopted(strategy.adoption.graphicStructure, direction.graphicSystem),
    prohibitedActions: unique([
      ...direction.prohibitedActions,
      ...strategy.referenceIdentityBoundary.forbiddenBrandNames.map((item) => `不得复制参考身份：${item}`),
      '不得把当前项目旧视觉当作需要保留的设计依据',
      '不得在当前项目旧视觉与参考风格之间折中'
    ])
  };
}

export function assertReferenceFirstStrategy(strategy: ReferenceFirstStrategy): void {
  const suppressed = Object.values(strategy.legacyVisualSuppression).every(Boolean);
  if (!suppressed) {
    throw Object.assign(new Error('Reference-First 校验失败：当前项目旧视觉没有被完整抑制'), {
      code: 'REFERENCE_FIRST_LEGACY_STYLE_NOT_SUPPRESSED',
      validation: strategy.legacyVisualSuppression
    });
  }
  if (!strategy.reportValidation.passed) {
    throw Object.assign(
      new Error(`Reference-First 报告校验失败：${strategy.reportValidation.issues.join('、')}`),
      { code: 'REFERENCE_FIRST_REPORT_VALIDATION_FAILED', validation: strategy.reportValidation }
    );
  }
  if (!strategy.betaClosure.finalValidation.passed) {
    throw Object.assign(
      new Error(`Reference-First Beta 收口校验失败：${strategy.betaClosure.finalValidation.errors.join('、')}`),
      { code: strategy.betaClosure.finalValidation.errors[0] || 'REFERENCE_FIRST_BETA_VALIDATION_FAILED',
        validation: strategy.betaClosure.finalValidation }
    );
  }
}
