import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  classifyTransferability,
  mapReferenceToProject,
  runReferenceTranslation,
  synthesizeReferenceVisualDNA,
  validateReferenceTranslationProfile,
  validateVisualSourceRole
} from '../../src/reference-translation/index.js';

const execFileAsync = promisify(execFile);

const visualAnalysis = {
  schema_version: 'visual-asset-evidence-v1',
  detectedIndustry: '精品食品',
  touchpoints: ['包装', '海报', '网站'],
  assetCount: 6,
  visualAssetEvidence: {
    logo: [{
      evidence_id: 'REF-LOGO', source: 'ref-001',
      observation: '参考品牌 Logo 与定制字形固定占据左上角识别区', confidence: 0.98
    }],
    layout: [{
      evidence_id: 'REF-LAYOUT', source: 'ref-002',
      observation: '十二列建筑化模块网格控制大面积留白与信息层级', confidence: 0.9
    }],
    color: [{
      evidence_id: 'REF-COLOR', source: 'ref-003',
      observation: '低饱和主色配合单一高明度强调色形成节奏', confidence: 0.85
    }],
    typography: [{
      evidence_id: 'REF-TYPE', source: 'ref-004',
      observation: '标题与注释使用三级字号和明显字重差组织阅读顺序', confidence: 0.88
    }],
    photography: [{
      evidence_id: 'REF-PHOTO', source: 'ref-005',
      observation: '侧逆光沿材料边缘形成轮廓，浅景深突出产品触感', confidence: 0.86
    }],
    reusable_assets: [{
      evidence_id: 'REF-SERIES', source: 'ref-006',
      observation: '包装、海报与网站共享模块母版，通过主体比例变化形成系列', confidence: 0.91
    }]
  }
};

const projectContext = {
  brandIdentity: {
    brandName: '当前品牌',
    industry: '功能食品',
    brandRole: '面向家庭的可信产品品牌'
  },
  product: '日常营养产品',
  audience: ['年轻家庭'],
  businessModel: '品牌直销与零售',
  lockedAssets: ['当前品牌 Logo', '包装瓶型']
};

test('visual source roles are explicit and competitor routing remains disabled in MVP', () => {
  assert.equal(validateVisualSourceRole('current_project'), 'current_project');
  assert.equal(validateVisualSourceRole('reference_project'), 'reference_project');
  assert.throws(() => validateVisualSourceRole('competitor_benchmark'), /尚未启用/u);
  assert.throws(() => validateVisualSourceRole('unknown'), /未知视觉来源角色/u);
});

test('Reference Visual DNA explains mechanisms with evidence instead of adjective-only style labels', () => {
  const result = synthesizeReferenceVisualDNA(visualAnalysis);
  assert.equal(result.referenceIdentity.completeness, 'high');
  assert.ok(result.referenceVisualDNA.compositionRules.length);
  assert.ok(result.referenceVisualDNA.materialAndLighting.length);
  const rules = Object.values(result.referenceVisualDNA).flat();
  assert.ok(rules.every((rule) => rule.evidence.length && rule.mechanism.length > rule.name.length));
  assert.ok(rules.every((rule) => rule.function && rule.confidence >= 0 && rule.confidence <= 1));
});

test('transferability is mutually exclusive and protects reference signature assets', () => {
  const synthesis = synthesizeReferenceVisualDNA(visualAnalysis);
  const result = classifyTransferability(synthesis.referenceVisualDNA);
  const all = Object.values(result).flat();
  assert.equal(new Set(all.map((item) => item.item_id)).size, all.length);
  assert.ok(result.prohibitedToCopy.some((item) => /Logo|字形/u.test(item.name)));
  assert.ok(result.directlyTransferable.some((item) => /网格|光|字号|系列/u.test(item.name)));
});

test('project translation rebuilds semantics and carries every Locked Asset constraint', () => {
  const synthesis = synthesizeReferenceVisualDNA(visualAnalysis);
  const transferability = classifyTransferability(synthesis.referenceVisualDNA);
  const matrix = mapReferenceToProject({
    referenceVisualDNA: synthesis.referenceVisualDNA,
    transferability,
    projectContext,
    preference: '喜欢秩序感，不继承配色'
  });
  assert.ok(matrix.length);
  assert.ok(matrix.every((item) => /当前品牌|功能食品|日常营养/u.test(item.projectCondition)));
  assert.ok(matrix.every((item) => item.prohibitedElements.some((value) => value.includes('当前品牌 Logo'))));
  assert.ok(matrix.every((item) => item.prohibitedElements.some((value) => value.includes('包装瓶型'))));
});

test('standalone runner persists a validated profile, run metrics and exact cache hit', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'reference-translation-'));
  const visualPath = path.join(temporary, 'visual-analysis.json');
  const projectPath = path.join(temporary, 'project-context.json');
  const outputPath = path.join(temporary, 'reference-translation-profile.json');
  await fs.writeFile(visualPath, JSON.stringify(visualAnalysis), 'utf8');
  await fs.writeFile(projectPath, JSON.stringify(projectContext), 'utf8');
  const times = [
    new Date('2026-07-23T00:00:00.000Z'),
    new Date('2026-07-23T00:00:01.000Z')
  ];
  const first = await runReferenceTranslation({
    visualAnalysisPath: visualPath,
    projectContextPath: projectPath,
    outputPath,
    now: () => times.shift()
  });
  assert.equal(first.run.status, 'completed');
  assert.equal(first.run.model_calls, 0);
  assert.equal(first.run.steps.length, 4);
  assert.equal(validateReferenceTranslationProfile(JSON.parse(await fs.readFile(outputPath, 'utf8'))).source_role, 'reference_project');

  const second = await runReferenceTranslation({
    visualAnalysisPath: visualPath,
    projectContextPath: projectPath,
    outputPath
  });
  assert.equal(second.run.cache_hit, true);
  assert.equal(second.profile.projectTranslationMatrix.length, first.profile.projectTranslationMatrix.length);
});

test('low-quality input lowers completeness but still returns a conservative matrix', async () => {
  const result = synthesizeReferenceVisualDNA({
    assetCount: 2,
    visualAssetEvidence: { logo: [{ source: 'cover-only', observation: '参考品牌 Logo' }] }
  });
  assert.equal(result.referenceIdentity.completeness, 'low');
  assert.ok(result.referenceIdentity.missingEvidence.length);
  const transferability = classifyTransferability(result.referenceVisualDNA);
  const matrix = mapReferenceToProject({
    referenceVisualDNA: result.referenceVisualDNA,
    transferability,
    projectContext: {}
  });
  assert.equal(matrix.length, 1);
  assert.equal(matrix[0].confidence, 0.2);
});

test('npm reference-translate command executes the documented CLI contract', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'reference-translation-cli-'));
  const visualPath = path.join(temporary, 'visual-analysis.json');
  const projectPath = path.join(temporary, 'project-context.json');
  const outputPath = path.join(temporary, 'profile.json');
  await fs.writeFile(visualPath, JSON.stringify(visualAnalysis), 'utf8');
  await fs.writeFile(projectPath, JSON.stringify(projectContext), 'utf8');
  const { stdout } = await execFileAsync(process.execPath, [
    './scripts/reference-translate.mjs',
    '--visual-analysis', visualPath,
    '--project-context', projectPath,
    '--output', outputPath
  ], { cwd: path.resolve('.') });
  assert.match(stdout, /Reference Translation：已完成/u);
  assert.equal((await fs.stat(outputPath)).isFile(), true);
  assert.equal((await fs.stat(`${outputPath}.run.json`)).isFile(), true);
});

