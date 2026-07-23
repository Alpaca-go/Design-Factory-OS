import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createReferenceTranslationService } from '../src/main/reference-translation-service.ts';
import type { PublicSettings } from '../src/shared/types.ts';

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
    const generatedInputs = path.join(temporary, 'data', 'reference-translation-v1', result.run.id, 'inputs');
    assert.equal(
      JSON.parse(await fs.readFile(path.join(generatedInputs, 'reference-visual-analysis.json'), 'utf8')).detectedIndustry,
      '食品饮料'
    );
    assert.equal(
      JSON.parse(await fs.readFile(path.join(generatedInputs, 'project-context.json'), 'utf8')).brandIdentity.brandName,
      '云岭茶集'
    );

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
    await fs.writeFile(path.join(currentRoot, 'outputs', 'current-report.md'), '# 品牌分析\n\n品牌面向都市白领，强调自然、克制与可信赖。', 'utf8');
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
      industry: '茶饮',
      detectedIndustry: '茶饮',
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
        ? { root: currentRoot, input: '', prepared: '', outputs: path.join(currentRoot, 'outputs'), runtime: '' }
        : { root: referenceRoot, input: '', prepared: '', outputs: path.join(referenceRoot, 'outputs'), runtime: '' },
      remove: async (projectId: string) => { removedProjectId = projectId; }
    };
    const pipeline = {
      start: async () => ({
        project: { ...referenceProject, status: 'completed', lastReportFilename: 'reference-report.md' },
        reportPath: path.join(referenceRoot, 'outputs', 'reference-report.md'),
        assetCount: 3
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
    const inputsRoot = path.join(dataPath, 'reference-translation-v1', result.run.id, 'inputs');
    const visual = JSON.parse(await fs.readFile(path.join(inputsRoot, 'reference-visual-analysis.json'), 'utf8'));
    const context = JSON.parse(await fs.readFile(path.join(inputsRoot, 'project-context.json'), 'utf8'));
    assert.equal(visual.schema_version, 'reference-visual-analysis-v1');
    assert.equal(visual.assetCount, 3);
    assert.equal(context.projectId, currentProject.id);
    assert.deepEqual(context.lockedAssets, ['当前项目原始 Logo', 'logo.png']);
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
