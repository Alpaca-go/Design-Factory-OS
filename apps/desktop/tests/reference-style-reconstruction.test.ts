import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCurrentProjectProfile,
  buildCurrentProjectProfile,
  buildReferenceStyleProfile,
  buildReferenceStyleReconstruction,
  completeVisualDirectionTouchpoints,
  generateVisualReconstructionDirection,
  validateOutputDuplication,
  validateReferenceStyleProfile,
  validateVisualDirectionExecutability
} from '../src/main/reference-style-reconstruction.ts';
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
  assert.match(result.markdown, /冯烫烫-视觉方案参考风格重构执行文档/);
  assert.match(result.markdown, /## 6\. 各触点执行规则/);
  assert.match(result.markdown, /## 7\. GPT 生图执行约束/);
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
