import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCurrentProjectProfile,
  buildCurrentProjectProfile,
  buildReferenceStyleProfile,
  buildReferenceStyleReconstruction,
  completeVisualDirectionTouchpoints,
  generateVisualReconstructionDirection,
  normalizeDirectionForGptVisual,
  normalizeGptVisualRule,
  normalizeProjectTouchpointClassification,
  validateBetaContentCorrection,
  validateOutputDuplication,
  validateReferenceStyleProfile,
  validateVisualDirectionExecutability
} from '../src/main/reference-style-reconstruction.ts';
import {
  recoverPersistedProjectIdentity,
  resolveAnalyzedProjectIdentity
} from '../src/main/project-identity.ts';
import type { ProjectRecord, ReferenceTranslationProfile } from '../src/shared/types.ts';

function project(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    projectName: '冯烫烫',
    detectedProjectName: '冯烫烫',
    projectNameSource: 'visual-content',
    projectNameConfidence: 1,
    brandName: '冯烫烫',
    industry: '餐饮',
    detectedBrandName: '冯烫烫',
    detectedIndustry: '餐饮',
    factConfidence: { brandName: 1, industry: 1 },
    description: '热卤与汤食餐饮品牌',
    logoLocked: true,
    lockedFacts: ['品牌名称与 Logo 不得修改'],
    outputLanguage: 'zh-CN',
    provider: 'test',
    model: 'test',
    apiProfileId: 'profile',
    analysisProfile: 'fusion-enhanced',
    status: 'completed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastRunAt: new Date().toISOString(),
    lastDurationMs: 1,
    assetCount: 2,
    imageCount: 2,
    lastReportFilename: 'report.md',
    lastError: null,
    logoFiles: ['logo.png'],
    briefFiles: [],
    assets: [{
      id: 'asset',
      batchId: 'batch',
      sourceType: 'file',
      originalName: '包装正面.png',
      relativePath: 'assets/a.png',
      mimeType: 'image/png',
      sizeBytes: 100,
      sha256: 'abc',
      status: 'ready'
    }],
    ...overrides
  };
}

const analysis = [
  '# 冯烫烫品牌分析',
  '- 核心产品：热卤、汤食和门店套餐。',
  '- 目标用户：追求快捷与品质的都市上班族。',
  '- 品牌定位：有温度的现代中式快餐。',
  '- 业务触点：餐盒包装、品牌海报、菜单、手提袋与门店空间。',
  '- 消费场景：工作日午餐、晚间外带和朋友聚餐。',
  '- 包装结构：现有方形餐盒结构必须保留。'
].join('\n');

const profile: ReferenceTranslationProfile = {
  schema_version: 'reference-translation-profile-v1',
  source_role: 'reference_project',
  referenceIdentity: { touchpoints: ['包装', '海报'], assetCount: 6, completeness: 'high', consistency: 'high', missingEvidence: [] },
  referenceVisualDNA: {
    visualTemperament: [{ name: '克制温暖', evidence: ['a.png'], mechanism: '通过低饱和暖色和自然表面建立克制温暖的气质', function: '建立品质感', confidence: 0.9 }],
    compositionRules: [{ name: '留白主体', evidence: ['a.png'], mechanism: '主体单独突出并保留大面积呼吸空间', function: '建立清晰阅读路径', confidence: 0.9 }],
    graphicGrammar: [{ name: '器皿轮廓', evidence: ['a.png'], mechanism: '护肤参考牌使用瓶罐轮廓重复形成辅助图形', function: '统一不同触点', confidence: 0.8 }],
    colorLogic: [{ name: '暖米白', evidence: ['a.png'], mechanism: '暖米白作为大面积背景，低饱和重点色控制在小面积', function: '控制信息层级', confidence: 0.9 }],
    typographyLogic: [{ name: '三级信息', evidence: ['a.png'], mechanism: '标题、说明和产品信息形成三级字号与字重层级', function: '提高阅读效率', confidence: 0.85 }],
    materialAndLighting: [{ name: '哑光侧光', evidence: ['a.png'], mechanism: '哑光纸张配合柔和侧光和浅景深呈现真实质感', function: '建立触觉与温度', confidence: 0.9 }],
    extensionMechanism: [{ name: '统一母版', evidence: ['a.png'], mechanism: '包装、海报与手提袋共用色块和固定信息区', function: '建立系列一致性', confidence: 0.85 }]
  },
  transferability: { directlyTransferable: [], requiresReinterpretation: [], prohibitedToCopy: [] },
  sourceRisks: { signatureAssets: [], recognizableCombinations: [], similarityWarnings: [] },
  projectTranslationMatrix: [{
    translation_id: 'PTM-001',
    referenceMechanism: 'unused',
    referenceFunction: 'unused',
    projectCondition: 'unused',
    translatedMechanism: 'unused',
    retainedProperties: ['unused'],
    changedProperties: ['unused'],
    prohibitedElements: ['unused'],
    confidence: 0.5
  }]
};

test('current project profile fails closed when required facts are absent', () => {
  assert.throws(
    () => buildCurrentProjectProfile(project({
      industry: '待确认（基于现有素材推断）',
      detectedIndustry: '待确认（基于现有素材推断）',
      assets: [],
    }), '# 空报告'),
    /当前项目资料不足.*行业.*核心产品或服务.*目标人群.*业务触点/
  );
});

test('current project profile recovers a concrete industry from the analyzed visual plan', () => {
  const result = buildCurrentProjectProfile(project({
    industry: '待确认（基于现有素材推断）',
    detectedIndustry: '待确认（基于现有素材推断）',
  }), [
    analysis,
    '**行业：** 餐饮 / 中式快餐 / 跷脚牛肉专门店（基于现有素材推断）'
  ].join('\n'));
  assert.equal(result.industry, '餐饮 / 中式快餐 / 跷脚牛肉专门店');
});

test('reconstruction brief is project-specific, executable and free of reference identity or PTM output', () => {
  const result = buildReferenceStyleReconstruction({
    project: project(),
    projectAnalysisMarkdown: analysis,
    translationProfile: profile,
    referenceIdentityTerms: ['护肤参考牌', '护肤', '瓶罐'],
    preference: '优先继承留白、哑光材质与柔和侧光'
  });
  assert.equal(result.reconstruction.validation.passed, true);
  assert.match(result.markdown, /冯烫烫-Reference-First生图执行文档/);
  assert.match(result.markdown, /## 6\. 当前任务执行规则/);
  assert.match(result.markdown, /## 10\. 可直接复制的 GPT 提示词/);
  assert.doesNotMatch(result.markdown, /PTM-\d+|GPT Execution Core|Creative Authority/);
  const { prohibitedActions: _prohibitedActions, ...executableDirection } =
    result.reconstruction.visualReconstructionDirection;
  assert.doesNotMatch(JSON.stringify(executableDirection), /护肤参考牌|护肤|瓶罐/);
  assert.match(result.reconstruction.visualReconstructionDirection.visualAnchor, /热卤|汤食/);
});

test('project facts reject design advice, markdown and asset numbers', () => {
  const clean = buildCurrentProjectProfile(project(), analysis);
  assert.throws(
    () => assertCurrentProjectProfile({
      ...clean,
      coreProducts: ['跷脚牛肉', '60% 背景色需通过高质量摄影呈现'],
      confirmedFacts: [...clean.confirmedFacts, 'Asset-008 | 应当升级']
    }),
    (error: Error & { code?: string }) => error.code === 'CURRENT_PROJECT_PROFILE_CONTAMINATED'
  );
});

test('reference style profile rejects fixed wrappers and identity leakage', () => {
  const style = buildReferenceStyleProfile(profile, ['护肤参考牌']);
  assert.throws(
    () => validateReferenceStyleProfile({
      ...style,
      colorSystem: [{
        ...style.colorSystem[0]!,
        rule: '通过网格、留白与信息区之间的稳定关系组织“护肤参考牌 Asset-008”。'
      }]
    }, ['护肤参考牌']),
    (error: Error & { code?: string }) => error.code === 'REFERENCE_STYLE_PROFILE_CONTAMINATED'
  );
});

test('duplicated touchpoint rules and generic directions fail quality gates', () => {
  const current = buildCurrentProjectProfile(project(), analysis);
  const style = buildReferenceStyleProfile(profile, ['护肤参考牌']);
  const direction = generateVisualReconstructionDirection(current, style);
  assert.throws(
    () => validateOutputDuplication({
      ...direction,
      touchpointRules: {
        ...direction.touchpointRules,
        poster: [direction.touchpointRules.packaging[0]!]
      }
    }),
    (error: Error & { code?: string }) => error.code === 'RECONSTRUCTION_OUTPUT_DUPLICATED'
  );
  assert.throws(
    () => validateVisualDirectionExecutability({
      ...direction,
      directionName: '冯烫烫 · 参考风格重构',
      visualAnchor: '以参考方案的图形语法组织当前内容。'
    }, current),
    (error: Error & { code?: string }) => error.code === 'VISUAL_DIRECTION_NOT_EXECUTABLE'
  );
});

test('touchpoint validation accepts equivalent design language instead of exact keywords', () => {
  const current = buildCurrentProjectProfile(project(), analysis);
  const style = buildReferenceStyleProfile(profile, ['护肤参考牌']);
  const direction = generateVisualReconstructionDirection(current, style);
  assert.doesNotThrow(() => validateVisualDirectionExecutability({
    ...direction,
    touchpointRules: {
      ...direction.touchpointRules,
      packaging: direction.touchpointRules.packaging.map((rule) => rule
        .replace('Logo', '品牌标志')
        .replace('安全区', '保护区')
        .replace('系列', '不同 SKU 延展')),
      poster: direction.touchpointRules.poster.map((rule) => rule
        .replace('近景', '特写')
        .replace('留白', '空白')
        .replace('系列', '延展')),
      vi: direction.touchpointRules.vi.map((rule) => rule
        .replace('母版', '版式系统')
        .replace('Logo', '品牌标识')
        .replace('安全区', '最小间距')
        .replace('触点', '应用场景'))
    }
  }, current));
});

test('missing touchpoint fields are deterministically completed from the current project', () => {
  const current = buildCurrentProjectProfile(project(), analysis);
  const style = buildReferenceStyleProfile(profile, ['护肤参考牌']);
  const direction = generateVisualReconstructionDirection(current, style);
  const completed = completeVisualDirectionTouchpoints({
    ...direction,
    touchpointRules: {
      packaging: ['包装使用暖色背景。'],
      poster: [],
      vi: [],
      space: []
    }
  }, current, style);
  assert.ok(completed.touchpointRules.packaging.length >= 4);
  assert.ok(completed.touchpointRules.poster.length >= 3);
  assert.ok(completed.touchpointRules.vi.length >= 3);
  assert.doesNotThrow(() => validateVisualDirectionExecutability(completed, current));
});

test('placeholder 未标题 yields to the brand name recognized from visual evidence', () => {
  const identity = resolveAnalyzedProjectIdentity({
    projectName: '未标题',
    brandName: '未标题',
    detectedProjectName: '未标题',
    detectedBrandName: '未标题'
  }, '冯烫烫');

  assert.deepEqual(identity, {
    projectName: '冯烫烫',
    brandName: '冯烫烫'
  });
});

test('resume repairs a persisted 未标题 profile from confirmed brand evidence', () => {
  const current = buildCurrentProjectProfile(project(), analysis);
  const repaired = recoverPersistedProjectIdentity({
    ...current,
    projectName: '未标题',
    brandName: '未标题',
    confirmedFacts: ['品牌名称为冯烫烫', ...current.confirmedFacts]
  });

  assert.equal(repaired.projectName, '冯烫烫');
  assert.equal(repaired.brandName, '冯烫烫');
});

test('beta correction rejects generic traditional symbol stacking', () => {
  const current = buildCurrentProjectProfile(project(), analysis);
  const style = buildReferenceStyleProfile(profile, ['护肤参考牌']);
  const direction = generateVisualReconstructionDirection(current, style);
  const validation = validateBetaContentCorrection({
    ...direction,
    visualAnchor: '将砂锅与印章组合为圆形徽章，作为包装、海报与菜单的核心图形。',
    graphicSystem: ['砂锅加印章形成传统餐饮徽章。']
  }, current);
  assert.equal(validation.noGenericTraditionalSymbolStacking, false);
});

test('gpt visual mode rewrites production parameters to relationship-level language', () => {
  assert.equal(
    normalizeGptVisualRule('使用 100mm 微距镜头、F2.8、4000K 和 3:1 光比，Logo 保留 2 厘米安全距。'),
    '使用 近距离特写、浅景深、暖光 和 受控明暗层次，Logo 保留 清晰安全区安全距。'
  );
  const current = buildCurrentProjectProfile(project(), analysis);
  const style = buildReferenceStyleProfile(profile, ['护肤参考牌']);
  const normalized = normalizeDirectionForGptVisual({
    ...generateVisualReconstructionDirection(current, style),
    photographySystem: ['100mm 微距镜头，F2.8，4000K，3:1 光比。']
  });
  assert.doesNotMatch(JSON.stringify(normalized), /100mm|F2\.8|4000K|3:1/iu);
});

test('touchpoint inventory separates packaging, service materials and VI applications', () => {
  const current = buildCurrentProjectProfile(project(), [
    analysis,
    '- 包装结构：主餐打包盒；调料包。',
    '- 服务物料：筷子套；纸巾。',
    '- VI 应用：工作服；菜单。'
  ].join('\n'));
  assert.ok(current.touchpointInventory.primaryPackaging.includes('主餐打包盒'));
  assert.ok(current.touchpointInventory.primaryPackaging.includes('现有方形餐盒结构'));
  assert.ok(current.touchpointInventory.secondaryPackaging.includes('调料包'));
  assert.deepEqual(current.touchpointInventory.serviceMaterials, ['筷子套', '纸巾']);
  assert.ok(current.touchpointInventory.viApplications.includes('工作服'));
  assert.ok(current.touchpointInventory.viApplications.includes('菜单'));
});

test('project touchpoint normalization repairs duplicated classifications from real model output', () => {
  const normalized = normalizeProjectTouchpointClassification({
    packagingStructures: ['外卖手提袋', '陶瓷碗', '砂锅', '筷子套', '纸巾', '佐料包装袋'],
    touchpointInventory: {
      primaryPackaging: ['外卖手提袋', '堂食碗具'],
      secondaryPackaging: ['佐料/调料包装袋'],
      serviceMaterials: ['纸巾', '筷子套'],
      viApplications: ['宣传海报', '贴纸'],
      spatialTouchpoints: ['门店招牌'],
      digitalTouchpoints: []
    }
  });
  assert.deepEqual(normalized.packagingStructures, [
    '外卖手提袋',
    '陶瓷碗',
    '砂锅',
    '佐料包装袋',
    '堂食碗具',
    '佐料/调料包装袋'
  ]);
  assert.deepEqual(normalized.touchpointInventory.serviceMaterials, ['纸巾', '筷子套']);
  assert.deepEqual(normalized.touchpointInventory.viApplications, ['宣传海报', '贴纸']);
  assert.doesNotMatch(
    JSON.stringify([
      normalized.packagingStructures,
      normalized.touchpointInventory.primaryPackaging,
      normalized.touchpointInventory.secondaryPackaging
    ]),
    /筷子套|纸巾|宣传海报|贴纸/u
  );
});

test('project profile validation reports concrete misplaced touchpoints', () => {
  const current = buildCurrentProjectProfile(project(), analysis);
  assert.throws(
    () => assertCurrentProjectProfile({
      ...current,
      packagingStructures: [...current.packagingStructures, '筷子套', '纸巾']
    }),
    (error: Error & { details?: { packagingAndTouchpointsSeparated?: string[] } }) => {
      assert.deepEqual(error.details?.packagingAndTouchpointsSeparated, ['筷子套', '纸巾']);
      return true;
    }
  );
});

test('beta correction requires flexible color and composition systems', () => {
  const current = buildCurrentProjectProfile(project(), analysis);
  const style = buildReferenceStyleProfile(profile, ['护肤参考牌']);
  const direction = generateVisualReconstructionDirection(current, style);
  const rigid = validateBetaContentCorrection({
    ...direction,
    colorSystem: ['主背景统一使用高饱和暖橙，覆盖面积 60%。'],
    compositionSystem: ['所有海报固定使用同一母版构图。'],
    flexibleCompositionSystem: {
      ...direction.flexibleCompositionSystem,
      allowedVariations: []
    }
  }, current);
  assert.equal(rigid.colorRulesAreFlexible, false);
  assert.equal(rigid.compositionAllowsVariation, false);
  assert.equal(rigid.noUnnecessaryProductionParameters, false);

  const compliant = validateBetaContentCorrection({
    ...direction,
    flexibleColorSystem: {
      ...direction.flexibleColorSystem,
      textAndStructureColors: ['核心标题与图形线条统一采用深炭黑色，确保在暖色背景下清晰可读']
    },
    colorSystem: [
      direction.flexibleColorSystem.identityColorRole,
      ...direction.flexibleColorSystem.backgroundOptions,
      '核心标题与图形线条统一采用深炭黑色，确保在暖色背景下清晰可读',
      ...direction.flexibleColorSystem.accentOptions,
      direction.flexibleColorSystem.saturationGuideline,
      ...direction.flexibleColorSystem.touchpointVariations
    ],
    compositionSystem: [
      ...direction.flexibleCompositionSystem.fixedPrinciples,
      ...direction.flexibleCompositionSystem.allowedVariations,
      '统一的光影方向与背景留白策略。',
      '跨触点视觉依赖动势方向与色彩角色分配的统一，而非固定画面母版。',
      ...direction.flexibleCompositionSystem.prohibitedLayouts.map((item) => `禁止：${item}`)
    ]
  }, current);
  assert.equal(compliant.colorRulesAreFlexible, true);
  assert.equal(compliant.compositionAllowsVariation, true);
});
