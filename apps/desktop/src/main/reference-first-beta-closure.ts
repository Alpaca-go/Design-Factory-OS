import type {
  AssetSelectionProtocolResult,
  BrandCopyRecord,
  CurrentProjectAssetRole,
  CurrentProjectProfile,
  EvidenceBoundFact,
  GenerationOutputType,
  ReferenceFirstBetaClosure,
  ReferenceFirstStrategy,
  ReferenceStyleProfile,
  StyleCarrier,
  TouchpointVisualRule,
  VisualReconstructionDirection
} from '../shared/types.ts';

export const PRIMARY_STYLE_CARRIER_MIN = 4;
export const PRIMARY_STYLE_CARRIER_MAX = 6;
export const GENERATION_BRIEF_TARGET_CHARS = 6000;
export const GENERATION_BRIEF_MAX_CHARS = 10000;

const LEGACY_ROLES: CurrentProjectAssetRole[] = [
  'legacy_visual_style_only',
  'touchpoint_evidence',
  'spatial_structure_evidence'
];
const SIGNATURE_GRAPHIC_PATTERN = /砂锅|锅具|锅形|八角|印章|铜钱|窗棂|回纹|专属装饰带/u;

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const list = (values: string[], fallback = '无') =>
  values.length ? values.map((value) => `- ${value}`).join('\n') : `- ${fallback}`;

function readableFilename(filename: string) {
  const displayName = filename.normalize('NFKC').replace(/[\u0000-\u001f]/gu, '').trim() || '未命名素材';
  return {
    originalName: filename,
    normalizedName: displayName.replace(/[<>:"/\\|?*]/gu, '_'),
    displayName
  };
}

function generationUsage(roles: CurrentProjectAssetRole[], locked: boolean) {
  if (locked) return 'locked_asset' as const;
  if (roles.some((role) => ['logo_evidence', 'logo_typography_evidence', 'brand_name_evidence'].includes(role))) {
    return 'identity' as const;
  }
  if (roles.includes('product_fact_evidence')) return 'product' as const;
  if (roles.some((role) => ['packaging_structure_evidence', 'product_structure_evidence'].includes(role))) {
    return 'structure_only' as const;
  }
  return 'exclude' as const;
}

function preciseEvidenceFacts(
  current: CurrentProjectProfile,
  protocol?: AssetSelectionProtocolResult
): EvidenceBoundFact[] {
  const decisions = protocol?.currentProjectAssetDecisions ?? [];
  const idsFor = (...roles: CurrentProjectAssetRole[]) =>
    decisions.filter((item) => roles.includes(item.role)).map((item) => item.assetId);
  const fact = (
    id: string,
    value: string,
    classification: NonNullable<EvidenceBoundFact['classification']>,
    evidenceAssetIds: string[],
    entersGenerationIdentityPack: boolean
  ): EvidenceBoundFact => ({
    id,
    value,
    sourceAssetIds: evidenceAssetIds,
    evidenceAssetIds,
    classification,
    confidence: evidenceAssetIds.length ? 0.95 : 0.55,
    status: evidenceAssetIds.length ? 'confirmed' : 'inferred',
    entersGenerationIdentityPack,
    influencesGenerationStyle: false
  });
  return [
    fact('identity-brand-name', `品牌名称：${current.brandName}`, 'identity_fact',
      idsFor('logo_evidence', 'logo_typography_evidence', 'brand_name_evidence'), true),
    fact('identity-industry', `行业：${current.industry}`, 'identity_fact',
      idsFor('brand_name_evidence', 'product_fact_evidence'), true),
    ...current.coreProducts.map((value, index) =>
      fact(`product-${index + 1}`, `产品事实：${value}`, 'product_fact',
        idsFor('product_fact_evidence'), true)),
    ...current.packagingStructures.map((value, index) =>
      fact(`structure-${index + 1}`, `包装结构：${value}`, 'structure_fact',
        idsFor('packaging_structure_evidence', 'product_structure_evidence'), true))
  ];
}

function carrierRanking(
  strategy: Omit<ReferenceFirstStrategy, 'betaClosure'>,
  protocol?: AssetSelectionProtocolResult
): StyleCarrier[] {
  const source = [...(protocol?.referenceMasterSet.styleCarriers ?? [])];
  const adopted = [
    ...strategy.adoption.colorSystem,
    ...strategy.adoption.layoutSystem,
    ...strategy.adoption.typographySystem,
    ...strategy.adoption.materialSystem,
    ...strategy.adoption.displaySystem,
    ...strategy.adoption.photographySystem
  ];
  for (const [index, item] of adopted.entries()) {
    if (source.some((carrier) => carrier.description === item.description)) continue;
    source.push({
      id: `style-carrier-adopted-${index + 1}`,
      category: index === 0 ? 'color' : index === 1 ? 'layout' : index === 2 ? 'typography' : 'display',
      description: item.description,
      priority: item.priority,
      supportingAssetIds: item.supportingAssetIds,
      mustBeVisibleInOutput: item.mustBeVisibleInOutput,
      confidence: item.priority === 'primary' ? 0.9 : item.priority === 'secondary' ? 0.75 : 0.6
    });
  }
  const sorted = source.sort((a, b) => b.confidence - a.confidence);
  const primaryCount = Math.min(PRIMARY_STYLE_CARRIER_MAX, Math.max(PRIMARY_STYLE_CARRIER_MIN, Math.min(sorted.length, 5)));
  return sorted.map((item, index) => ({
    ...item,
    priority: index < primaryCount ? 'primary' : item.category === 'photography' ? 'optional' : 'secondary',
    mustBeVisibleInOutput: index < primaryCount
  }));
}

function touchpointRules(): TouchpointVisualRule[] {
  return [
    { outputType: 'anchor_vi_system', primarySubjectType: 'graphic_system', productPhotographyAllowed: false, productPhotographyMayDominate: false },
    { outputType: 'packaging_single', primarySubjectType: 'material_system', productPhotographyAllowed: true, productPhotographyMayDominate: false },
    { outputType: 'packaging_series', primarySubjectType: 'material_system', productPhotographyAllowed: true, productPhotographyMayDominate: false },
    { outputType: 'brand_poster', primarySubjectType: 'typography', productPhotographyAllowed: true, productPhotographyMayDominate: false },
    { outputType: 'product_poster', primarySubjectType: 'product', productPhotographyAllowed: true, productPhotographyMayDominate: true },
    { outputType: 'vi_application', primarySubjectType: 'graphic_system', productPhotographyAllowed: false, productPhotographyMayDominate: false },
    { outputType: 'spatial_scene', primarySubjectType: 'space', productPhotographyAllowed: false, productPhotographyMayDominate: false },
    { outputType: 'digital_campaign', primarySubjectType: 'typography', productPhotographyAllowed: true, productPhotographyMayDominate: false }
  ];
}

function compileAudit(
  current: CurrentProjectProfile,
  style: ReferenceStyleProfile,
  direction: VisualReconstructionDirection,
  facts: EvidenceBoundFact[],
  strategy: Omit<ReferenceFirstStrategy, 'betaClosure'>,
  protocol: AssetSelectionProtocolResult | undefined,
  closure: Omit<ReferenceFirstBetaClosure, 'analysisAuditMarkdown' | 'generationBriefMarkdown' | 'finalValidation'>
) {
  const styleSummary = (title: string, rules: ReferenceStyleProfile['colorSystem']) =>
    `### ${title}\n${rules.map((item) =>
      `- ${item.rule}\n  - 设计作用：${item.designEffect}`
    ).join('\n') || '- 无明确规则'}`;
  const taskSubsets = (protocol?.taskReferenceSubsets ?? []).map((subset) =>
    `- ${subset.outputType}｜${subset.matchLevel ?? 'legacy'}｜${subset.selectedAssetIds.length} 张｜${subset.selectionReason}`
  );
  const styleApplications = [
    { label: '主体', value: direction.visualAnchor },
    ...[
      ...direction.colorSystem,
      ...direction.compositionSystem,
      ...direction.graphicSystem,
      ...direction.typographySystem,
      ...direction.materialSystem,
      ...direction.photographySystem
    ].map((value) => ({ label: '视觉系统', value }))
  ].slice(0, 10);
  return `# ${current.projectName}-参考主导视觉重构分析审计报告

## 1. 项目锁定信息
- 品牌：${current.brandName}
- 行业：${current.industry}
- 核心产品：${current.coreProducts.join('、') || '未确认'}
- 目标用户：${current.targetAudience.join('、') || '未确认'}
- 品牌定位：${current.brandPositioning || '未确认'}
- Locked Assets：${current.lockedAssets.join('、') || '无'}
- 包装结构：${current.packagingStructures.join('、') || '无明确结构'}

## 2. 参考方案风格摘要
${styleSummary('色彩系统', style.colorSystem)}

${styleSummary('构图与版式', style.compositionSystem)}

${styleSummary('图形语言', style.graphicLanguage)}

${styleSummary('字体层级', style.typographySystem)}

${styleSummary('材质与光线', [...style.materialSystem, ...style.lightingSystem])}

${styleSummary('摄影语言', style.photographySystem)}

${styleSummary('包装与触点延展', [...style.packagingPresentation, ...style.posterPresentation, ...style.viExtensionSystem])}

## 3. 素材筛选协议
- 当前项目分析证据包：${closure.analysisEvidencePack.assetIds.length} 个资产
- 当前项目生图身份包：${closure.generationIdentityPack.assetIds.length} 个资产
- 参考依据母集：${protocol?.referenceMasterSet.assetIds.length ?? 0} 个资产
- Primary Style Carriers：${closure.styleCarrierRanking.filter((item) => item.priority === 'primary').map((item) => item.description).join('；') || '无'}
- 确认状态：${protocol?.requiresHumanConfirmation ? '建议人工确认' : '自动筛选已通过'}

### 各任务参考子集
${list(taskSubsets)}

## 4. 当前项目风格应用策略
${styleApplications.map((item) => `- ${item.label}：${item.value}`).join('\n')}

## 5. 重构后的核心视觉方向
- 方向名称：${direction.directionName}
- 核心命题：${direction.coreProposition}
- 视觉锚点：${direction.visualAnchor}
- 构图系统：${direction.compositionSystem.join('；') || '未确认'}
- 材质系统：${direction.materialSystem.join('；') || '未确认'}
- 禁止事项：${direction.prohibitedActions.join('；') || '无'}

## 6. 当前项目分析证据包
${list(closure.analysisEvidencePack.assetIds)}

## 7. 当前项目生图身份包
${list(closure.generationIdentityPack.assetIds)}

## 8. 当前项目素材决策
${closure.currentProjectAssetDecisions.map((item) =>
    `- ${item.filename.displayName}｜分析：${item.includeInAnalysisEvidencePack ? '是' : '否'}｜生图：${item.includeInGenerationIdentityPack ? '是' : '否'}｜用途：${item.generationUsage}｜置信度：${item.confidence.toFixed(2)}`
  ).join('\n') || '- 无'}

## 9. 精准事实证据
${list(facts.map((item) =>
    `${item.value}｜${item.status}｜依据：${item.evidenceAssetIds?.join('、') || '未确认'}`
  ))}

## 10. Legacy Visual Observations
${list(closure.legacyVisualObservations.map((item) =>
    `${item.value}｜依据：${item.evidenceAssetIds?.join('、') || '未确认'}`
  ), '无旧视觉观察')}

## 11. 已出现文案与继承权限
${closure.observedCopy.map((item) => `- ${item.text}｜${item.status}｜用于生图：${item.useInGeneration ? '是' : '否'}`).join('\n') || '- 无'}

## 12. 参考专属图形隔离
${closure.referenceSignatureGraphics.map((item) => `- ${item.description}｜禁止复制：${item.forbiddenToCopy ? '是' : '否'}`).join('\n') || '- 未识别到专属图形'}

## 13. Style Carrier Ranking
${closure.styleCarrierRanking.map((item) => `- [${item.priority}] ${item.description}｜${item.id}`).join('\n')}

## 14. System Anchor 与 Project Graphic Anchor
- 色彩关系：${strategy.systemAnchor.colorRelationship}
- 版式语法：${strategy.systemAnchor.layoutGrammar}
- 字体层级：${strategy.systemAnchor.typographyHierarchy}
- 材质语言：${strategy.systemAnchor.materialLanguage}
- 图形来源：${strategy.projectGraphicAnchor.sourceElements.join('、')}
- 图形形式：${strategy.projectGraphicAnchor.reconstructedForm}
`;
}

function compileGenerationBrief(
  current: CurrentProjectProfile,
  strategy: Omit<ReferenceFirstStrategy, 'betaClosure'>,
  closure: Omit<ReferenceFirstBetaClosure, 'analysisAuditMarkdown' | 'generationBriefMarkdown' | 'finalValidation'>,
  outputType: GenerationOutputType = 'anchor_vi_system'
) {
  const primary = closure.styleCarrierRanking.filter((item) => item.priority === 'primary');
  const task = strategy.generationContexts.find((item) => item.outputType === outputType);
  const rule = closure.touchpointVisualRules.find((item) => item.outputType === outputType);
  const forbidden = unique([
    ...strategy.referenceIdentityBoundary.forbiddenSignatureGraphics,
    '砂锅徽章、八角印章、铜钱纹、窗棂纹和参考品牌专属装饰带',
    '当前项目旧配色、旧版式、旧图形、旧摄影和旧空间表现',
    '参考品牌名称、Logo、产品名和文案'
  ]);
  const prompt = `请完整阅读并严格区分以下输入：
1. Current Project Generation Identity Pack：只负责品牌名称、Logo、Logo 字标、产品事实、真实结构和 Locked Assets；不要继承旧视觉。
2. Reference-First Generation Brief：负责视觉权限、Primary Style Carriers、System Anchor、辅助图形和当前任务规则。
3. Task Reference Subset：负责本次任务的色彩关系、版式、排版、材质和陈列方式。
4. Approved Anchor Image：仅在后续任务使用，负责已确认的视觉连续性。
不得复制参考品牌身份、文案和专属图形。必须继承参考方案的可见风格系统，但辅助图形必须基于当前项目重新设计。`;
  return `# ${current.projectName}-Reference-First生图执行文档

## 1. 当前项目最小身份
- 品牌：${current.brandName}
- 行业：${current.industry}
- 产品：${current.coreProducts.join('、')}
- 目标用户：${current.targetAudience.join('、') || '未确认'}
- 品牌定位：${current.brandPositioning || '未确认'}
- Locked Assets：${current.lockedAssets.join('、') || '无'}
- 保留文案：${closure.generationIdentityPack.retainedCopy.join('、') || '无'}

## 2. 当前旧视觉可替换说明
当前项目旧色彩、旧版式、旧图形、旧摄影、旧材质与旧空间表现不构成生图约束，且不进入生图身份包。

## 3. Primary Style Carriers
${list(primary.map((item) => item.description))}

## 4. System Anchor
- 色彩关系：${strategy.systemAnchor.colorRelationship}
- 版式语法：${strategy.systemAnchor.layoutGrammar}
- 字体层级：${strategy.systemAnchor.typographyHierarchy}
- 材质语言：${strategy.systemAnchor.materialLanguage}
- 陈列模式：${strategy.systemAnchor.displayMode}

## 5. Project Graphic Anchor
- 来源元素：${strategy.projectGraphicAnchor.sourceElements.join('、')}
- 形式：${strategy.projectGraphicAnchor.reconstructedForm}
- 约束：非闭合、非徽章、辅助角色；不得近似参考专属图形。

## 6. 当前任务执行规则
- 输出类型：${outputType}
- 视觉主体：${rule?.primarySubjectType ?? 'graphic_system'}
- 产品摄影允许：${rule?.productPhotographyAllowed ? '是' : '否'}
- 产品摄影可主导：${rule?.productPhotographyMayDominate ? '是' : '否'}
${task?.prompt ? `- 任务说明：${task.prompt.split('\n')[0]}` : ''}

## 7. 禁止项
${list(forbidden)}

## 8. Task Reference Subset
- 文件：tasks/${outputType}.json

## 9. Approved Anchor
首张 anchor_vi_system 建立锚点；后续任务只读取已批准锚点，不读取 Analysis Evidence Pack。

## 10. 可直接复制的 GPT 提示词
\`\`\`text
${prompt}
\`\`\`
`;
}

export function buildReferenceFirstBetaClosure(input: {
  currentProjectProfile: CurrentProjectProfile;
  referenceStyleProfile: ReferenceStyleProfile;
  visualReconstructionDirection: VisualReconstructionDirection;
  strategy: Omit<ReferenceFirstStrategy, 'betaClosure'>;
  assetSelectionProtocol?: AssetSelectionProtocolResult;
}): ReferenceFirstBetaClosure {
  const { currentProjectProfile: current, strategy, assetSelectionProtocol: protocol } = input;
  const decisions = (protocol?.currentProjectAssetDecisions ?? []).map((item) => {
    const roles = unique([...(item.roles || []), item.role]) as CurrentProjectAssetRole[];
    const locked = item.lockedEvidence.length > 0 || roles.includes('locked_asset_evidence');
    const usage = generationUsage(roles, locked);
    const legacy = roles.some((role) => LEGACY_ROLES.includes(role)) || item.containsLegacyStyle;
    const includeInGenerationIdentityPack = usage !== 'exclude' && (!legacy || usage === 'structure_only');
    return {
      assetId: item.assetId,
      filename: readableFilename(item.filename),
      roles,
      includeInAnalysisEvidencePack: !roles.some((role) => ['duplicate', 'irrelevant'].includes(role)),
      includeInGenerationIdentityPack,
      generationUsage: includeInGenerationIdentityPack ? usage : 'exclude' as const,
      reason: includeInGenerationIdentityPack && usage === 'structure_only'
        ? '仅保留结构信息，旧贴图不得作为风格依据'
        : item.keepReason,
      confidence: item.confidence
    };
  });
  const analysisIds = decisions.filter((item) => item.includeInAnalysisEvidencePack).map((item) => item.assetId);
  const identity = decisions.filter((item) => item.includeInGenerationIdentityPack);
  const roleIds = (...roles: CurrentProjectAssetRole[]) =>
    identity.filter((item) => item.roles.some((role) => roles.includes(role))).map((item) => item.assetId);
  const retainedCopy = unique(current.existingBrandCopy ?? []);
  const generationIdentityPack = {
    id: 'generation-identity-pack.json',
    brandName: current.brandName,
    identityAssetIds: roleIds('logo_evidence', 'logo_typography_evidence', 'brand_name_evidence'),
    productAssetIds: roleIds('product_fact_evidence'),
    structureOnlyAssets: identity.filter((item) => item.generationUsage === 'structure_only').map((item) => ({
      sourceAssetId: item.assetId,
      usage: 'structure_only' as const,
      maskLegacyVisual: item.roles.some((role) => LEGACY_ROLES.includes(role)),
      textualStructureDescription: item.reason
    })),
    lockedAssetIds: identity.filter((item) => item.generationUsage === 'locked_asset').map((item) => item.assetId),
    retainedCopy,
    assetIds: identity.map((item) => item.assetId),
    schemaVersion: 'current-project-generation-identity-pack-v1' as const
  };
  const contaminated = identity.some((item) =>
    item.generationUsage !== 'structure_only' && item.roles.some((role) => LEGACY_ROLES.includes(role)));
  const hasLogo = generationIdentityPack.identityAssetIds.length > 0 || current.lockedAssets.some((item) => /logo|标志|标识/iu.test(item));
  const incomplete = !current.brandName || !hasLogo;
  const generationIdentityPackValidation = {
    hasLogo,
    hasLogoTypography: roleIds('logo_typography_evidence').length > 0 || hasLogo,
    hasProductEvidence: generationIdentityPack.productAssetIds.length > 0 || current.coreProducts.length > 0,
    hasRequiredStructureEvidence: generationIdentityPack.structureOnlyAssets.length > 0 || current.packagingStructures.length === 0,
    hasLockedAssets: generationIdentityPack.lockedAssetIds.length > 0 || current.lockedAssets.length > 0,
    excludesLegacyPosters: !contaminated,
    excludesLegacyColorBoards: !contaminated,
    excludesLegacyGraphicSystems: !contaminated,
    excludesLegacySpatialStyle: !contaminated,
    passed: !contaminated && !incomplete,
    errors: [
      ...(contaminated ? ['GENERATION_IDENTITY_PACK_CONTAMINATED' as const] : []),
      ...(incomplete ? ['GENERATION_IDENTITY_PACK_INCOMPLETE' as const] : [])
    ]
  };
  const facts = preciseEvidenceFacts(current, protocol);
  const observedCopy: BrandCopyRecord[] = unique([
    ...(protocol?.currentProjectCorePack.confirmedBrandCopy ?? []),
    ...(current.existingBrandCopy ?? [])
  ]).map((text) => {
    const retained = retainedCopy.includes(text);
    return {
      text,
      status: retained ? 'user_retained' : 'observed',
      evidenceAssetIds: roleIds('brand_copy_evidence'),
      useInGeneration: retained
    };
  });
  const legacyVisualObservations: EvidenceBoundFact[] = decisions
    .filter((item) => item.roles.some((role) => LEGACY_ROLES.includes(role)))
    .map((item, index) => ({
      id: `legacy-visual-${index + 1}`,
      value: `旧视觉观察：${item.filename.displayName}`,
      classification: 'legacy_visual_observation',
      sourceAssetIds: [item.assetId],
      evidenceAssetIds: [item.assetId],
      confidence: item.confidence,
      status: 'confirmed',
      entersGenerationIdentityPack: false,
      influencesGenerationStyle: false
    }));
  const styleCarrierRanking = carrierRanking(strategy, protocol);
  const signatureRules = input.referenceStyleProfile.graphicLanguage
    .filter((item) => SIGNATURE_GRAPHIC_PATTERN.test(item.rule));
  const referenceSignatureGraphics = signatureRules.map((item) => ({
    description: item.rule,
    forbiddenToCopy: true,
    evidenceAssetIds: item.evidence
  }));
  const referenceGraphicStructures = input.referenceStyleProfile.graphicLanguage
    .filter((item) => !SIGNATURE_GRAPHIC_PATTERN.test(item.rule))
    .slice(0, 6)
    .map((item) => ({
      structuralRole: item.rule,
      layoutPosition: '按参考的结构位置关系抽象继承',
      repetitionLogic: '只继承重复与跨触点复用逻辑',
      density: '保持参考的密度与留白节奏',
      crossTouchpointUsage: ['packaging', 'vi_application', 'brand_poster']
    }));
  const touchpointVisualRules = touchpointRules();
  const base = {
    currentProjectAssetDecisions: decisions,
    analysisEvidencePack: {
      id: 'analysis-evidence-pack.json',
      assetIds: analysisIds,
      purpose: 'analysis_only' as const,
      schemaVersion: 'current-project-analysis-evidence-pack-v1' as const
    },
    generationIdentityPack,
    generationIdentityPackValidation,
    observedCopy,
    legacyVisualObservations,
    referenceGraphicStructures,
    referenceSignatureGraphics,
    graphicReconstruction: {
      reconstructedGraphic: strategy.projectGraphicAnchor.reconstructedForm,
      sourceElements: strategy.projectGraphicAnchor.sourceElements,
      structuralSimilarity: '继承参考的布局位置、重复逻辑、密度与跨触点关系，不继承专属形状',
      identitySimilarityRisk: SIGNATURE_GRAPHIC_PATTERN.test(strategy.projectGraphicAnchor.reconstructedForm)
        ? 'high' as const : 'low' as const
    },
    styleCarrierRanking,
    outputStyleCarrierRequirements: touchpointVisualRules.map((item) => ({
      outputType: item.outputType,
      requiredPrimaryCarrierIds: styleCarrierRanking.filter((carrier) => carrier.priority === 'primary')
        .filter((carrier) => item.outputType !== 'anchor_vi_system' || carrier.category !== 'photography')
        .map((carrier) => carrier.id),
      optionalSecondaryCarrierIds: styleCarrierRanking.filter((carrier) => carrier.priority !== 'primary').map((carrier) => carrier.id)
    })),
    touchpointVisualRules
  };
  const analysisAuditMarkdown = compileAudit(
    current,
    input.referenceStyleProfile,
    input.visualReconstructionDirection,
    facts,
    strategy,
    protocol,
    base
  );
  const generationBriefMarkdown = compileGenerationBrief(current, strategy, base);
  const primaryCount = styleCarrierRanking.filter((item) => item.priority === 'primary').length;
  const preciseFacts = facts.every((item) =>
    item.status !== 'confirmed' || Boolean(item.evidenceAssetIds?.length));
  const taskConsistent = (protocol?.taskReferenceSubsets ?? []).every((item) =>
    item.matchLevel === 'exact'
      ? /精确匹配/u.test(item.selectionReason)
      : item.matchLevel === 'compatible'
        ? /兼容参考/u.test(item.selectionReason)
        : item.matchLevel === 'inferred'
          ? /推导/u.test(item.selectionReason)
          : /不足|等待人工/u.test(item.selectionReason));
  const errors: string[] = [];
  if (base.analysisEvidencePack.id === generationIdentityPack.id) errors.push('ANALYSIS_GENERATION_PACK_NOT_SEPARATED');
  if (contaminated) errors.push('GENERATION_PACK_LEGACY_CONTAMINATION');
  if (!preciseFacts) errors.push('FACT_EVIDENCE_BROADCAST_DETECTED');
  if (referenceSignatureGraphics.some((item) => !item.forbiddenToCopy)
    || base.graphicReconstruction.identitySimilarityRisk === 'high') errors.push('REFERENCE_SIGNATURE_GRAPHIC_LEAK');
  if (primaryCount < PRIMARY_STYLE_CARRIER_MIN || primaryCount > PRIMARY_STYLE_CARRIER_MAX) errors.push('PRIMARY_STYLE_CARRIER_OVERLOAD');
  if (!taskConsistent) errors.push('TASK_REFERENCE_MATCH_CONTRADICTION');
  if (generationBriefMarkdown.length > GENERATION_BRIEF_MAX_CHARS) errors.push('GENERATION_BRIEF_TOO_VERBOSE');
  if (decisions.some((item) => /�|锟斤拷/u.test(item.filename.displayName))) errors.push('ASSET_FILENAME_ENCODING_ERROR');
  const projectGraphicAnchorIsNonBadge = !SIGNATURE_GRAPHIC_PATTERN.test(strategy.projectGraphicAnchor.reconstructedForm);
  if (!projectGraphicAnchorIsNonBadge) errors.push('REFERENCE_SIGNATURE_GRAPHIC_LEAK');
  const finalValidation = {
    analysisAndGenerationPacksSeparated: !errors.includes('ANALYSIS_GENERATION_PACK_NOT_SEPARATED'),
    generationIdentityPackHasNoLegacyStylePollution: !contaminated,
    factsHavePreciseEvidence: preciseFacts,
    observedCopyNotAutoRetained: observedCopy.every((item) => item.status !== 'observed' || !item.useInGeneration),
    primaryStyleCarrierCountValid: primaryCount >= PRIMARY_STYLE_CARRIER_MIN && primaryCount <= PRIMARY_STYLE_CARRIER_MAX,
    referenceSignatureGraphicsExcluded: !errors.includes('REFERENCE_SIGNATURE_GRAPHIC_LEAK'),
    projectGraphicAnchorIsNonBadge,
    taskReferenceMatchTextConsistent: taskConsistent,
    referenceAssetsSupportMultipleRoles: !protocol
      || !protocol.referenceAssetDecisions.some((item) => item.primaryRole)
      || protocol.referenceAssetDecisions.every((item) => Array.isArray(item.secondaryRoles)),
    brandAndProductPosterRulesSeparated: touchpointVisualRules.find((item) => item.outputType === 'brand_poster')?.productPhotographyMayDominate === false
      && touchpointVisualRules.find((item) => item.outputType === 'product_poster')?.productPhotographyMayDominate === true,
    auditAndGenerationDocsSeparated: analysisAuditMarkdown !== generationBriefMarkdown,
    generationBriefWithinLengthLimit: generationBriefMarkdown.length <= GENERATION_BRIEF_MAX_CHARS,
    filenamesReadable: !errors.includes('ASSET_FILENAME_ENCODING_ERROR'),
    passed: errors.length === 0,
    errors: unique(errors)
  };
  return { ...base, analysisAuditMarkdown, generationBriefMarkdown, finalValidation };
}
