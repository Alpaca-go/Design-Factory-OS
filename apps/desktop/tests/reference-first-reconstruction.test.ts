import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReferenceFirstStrategy } from '../src/main/reference-first-reconstruction.ts';
import { buildVisualReconstructionDecisionPrompt } from '../src/main/reference-reconstruction-prompts.ts';
import type {
  AssetSelectionProtocolResult,
  CurrentProjectProfile,
  ReferenceStyleProfile,
  ReferenceStyleRule,
  VisualReconstructionDirection
} from '../src/shared/types.ts';

const rule = (value: string): ReferenceStyleRule => ({
  rule: value,
  evidence: ['reference-system.png'],
  designEffect: value,
  confidence: 0.9
});

const current: CurrentProjectProfile = {
  schemaVersion: 'current-project-profile-v3',
  projectId: 'project-1',
  projectName: '测试项目',
  brandName: '测试品牌',
  industry: '食品',
  coreProducts: ['产品 A'],
  targetAudience: ['消费者'],
  brandPositioning: '现代食品品牌',
  usageScenarios: ['零售'],
  businessTouchpoints: ['包装', '海报', 'VI'],
  lockedAssets: ['brand-logo.png'],
  packagingStructures: ['方形纸盒'],
  confirmedFacts: ['产品 A 为已确认产品'],
  sourceArtifactIds: ['current-project.png'],
  existingBrandCopy: [],
  visualSources: {
    productForms: ['方形产品切面'],
    cookingActions: ['层叠动作'],
    sensorySignals: ['细腻纹理'],
    consumptionActions: ['手持'],
    brandNameSemantics: ['测试'],
    spatialObjects: ['陈列架']
  },
  touchpointInventory: {
    primaryPackaging: ['方形纸盒'],
    secondaryPackaging: [],
    serviceMaterials: [],
    viApplications: ['手提袋'],
    spatialTouchpoints: ['陈列架'],
    digitalTouchpoints: ['社交媒体']
  }
};

const style: ReferenceStyleProfile = {
  schemaVersion: 'reference-style-profile-v3',
  overallTemperament: [rule('克制、明亮、系统化')],
  colorSystem: [rule('采用低饱和蓝绿与暖白之间的主次关系')],
  compositionSystem: [rule('采用上部留白与下部模块化陈列的版式骨架')],
  graphicLanguage: [rule('采用连续细线与模块切片的图形结构')],
  typographySystem: [rule('采用标题、说明、参数三级字体层级')],
  materialSystem: [rule('采用哑光纸与半透明材质的组合语言')],
  lightingSystem: [rule('采用柔和侧光建立材质层次')],
  photographySystem: [rule('采用克制背景与清晰主体边缘的摄影关系')],
  packagingPresentation: [rule('包装以模块陈列保持系列一致')],
  posterPresentation: [rule('海报以大留白和稳定标题区组织信息')],
  viExtensionSystem: [rule('跨触点共享色彩、字体与模块陈列规则')],
  excludedIdentityTerms: ['参考品牌'],
  sourceAssetIds: ['reference-system.png']
};

const direction: VisualReconstructionDirection = {
  directionName: '系统新序',
  coreProposition: '为测试品牌的产品 A 建立参考主导的新系统',
  visualAnchor: '由方形产品切面与层叠动作形成连续模块图形',
  visualAnchorDefinition: {
    name: '连续模块',
    sourceElements: ['方形产品切面', '层叠动作'],
    transformationLogic: '把切面和动作转为连续模块',
    visualForm: '连续细线连接模块切片',
    extensionTouchpoints: ['包装', '海报', 'VI'],
    referenceSurfaceSimilarityRisk: 'low'
  },
  executionDetailLevel: 'gpt_visual',
  referenceInheritance: [
    { level: 'principle', weight: 1, rule: '系统原则' },
    { level: 'relationship', weight: 0.8, rule: '视觉关系' },
    { level: 'surface', weight: 0.35, rule: '弱表层参考' }
  ],
  flexibleColorSystem: {
    identityColorRole: '参考色彩关系',
    backgroundOptions: ['暖白'],
    textAndStructureColors: ['深灰'],
    accentOptions: ['蓝绿'],
    saturationGuideline: '低饱和',
    touchpointVariations: ['包装变化', '海报变化']
  },
  flexibleCompositionSystem: {
    fixedPrinciples: ['模块骨架'],
    allowedVariations: ['模块尺寸变化', '留白变化'],
    seriesConsistencyRules: ['层级一致'],
    prohibitedLayouts: ['拥挤布局']
  },
  currentProjectIdentityToRetain: ['旧红黑白配色'],
  currentVisualElementsToRedesign: [],
  compositionSystem: ['模块骨架'],
  graphicSystem: ['连续模块'],
  colorSystem: ['旧红黑白配色'],
  typographySystem: ['三级层级'],
  materialSystem: ['哑光纸'],
  lightingSystem: ['柔和侧光'],
  photographySystem: ['克制背景'],
  touchpointRules: {
    packaging: ['包装规则'],
    poster: ['海报规则'],
    vi: ['VI 规则'],
    space: ['空间规则']
  },
  prohibitedActions: ['不得复制参考品牌']
};

const protocol: AssetSelectionProtocolResult = {
  currentProjectAssetDecisions: [{
    assetId: 'current-1',
    filename: 'current-project.png',
    role: 'logo_evidence',
    keepInCorePack: true,
    keepReason: '品牌 Logo 依据',
    extractedFacts: [],
    lockedEvidence: ['Logo'],
    containsLegacyStyle: true,
    legacyStyleShouldInfluenceOutput: false,
    confidence: 0.95,
    requiresHumanReview: false
  }],
  currentProjectCorePack: {
    projectId: 'project-1',
    brandName: '测试品牌',
    industry: '食品',
    productFacts: ['产品 A'],
    logoAssetIds: ['current-1'],
    logoTypographyAssetIds: ['current-1'],
    packagingStructures: [{ assetId: 'current-1', description: '方形纸盒', confidence: 0.9 }],
    productAssets: [],
    touchpoints: current.touchpointInventory,
    confirmedBrandCopy: [],
    lockedAssets: [{ name: 'Logo', assetIds: ['current-1'], reason: '明确锁定' }],
    excludedLegacyStyleAssetIds: [],
    uncertainAssetIds: [],
    sourceAssetIds: ['current-1'],
    schemaVersion: 'current-project-core-pack-v1'
  },
  currentCorePackValidation: {
    hasBrandName: true,
    hasLogoEvidence: true,
    hasLogoTypographyEvidence: true,
    hasProductFactEvidence: true,
    hasRequiredStructureEvidence: true,
    hasLockedAssetEvidence: true,
    excludesLegacyStyleOnlyAssets: true,
    excludesDuplicateAssets: true,
    noReferenceAssetsMixedIn: true,
    unresolvedUncertainAssets: [],
    passed: true,
    warnings: []
  },
  referenceAssetDecisions: [{
    assetId: 'reference-1',
    filename: 'reference-system.png',
    role: 'system_overview',
    styleCarrierStrength: 'high',
    includeInMasterSet: true,
    eligibleOutputTypes: ['anchor_vi_system', 'vi_application'],
    representedStyleCarriers: ['color', 'layout', 'typography', 'display'],
    confidence: 0.92,
    reason: '完整展示跨触点系统',
    requiresHumanReview: false
  }],
  referenceMasterSet: {
    assetIds: ['reference-1'],
    decisions: [],
    styleCarriers: [{
      id: 'carrier-1',
      category: 'layout',
      description: '模块化系统陈列',
      priority: 'primary',
      supportingAssetIds: ['reference-1'],
      mustBeVisibleInOutput: true,
      confidence: 0.92
    }],
    schemaVersion: 'reference-master-set-v1'
  },
  referenceMasterSetValidation: {
    hasSystemOverview: true,
    hasCrossTouchpointCoverage: true,
    hasPrimaryStyleCarrierEvidence: true,
    hasPackagingEvidence: false,
    hasPosterOrLayoutEvidence: true,
    hasMaterialOrDetailEvidence: false,
    excludesPureTextSlides: true,
    excludesBusinessAnalysisPages: true,
    excludesNearDuplicates: true,
    missingCoverageRoles: ['poster'],
    passed: true,
    warnings: []
  },
  taskReferenceSubsets: [{
    outputType: 'anchor_vi_system',
    selectedAssetIds: ['reference-1'],
    primaryReferenceAssetId: 'reference-1',
    supportingReferenceAssetIds: [],
    coveredPrimaryStyleCarrierIds: ['carrier-1'],
    missingStyleCarrierIds: [],
    selectionReason: '系统总览直接匹配',
    confidence: 0.92
  }, {
    outputType: 'product_poster',
    selectedAssetIds: ['reference-1'],
    primaryReferenceAssetId: 'reference-1',
    supportingReferenceAssetIds: [],
    coveredPrimaryStyleCarrierIds: ['carrier-1'],
    missingStyleCarrierIds: [],
    selectionReason: '缺少海报，暂由系统图推断',
    confidence: 0.9
  }],
  taskSubsetValidations: [],
  requiresHumanConfirmation: true,
  schemaVersion: 'asset-selection-protocol-v1'
};

test('Reference-First suppresses legacy visuals and builds a VI system anchor', () => {
  const strategy = buildReferenceFirstStrategy({
    currentProjectProfile: current,
    referenceStyleProfile: style,
    visualReconstructionDirection: direction,
    assetSelectionProtocol: protocol,
    referenceIdentityTerms: ['参考品牌']
  });

  assert.equal(strategy.permissionMatrix.currentProject.colorSystem, 'replaceable');
  assert.equal(strategy.permissionMatrix.referenceProject.colorSystem, 'adopt_from_reference');
  assert.match(strategy.currentProjectVisualPermissions.replaceableLegacyVisuals.join('\n'), /旧色彩系统/);
  assert.equal(strategy.anchorImage.outputType, 'anchor_vi_system');
  assert.match(strategy.anchorImage.primaryVisualSubject, /VI 系统总览/);
  assert.doesNotMatch(strategy.anchorImage.primaryVisualSubject, /食品|产品广告/);
  assert.equal(strategy.projectGraphicAnchor.usageRole, 'secondary');
  assert.equal(strategy.referenceReadableAssets[0]?.filename, 'reference-system.png');
});

test('missing poster reference lowers confidence and generation prompt carries four input roles', () => {
  const strategy = buildReferenceFirstStrategy({
    currentProjectProfile: current,
    referenceStyleProfile: style,
    visualReconstructionDirection: direction,
    assetSelectionProtocol: protocol
  });
  const productPoster = strategy.taskReferenceConfidence
    .find((item) => item.outputType === 'product_poster')!;
  assert.equal(productPoster.hasDirectTypeMatch, false);
  assert.ok(productPoster.confidence < 0.8);
  assert.equal(productPoster.requiresHumanReview, true);

  const prompt = strategy.generationContexts
    .find((item) => item.outputType === 'product_poster')!.prompt;
  assert.match(prompt, /Generation Identity Pack/);
  assert.match(prompt, /Reference-First Generation Brief/);
  assert.match(prompt, /Task Reference Subset/);
  assert.match(prompt, /Approved Anchor/);
  assert.doesNotMatch(prompt, /currentProjectCorePackId/);
  assert.equal(strategy.betaClosure.analysisEvidencePack.purpose, 'analysis_only');
  assert.notEqual(
    strategy.betaClosure.analysisEvidencePack.id,
    strategy.betaClosure.generationIdentityPack.id
  );
  assert.ok(strategy.betaClosure.generationBriefMarkdown.length <= 10_000);
  assert.match(strategy.betaClosure.generationBriefMarkdown, /## 10\. 可直接复制的 GPT 提示词/);
  assert.doesNotMatch(strategy.betaClosure.generationBriefMarkdown, /内部 ID|UUID/);
});

test('Reference-First decision prompt exposes the exact parser contract', () => {
  const prompt = buildVisualReconstructionDecisionPrompt({
    currentProjectProfile: current,
    referenceStyleProfile: style
  });
  assert.match(prompt, /"directionName": "2至8个汉字/);
  assert.match(prompt, /"visualAnchor": \{/);
  assert.match(prompt, /"currentProjectIdentityToRetain": \[/);
  assert.match(prompt, /"graphicSystem": \[/);
  assert.match(prompt, /特别禁止输出 coreVisualDirection、visualAnchorDefinition/);
});
