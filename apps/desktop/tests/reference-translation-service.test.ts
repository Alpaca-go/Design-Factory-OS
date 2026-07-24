import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createReferenceTranslationService } from '../src/main/reference-translation-service.ts';
import type {
  CurrentProjectProfile,
  PublicSettings,
  ReferenceStyleProfile,
  ReferenceStyleRule,
  VisualReconstructionDirection
} from '../src/shared/types.ts';

function settingsWith(dataPath: string): PublicSettings {
  return {
    profiles: [],
    defaultProfileId: null,
    provider: 'qwen',
    baseUrl: '',
    model: '',
    hasApiKey: false,
    defaultDataPath: dataPath,
    cacheEnabled: true,
    logLevel: 'info',
    connectionStatus: 'untested'
  };
}

const VISUAL_ANALYSIS = {
  detectedIndustry: '食品饮料',
  visualAssetEvidence: {
    color: [
      { observation: '主色为暖橙色并配合大面积留白，明度层级清晰', source: 'poster-01.png' },
      { observation: '辅色使用低饱和绿色形成对比色关系', source: 'poster-02.png' }
    ],
    layout: [
      { observation: '包装正面采用中轴对称构图，信息层级按字号递减', source: 'package-front.png' }
    ],
    logo: [
      { observation: '参考品牌 Logo 使用定制字形与专属图形组合', source: 'logo.png' }
    ]
  }
};

const PROJECT_CONTEXT = {
  brandIdentity: { brandName: '云岭茶集', industry: '茶饮' },
  audience: ['都市白领'],
  lockedAssets: ['当前品牌 Logo']
};

test('reference translation run produces a validated profile and a queryable local record', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-reference-translation-'));
  try {
    const visualAnalysisPath = path.join(temporary, 'visual-analysis.json');
    const projectContextPath = path.join(temporary, 'project-context.json');
    await fs.writeFile(visualAnalysisPath, JSON.stringify(VISUAL_ANALYSIS), 'utf8');
    await fs.writeFile(projectContextPath, JSON.stringify(PROJECT_CONTEXT), 'utf8');
    const service = createReferenceTranslationService(() => settingsWith(path.join(temporary, 'data')));

    const result = await service.run({ visualAnalysisPath, projectContextPath, preference: '偏好克制配色' });
    assert.equal(result.run.status, 'completed');
    assert.ok(result.profile);
    assert.equal(result.profile.schema_version, 'reference-translation-profile-v1');
    assert.equal(result.profile.source_role, 'reference_project');
    assert.ok(result.profile.projectTranslationMatrix.length >= 1);
    assert.ok(result.profile.transferability.prohibitedToCopy.length >= 1, 'Logo 专属内容必须进入禁止复制');
    assert.ok(result.run.matrixCount === result.profile.projectTranslationMatrix.length);

    const runs = await service.listRuns();
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.id, result.run.id);
    assert.equal(runs[0]?.visualAnalysisFilename, 'visual-analysis.json');

    const reloaded = await service.getProfile(result.run.id);
    assert.deepEqual(reloaded.projectTranslationMatrix, result.profile.projectTranslationMatrix);
    const runRoot = path.join(temporary, 'data', 'reference-translation-v1', result.run.id);
    assert.equal(
      JSON.parse(await fs.readFile(path.join(runRoot, 'intermediate', 'reference-visual-analysis.json'), 'utf8')).detectedIndustry,
      '食品饮料'
    );
    assert.equal(
      JSON.parse(await fs.readFile(path.join(runRoot, 'input', 'project-context.json'), 'utf8')).brandIdentity.brandName,
      '云岭茶集'
    );
    assert.match(await fs.readFile(path.join(runRoot, 'report.md'), 'utf8'), /Reference-led Primary Direction/);
    const recordPath = path.join(runRoot, 'run.json');
    const failedRecord = {
      ...JSON.parse(await fs.readFile(recordPath, 'utf8')),
      status: 'failed',
      stage: 'FAILED',
      reportFilename: null,
      error: {
        code: 'MARKDOWN_VALIDATION_FAILED',
        message: '模拟报告缺少章节',
        stage: 'VALIDATING_REPORT',
        recoverable: true,
        retryFromStage: 'COMPILING_REPORT'
      }
    };
    await fs.writeFile(recordPath, JSON.stringify(failedRecord), 'utf8');
    await fs.rm(path.join(runRoot, 'report.md'));
    const retried = await service.retryReport(result.run.id);
    assert.equal(retried.run.status, 'completed');
    assert.match(await fs.readFile(path.join(runRoot, 'report.md'), 'utf8'), /相似性风险与禁止事项/);

    await service.remove(result.run.id);
    assert.equal((await service.listRuns()).length, 0);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('formal user flow analyzes reference assets and generates internal structured inputs', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-reference-user-flow-'));
  try {
    const dataPath = path.join(temporary, 'data');
    const currentRoot = path.join(temporary, 'current');
    const referenceRoot = path.join(temporary, 'reference');
    await fs.mkdir(path.join(currentRoot, 'outputs'), { recursive: true });
    await fs.mkdir(path.join(referenceRoot, 'outputs'), { recursive: true });
    await fs.mkdir(path.join(referenceRoot, 'input', 'assets'), { recursive: true });
    await fs.writeFile(path.join(referenceRoot, 'input', 'assets', 'reference.png'), 'placeholder', 'utf8');
    await fs.writeFile(path.join(currentRoot, 'outputs', 'current-report.md'), [
      '# 品牌分析',
      '**行业：** 茶饮 / 现制饮品（基于现有素材推断）',
      '- 核心产品：原叶茶饮、冷泡茶与茶点。',
      '- 目标用户：重视品质与效率的都市白领。',
      '- 品牌定位：现代、克制且可信赖的日常茶饮。',
      '- 业务触点：包装、品牌海报、门店菜单与手提袋。',
      '- 消费场景：办公、通勤与朋友小聚。'
    ].join('\n'), 'utf8');
    await fs.writeFile(path.join(referenceRoot, 'outputs', 'reference-report.md'), [
      '# 视觉分析',
      '',
      '- 版式采用稳定的中轴网格与大面积留白，信息层级清晰。',
      '- 材质以哑光纸张和柔和侧光形成克制、温暖的视觉气质。',
      '- 主色使用暖橙色，低饱和绿色作为小面积对比色。'
    ].join('\n'), 'utf8');
    const currentProject = {
      id: '11111111-1111-4111-8111-111111111111',
      projectName: '当前茶饮项目',
      brandName: '云岭茶集',
      detectedBrandName: '云岭茶集',
      industry: '待确认（基于现有素材推断）',
      detectedIndustry: '待确认（基于现有素材推断）',
      description: '面向都市白领的现代茶饮品牌',
      lockedFacts: ['品牌名称不可更改'],
      logoLocked: true,
      logoFiles: ['logo.png'],
      apiProfileId: 'profile-1',
      status: 'completed',
      lastReportFilename: 'current-report.md'
    };
    const referenceProject = {
      ...currentProject,
      id: '22222222-2222-4222-8222-222222222222',
      projectName: '临时参考项目',
      brandName: '参考茶研',
      detectedBrandName: '参考茶研',
      status: 'draft',
      lastReportFilename: null,
      assets: [
        { originalName: 'reference.png', mimeType: 'image/png', sha256: 'abc' }
      ]
    };
    let removedProjectId = '';
    const projects = {
      get: async () => currentProject,
      create: async () => referenceProject,
      paths: async (projectId: string) => projectId === currentProject.id
        ? { root: currentRoot, input: path.join(currentRoot, 'input'), prepared: '', outputs: path.join(currentRoot, 'outputs'), runtime: '' }
        : { root: referenceRoot, input: path.join(referenceRoot, 'input'), prepared: '', outputs: path.join(referenceRoot, 'outputs'), runtime: '' },
      scan: async () => ({ totalFiles: 3 }),
      remove: async (projectId: string) => { removedProjectId = projectId; }
    };
    const styleRule = (rule: string): ReferenceStyleRule => ({
      rule,
      evidence: ['visual-001'],
      designEffect: '形成清晰、统一且可执行的视觉效果。',
      confidence: 0.9
    });
    const currentProfile: CurrentProjectProfile = {
      schemaVersion: 'current-project-profile-v3',
      projectId: currentProject.id,
      projectName: currentProject.projectName,
      brandName: currentProject.brandName,
      industry: '茶饮 / 现制饮品',
      coreProducts: ['原叶茶饮', '冷泡茶', '茶点'],
      targetAudience: ['重视品质与效率的都市白领用户'],
      brandPositioning: '现代、克制且可信赖的日常茶饮',
      usageScenarios: ['办公', '通勤', '朋友小聚'],
      businessTouchpoints: ['包装', '海报', 'VI 应用', '空间与门店'],
      packagingStructures: ['现有饮品杯与手提包装结构'],
      lockedAssets: ['当前项目原始 Logo', 'logo.png', '品牌名称不可更改'],
      confirmedFacts: ['品牌名称不可更改'],
      sourceArtifactIds: ['project:test', 'visual-001'],
      visualSources: {
        productForms: ['原叶舒展', '杯口弧线'],
        cookingActions: ['冷泡注水'],
        sensorySignals: ['茶汤透亮'],
        consumptionActions: ['手持饮用'],
        brandNameSemantics: ['云岭', '茶集'],
        spatialObjects: ['饮品杯', '门店菜单']
      },
      touchpointInventory: {
        primaryPackaging: ['现有饮品杯与手提包装结构'],
        secondaryPackaging: [],
        serviceMaterials: [],
        viApplications: ['菜单', '工作服'],
        spatialTouchpoints: ['门店招牌', '菜单墙'],
        digitalTouchpoints: ['数字模板']
      }
    };
    const referenceStyle: ReferenceStyleProfile = {
      schemaVersion: 'reference-style-profile-v3',
      overallTemperament: [styleRule('整体保持克制、温暖与具有呼吸感的现代气质。')],
      colorSystem: [styleRule('暖米白承担大面积背景，低饱和暖色形成重点，深色文字建立对比。')],
      compositionSystem: [styleRule('主体居中偏下并保留大面积上方留白，信息集中于稳定网格。')],
      graphicLanguage: [styleRule('细线弧形以重复和局部裁切形成连接主体与信息区的节奏。')],
      typographySystem: [styleRule('标题、产品名和说明文字使用三级字号与字重层级。')],
      materialSystem: [styleRule('哑光纸张与细腻自然表面建立温和、真实的触感。')],
      lightingSystem: [styleRule('柔和侧逆光形成受控阴影和清晰的主体轮廓。')],
      photographySystem: [styleRule('近距离主体摄影配合浅景深与自然湿润高光突出真实质感。')],
      packagingPresentation: [styleRule('包装以固定母版、受控色块和单一主体摄影形成系列。')],
      posterPresentation: [styleRule('海报使用单一大主体、固定标题区和充足呼吸留白。')],
      viExtensionSystem: [styleRule('不同 VI 触点共用图形路径、色彩比例与信息网格。')],
      excludedIdentityTerms: ['参考茶研'],
      sourceAssetIds: ['visual-001']
    };
    const visualDirection: VisualReconstructionDirection = {
      directionName: '茶香留白',
      coreProposition: '以云岭茶集的原叶茶饮为核心，在都市日常场景中建立温暖克制的现代茶饮视觉。',
      visualAnchor: '将原叶舒展、冷泡水流和杯口弧线整合为连续曲线路径，连接产品近景、包装裁切、海报动线与菜单分区。',
      visualAnchorDefinition: {
        name: '茶流成形',
        sourceElements: ['原叶舒展', '冷泡注水', '杯口弧线'],
        transformationLogic: '将原叶舒展、冷泡注水和杯口弧线提炼为连续曲线路径。',
        visualForm: '连续曲线连接产品近景、包装裁切、海报动线与菜单分区。',
        extensionTouchpoints: ['包装', '海报', 'VI 应用', '空间'],
        referenceSurfaceSimilarityRisk: 'low'
      },
      executionDetailLevel: 'gpt_visual',
      referenceInheritance: [
        { level: 'principle', weight: 1, rule: '继承清晰层级原则。' },
        { level: 'relationship', weight: 0.8, rule: '继承暖色与中性色关系。' },
        { level: 'surface', weight: 0.35, rule: '表层颜色和字体仅作弱参考。' }
      ],
      currentProjectIdentityToRetain: ['云岭茶集', '茶饮 / 现制饮品', '原叶茶饮', '当前项目原始 Logo'],
      currentVisualElementsToRedesign: ['背景色面积', '构图网格', '辅助图形与摄影表现'],
      flexibleCompositionSystem: {
        fixedPrinciples: ['产品始终是第一视觉主体并保留稳定信息区。'],
        allowedVariations: ['海报可采用偏心构图。', '系列可通过近景、俯拍和局部裁切变化。'],
        seriesConsistencyRules: ['以曲线路径和信息层级维持系列一致。'],
        prohibitedLayouts: ['标题覆盖产品主体']
      },
      compositionSystem: ['产品始终是第一视觉主体并保留稳定信息区。', '海报可采用偏心构图。', '系列可通过近景、俯拍和局部裁切变化。'],
      graphicSystem: ['从茶叶舒展、水流和杯口轮廓提取连续细线曲线，不使用参考项目专属符号。'],
      flexibleColorSystem: {
        identityColorRole: '当前品牌色承担识别重点，不要求大面积满铺。',
        backgroundOptions: ['包装可选暖米白背景。', '海报按主体对比调整暖色面积。'],
        textAndStructureColors: ['深炭灰承担文字和结构层级。'],
        accentOptions: ['少量冷中性色平衡空间层次。'],
        saturationGuideline: '保持暖色识别与中性色缓冲的关系。',
        touchpointVariations: ['包装优先信息清晰。', '海报可强化情绪色。', '空间按材质调整色彩。']
      },
      colorSystem: ['当前品牌色承担识别重点，不要求大面积满铺。', '包装可选暖米白背景，海报按主体对比调整暖色面积。', '少量冷中性色平衡空间层次。'],
      typographySystem: ['品牌标题、产品名称和说明信息形成三级字号与字重关系。'],
      materialSystem: ['包装使用哑光纸张、细腻压纹与局部压凹工艺。'],
      lightingSystem: ['摄影和渲染使用柔和侧逆光、受控阴影与自然高光。'],
      photographySystem: ['使用原叶茶饮近距离摄影、平视或轻俯视镜头、浅景深和自然湿润质感。'],
      touchpointRules: {
        packaging: ['暖米白覆盖包装主背景，品牌色控制为小面积识别重点。', 'Logo 位于固定安全区，产品名和说明形成三级信息层级。', '原叶茶饮近景位于正面下方并与连续曲线路径衔接。', '哑光纸张、局部压凹和柔和侧光保持一致，系列仅替换产品摄影与受控色块。'],
        poster: ['原叶茶饮近景占画面三分之一，上方保留标题和大面积留白。', '平视或轻俯视镜头配合暖米白背景与柔和侧逆光。', '连续曲线只连接产品和信息区，系列海报仅改变产品与标题。'],
        vi: ['手提袋、菜单和数字模板共用固定网格与暖米白主背景。', 'Logo 始终遵守安全区，品牌色只用于识别节点。', '触点只替换产品信息和曲线路径长度，不改变母版层级。'],
        space: ['门店灯箱、菜单墙和导视延续暖米白、深炭灰与柔和侧光。']
      },
      prohibitedActions: ['不得复制参考身份：参考茶研', '不得修改 Locked Asset：当前项目原始 Logo']
    };
    const pipeline = {
      analyzeCurrentProjectProfile: async () => ({
        value: currentProfile, provider: 'test', model: 'test', durationMs: 1, modelCallCount: 1
      }),
      analyzeReferenceStyle: async () => ({
        value: referenceStyle, provider: 'test', model: 'test', durationMs: 1, modelCallCount: 1
      }),
      generateVisualReconstructionDecision: async () => ({
        value: visualDirection, provider: 'test', model: 'test', durationMs: 1, modelCallCount: 1
      })
    };
    const settings = { ...settingsWith(dataPath), defaultProfileId: 'profile-1' };
    const service = createReferenceTranslationService(
      () => settings,
      { projects, pipeline } as never
    );
    const referencePath = path.join(temporary, 'reference.png');
    await fs.writeFile(referencePath, 'placeholder', 'utf8');

    const result = await service.runUserInput({
      referenceAssetPaths: [referencePath],
      currentProjectId: currentProject.id,
      preference: '继承克制材质与中轴构图'
    });

    assert.equal(result.run.status, 'completed');
    assert.equal(result.run.projectContextFilename, '当前茶饮项目');
    assert.equal(removedProjectId, referenceProject.id);
    const runRoot = path.join(dataPath, 'reference-translation-v1', result.run.id);
    const visual = JSON.parse(await fs.readFile(path.join(runRoot, 'intermediate', 'reference-visual-analysis.json'), 'utf8'));
    const context = JSON.parse(await fs.readFile(path.join(runRoot, 'input', 'project-context.json'), 'utf8'));
    assert.equal(visual.schemaVersion, 'reference-visual-evidence-v2');
    assert.equal(visual.assetCount, 3);
    assert.equal(context.currentProjectProfile.projectId, currentProject.id);
    assert.equal(context.currentProjectProfile.industry, '茶饮 / 现制饮品');
    assert.deepEqual(context.currentProjectProfile.lockedAssets, currentProfile.lockedAssets);
    assert.equal(result.reconstruction?.validation.passed, true);
    assert.match(result.run.reportFilename || '', /视觉方案参考风格重构执行文档\.md$/);
    const brief = await fs.readFile(path.join(runRoot, result.run.reportFilename!), 'utf8');
    assert.match(brief, /## 7\. GPT 生图执行约束/);
    assert.match(brief, /Anchor Image/);
    assert.doesNotMatch(brief, /PTM-\d+/);
    assert.match(brief, /不得复制参考身份：参考茶研/);
    const { prohibitedActions: _prohibitedActions, ...executableDirection } =
      result.reconstruction!.visualReconstructionDirection;
    assert.doesNotMatch(JSON.stringify(executableDirection), /参考茶研/);
    for (const filename of [
      'current-project-profile.json',
      'reference-style-profile.json',
      'visual-reconstruction-direction.json',
      'quality-validation.json'
    ]) {
      await fs.access(path.join(runRoot, 'intermediate', filename));
    }

    pipeline.generateVisualReconstructionDecision = async () => {
      throw Object.assign(new Error('核心视觉方向不可执行：posterSpecific（缺少：标题）'), {
        code: 'VISUAL_DIRECTION_NOT_EXECUTABLE',
        structuredStep: 'visual-reconstruction-decision',
        structuredAttempts: [{
          attempt: 1,
          completedAt: '2026-07-24T00:00:00.000Z',
          rawResponse: '{"touchpointRules":{"poster":[]}}',
          validationError: {
            code: 'VISUAL_DIRECTION_NOT_EXECUTABLE',
            message: '核心视觉方向不可执行：posterSpecific（缺少：标题）',
            issues: ['posterSpecific'],
            details: { poster: ['标题'] }
          }
        }]
      });
    };
    await assert.rejects(
      () => service.runUserInput({
        referenceAssetPaths: [referencePath],
        currentProjectId: currentProject.id
      }),
      /posterSpecific/
    );
    const failed = (await service.listRuns()).find((run) => run.status === 'failed');
    assert.equal(failed?.error?.code, 'VISUAL_DIRECTION_NOT_EXECUTABLE');
    const failureEvidence = JSON.parse(await fs.readFile(path.join(
      dataPath,
      'reference-translation-v1',
      failed!.id,
      'logs',
      'structured-attempts.json'
    ), 'utf8'));
    assert.equal(failureEvidence.step, 'visual-reconstruction-decision');
    assert.equal(failureEvidence.attempts[0].validationError.details.poster[0], '标题');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('reference translation rejects non-JSON input and missing files', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-reference-translation-'));
  try {
    const service = createReferenceTranslationService(() => settingsWith(path.join(temporary, 'data')));
    const textPath = path.join(temporary, 'notes.txt');
    await fs.writeFile(textPath, 'not json', 'utf8');
    const contextPath = path.join(temporary, 'context.json');
    await fs.writeFile(contextPath, '{}', 'utf8');

    await assert.rejects(
      () => service.run({ visualAnalysisPath: textPath, projectContextPath: contextPath }),
      /必须是 JSON 文件/
    );
    await assert.rejects(
      () => service.run({ visualAnalysisPath: path.join(temporary, 'missing.json'), projectContextPath: contextPath }),
      /不存在或不是文件/
    );
    const invalidJsonPath = path.join(temporary, 'broken.json');
    await fs.writeFile(invalidJsonPath, '{broken', 'utf8');
    await assert.rejects(
      () => service.run({ visualAnalysisPath: invalidJsonPath, projectContextPath: contextPath }),
      /不是合法 JSON/
    );
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('reference asset inspection recursively filters folders and removes duplicates', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-reference-assets-'));
  try {
    const nested = path.join(temporary, 'nested');
    await fs.mkdir(nested);
    const image = path.join(nested, 'key-visual.png');
    await fs.writeFile(image, 'not-a-real-image', 'utf8');
    await fs.writeFile(path.join(nested, 'notes.txt'), 'skip me', 'utf8');
    const service = createReferenceTranslationService(() => settingsWith(path.join(temporary, 'data')));
    const inspected = await service.inspectAssets([nested, image]);
    assert.equal(inspected.items.length, 1);
    assert.equal(inspected.items[0]?.name, 'key-visual.png');
    assert.equal(inspected.duplicateCount, 1);
    assert.deepEqual(inspected.skipped, ['notes.txt']);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
