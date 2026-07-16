import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrandDnaReportViewModel,
  compileBrandDnaReport,
  recompileLegacyBrandDnaReport,
  validateBrandDnaReport
} from '../../src/v5/brand-dna/report-compiler.js';
import { normalizeEvidenceQuote } from '../../src/v5/brand-dna/report-v2/normalize-evidence-quote.js';
import {
  escapeMarkdownTableCell,
  MAX_TABLE_CELL_CHARS
} from '../../src/v5/brand-dna/report-v2/markdown-sanitizer.js';
import {
  sanitizeProjectIdentity
} from '../../src/v5/brand-dna/report-v2/source-document-registry.js';
import {
  validateCreativeThesisCoverage,
  validateGeneDistinctiveness,
  validateTextPolicyConsistency,
  validateVisualTechnicalParameters
} from '../../src/v5/brand-dna/report-v2/content-quality-pass.js';

const sourceId = '6a1bef3a-6cf1-4e8e-aca6-4166859f7734';

function reportFact(value, status = 'confirmed') {
  return {
    value,
    status,
    confidence: status === 'confirmed' ? 'high' : 'medium',
    evidenceIds: status === 'confirmed' ? ['evidence-0001'] : [],
    evidence: status === 'confirmed' ? [{
      documentId: sourceId,
      filename: `${sourceId}.docx`,
      section: '品牌身份',
      excerpt: '• 品牌身份：\n九州美学，九州通医药集团旗下的医美业务板块。\n九州美学，九州通医药集团旗下的医美业务板块。'
    }] : []
  };
}

function reportDna() {
  const fact = (value, status) => reportFact(value, status);
  return {
    projectName: fact('九州美学品牌 DNA 合成'),
    brandName: fact('九州美学'),
    category: fact('医美产业链服务平台'),
    businessModel: fact('B2B 供应链与机构赋能'),
    developmentStage: fact('独立品牌建设期', 'inferred'),
    audience: {
      primary: [fact('医美机构经营者')],
      secondary: [],
      needs: [fact('稳定、合规的一站式供应服务')],
      barriers: [fact('新品牌独立认知不足', 'inferred')],
      usageScenarios: [fact('供应链采购与机构运营')]
    },
    strategy: {
      purpose: fact('连接并赋能医美产业生态'),
      positioning: fact('中国医美全链生态赋能平台'),
      brandPromise: fact('以可信供应链支持机构稳定经营'),
      differentiators: [fact('全国供应链与温层管理能力')],
      valueProposition: [fact('让机构获得稳定合规的供应体验')],
      brandValues: [fact('合规、连接、长期主义')]
    },
    personality: {
      traits: [fact('严谨而有温度', 'inferred')],
      relationshipRole: fact('可信赖的生态连接者'),
      toneOfVoice: [],
      emotionalOutcome: [fact('安心与从容', 'inferred')]
    },
    culture: { culturalContext: [], symbolicAssets: [], narrativeThemes: [] },
    boundaries: {
      prohibitedClaims: [fact('不得宣称未经证实的医疗疗效', 'suggested')],
      prohibitedStyles: [fact('避免医疗恐惧和黑金奢华', 'suggested')],
      complianceRisks: []
    },
    genes: [
      { id: 'gene-functional', type: 'functional', statement: '让机构获得稳定合规的一站式供应体验', confidence: 'high', evidenceIds: ['evidence-0001'], evidence: [] },
      { id: 'gene-capability', type: 'capability', statement: '依托全国物流、GSP 管理和上下游整合能力', confidence: 'high', evidenceIds: ['evidence-0001'], evidence: [] },
      { id: 'gene-relational', type: 'relational', statement: '成为机构与产业资源之间的连接者', confidence: 'medium', evidenceIds: ['evidence-0001'], evidence: [] },
      { id: 'gene-emotional', type: 'emotional', statement: '带来安心与从容', confidence: 'medium', evidenceIds: ['evidence-0001'], evidence: [] },
      { id: 'gene-cultural', type: 'cultural', statement: '科学有度，美有温度', confidence: 'medium', evidenceIds: ['evidence-0001'], evidence: [] },
      { id: 'gene-behavioral', type: 'behavioral', statement: '以合规流程稳定兑现承诺', confidence: 'medium', evidenceIds: ['evidence-0001'], evidence: [] },
      { id: 'gene-aesthetic', type: 'aesthetic', statement: '严谨边界中的柔性连接', confidence: 'medium', evidenceIds: ['evidence-0001'], evidence: [] }
    ],
    oneSentenceDna: '以可信供应链连接医美生态。',
    diagnosis: {
      conflicts: [],
      missingInformation: ['是否存在已批准 Logo'],
      genericStatements: [],
      strategicRisks: ['不能被表现为直接提供医疗服务的机构']
    },
    creativeTranslation: {
      creativeThesis: '科学有度，美有温度：以可信供应链连接医美生态。',
      visualPersonality: ['严谨', '温度', '连接'],
      visualKeywords: ['合规边界', '生态节点'],
      emotionalTemperature: ['可信而克制'],
      colorDirection: [],
      typographyDirection: [],
      graphicDirection: [],
      compositionDirection: [],
      photographyDirection: [],
      illustrationDirection: [],
      materialDirection: [],
      lightingDirection: [],
      motionDirection: [],
      suggestedAssets: ['全国节点构成的九州连接场'],
      avoidDirections: ['不得伪造认证标识'],
      mappings: [{
        dnaGeneId: 'gene-functional',
        visualVariable: 'composition',
        decision: '节点连接构图',
        rationale: '表达平台连接能力'
      }],
      generationPlan: []
    }
  };
}

function imageSystem() {
  return {
    systemId: 'image-system-v2',
    anchorVisual: '合规边界内的柔性节点连接',
    compositionSystem: '稳定边界与节点连接并存',
    colorSystem: [],
    materialSystem: ['哑光金属', '半透明界面'],
    lightingSystem: '中性漫射光与局部柔和高光',
    imageLanguage: '真实供应场景与抽象连接机制结合',
    consistencyRules: ['所有图片沿用同一节点连接语法'],
    lockedFacts: ['品牌是医美产业链服务平台，不是医疗机构'],
    knownAssets: [],
    creativeFreedom: ['可设计不冒充认证的抽象连接图形'],
    globalProhibitions: ['不得伪造 Logo', '不得伪造认证标识'],
    textPolicy: '不生成正式品牌文字',
    logoPolicy: '未提供已批准 Logo，不得生成或仿造 Logo'
  };
}

function imageTasks() {
  return [{
    id: 'task-1',
    sequence: 1,
    title: '品牌视觉锚点',
    role: 'anchor-image',
    objective: '建立严谨边界与柔性连接的视觉母题',
    brandDnaBasis: ['gene-functional'],
    viewerTakeaway: '可信供应链正在连接医美生态',
    subject: '抽象节点与真实供应链场景',
    environment: '现代供应链控制中心',
    narrativeMoment: '节点网络稳定运行',
    requiredElements: ['节点连接场'],
    optionalElements: [],
    prohibitedElements: ['Logo', '认证徽章'],
    composition: '稳定中心与向外连接的节点',
    focalHierarchy: '先边界，后节点，再看连接',
    cameraAndPerspective: '平视中景',
    colorDirection: '中性蓝灰与柔和暖色',
    materialAndTexture: '哑光金属与半透明界面',
    lighting: '中性漫射光',
    atmosphere: '可信、严谨、有温度',
    lockedAssetInstructions: [],
    consistencyWithGlobalSystem: ['沿用节点连接语法'],
    consistencyWithPreviousTasks: [],
    intentionalDifferenceFromPreviousTasks: ['首张图建立全局视觉母题'],
    aspectRatio: '16:9',
    textPolicy: 'no-text',
    logoPolicy: 'no-logo',
    finalPrompt: 'A precise healthcare supply-chain network connecting verified ecosystem nodes, no text, no logo.'
  }];
}

test('report v2 hides UUID filenames, cleans identity, and separates readable report from appendices', () => {
  const dna = reportDna();
  const tasks = imageTasks();
  const system = imageSystem();
  const markdown = compileBrandDnaReport(dna, {
    imageSystem: system,
    imageTasks: tasks,
    sourceDocuments: [{
      id: sourceId,
      filename: '九州美学品牌定位提案-1.1(1).docx',
      sourceType: 'docx'
    }],
    qualityAudit: {
      passed: true,
      totalScore: 88,
      dimensionScores: { evidence: 18, strategy: 18, imageExecution: 9 },
      hardFailures: [],
      repairInstructions: []
    },
    metadata: {
      protocolVersion: 'brand-dna-v1.1',
      brandDnaSchemaVersion: 'brand-dna-schema-v1',
      imageTaskSchemaVersion: 'gpt-image-task-v2',
      modelId: 'qwen3.6-plus',
      qualityTier: 'qualified'
    }
  });
  assert.match(markdown, /^# 九州美学\n## 品牌 DNA 与创意转译报告/);
  assert.doesNotMatch(markdown, new RegExp(sourceId));
  assert.match(markdown, /《九州美学品牌定位提案-1\.1》/);
  assert.match(markdown.split('# 执行附录')[0], /\*\*短引\*\*：品牌身份：九州美学，九州通医药集团旗下的医美业务板块。/);
  assert.match(markdown, /## 0\. 执行摘要/);
  assert.match(markdown, /# 执行附录/);
  assert.match(markdown, /## A1\. 视觉锚点图/);
  assert.match(markdown, /### Brand DNA 依据\n\n- G01/);
  assert.match(markdown, /### 最终英文 Prompt\n\n```text\nA precise/);
  assert.doesNotThrow(() => validateBrandDnaReport(markdown, {
    imageSystem: system,
    imageTasks: tasks
  }));
  const mainReport = markdown.split('# 执行附录')[0];
  assert.doesNotMatch(mainReport, /anchor-image/);
  assert.doesNotMatch(mainReport, /qwen3\.6-plus/);
});

test('legacy v1 data without source registry falls back to readable numbered sources', () => {
  const viewModel = buildBrandDnaReportViewModel(reportDna(), {
    imageSystem: imageSystem(),
    imageTasks: imageTasks(),
    qualityAudit: { passed: true, totalScore: 85, dimensionScores: {} }
  });
  assert.deepEqual(viewModel.identity.sourceFileTitles, ['来源文档 1']);
  assert.equal(viewModel.genes[0].id, 'G01');
  assert.equal(viewModel.genes[4].culturalMaturity, '待评估');
});

test('legacy report recompilation accepts desktop originalName and preserves metadata', () => {
  const dna = reportDna();
  const intermediates = {
    imageSystem: imageSystem(),
    imageTasks: imageTasks(),
    qualityAudit: { passed: true, totalScore: 85, dimensionScores: {} }
  };
  const metadata = { modelId: 'qwen3.6-plus', qualityTier: 'experimental' };
  const sourceDocuments = [{
    id: sourceId,
    originalName: '九州美学品牌定位提案-1.1(1).docx',
    sourceType: 'docx'
  }];
  const markdown = recompileLegacyBrandDnaReport({
    brandDna: dna,
    intermediates,
    metadata,
    sourceDocuments
  });
  assert.match(markdown, /《九州美学品牌定位提案-1\.1》/);
  assert.match(markdown, /- \*\*模型\*\*：qwen3\.6-plus/);
  assert.equal(markdown, compileBrandDnaReport(dna, {
    ...intermediates,
    metadata,
    sourceDocuments
  }));
});

test('evidence quote normalization removes DOCX soft breaks, bullets, duplicate lines, and long table cells', () => {
  assert.equal(
    normalizeEvidenceQuote('• 品牌身份：\n 九州美学是集团旗下品牌。\n九州美学是集团旗下品牌。'),
    '品牌身份：九州美学是集团旗下品牌。'
  );
  const cell = escapeMarkdownTableCell('A'.repeat(200));
  assert.equal(cell.length, MAX_TABLE_CELL_CHARS);
  assert.ok(cell.endsWith('…'));
});

test('content pass detects gene overlap and text-policy conflicts', () => {
  assert.equal(
    validateGeneDistinctiveness([
      { type: 'functional', statement: '提供稳定合规的一站式供应链服务能力' },
      { type: 'capability', statement: '提供稳定合规的一站式供应链服务能力' }
    ])[0].code,
    'GENE_FUNCTION_CAPABILITY_OVERLAP'
  );
  assert.equal(
    validateTextPolicyConsistency({
      textPolicy: 'no-text',
      requiredElements: ['必须显示 10–25℃'],
      finalPrompt: 'No text'
    }, 0)[0].code,
    'TEXT_POLICY_CONFLICT'
  );
  assert.equal(
    validateTextPolicyConsistency({
      textPolicy: 'limited-verified-text',
      allowedText: [],
      intentionalDifferenceFromPreviousTasks: [
        '新增证明机构关系，采用不同场景视角，并避免重复前图构图'
      ]
    }, 1)[0].code,
    'ALLOWED_TEXT_MISSING'
  );
  assert.equal(
    validateTextPolicyConsistency({
      textPolicy: 'reserve-layout-area',
      intentionalDifferenceFromPreviousTasks: [
        '新增证明机构关系，采用不同场景视角，并避免重复前图构图'
      ]
    }, 1).length,
    0
  );
  assert.equal(
    validateCreativeThesisCoverage({
      capability: 5,
      relationship: 2,
      emotion: 4,
      culture: 4,
      differentiation: 2
    })[0].code,
    'CREATIVE_THESIS_COVERAGE_WEAK'
  );
  assert.equal(
    validateVisualTechnicalParameters({
      lighting: 'below 3000K cool light with no shadows and dramatic hard shadows',
      finalPrompt: 'A surgical procedure before-and-after comparison'
    }, 0)[0].code,
    'COLOR_TEMPERATURE_INCORRECT'
  );
  assert.equal(
    validateVisualTechnicalParameters({
      finalPrompt: '必须展示 GSP 认证徽章'
    }, 0, { lockedAssets: [], prohibitedElements: [] })[0].code,
    'CERTIFICATION_PROMPT_CONFLICT'
  );
  assert.equal(
    validateVisualTechnicalParameters({
      finalPrompt: '不得展示或生成 GSP 认证徽章'
    }, 0, { lockedAssets: [], prohibitedElements: [] }).length,
    0
  );
});

test('project identity sanitizer removes analysis task suffixes without changing the brand name', () => {
  assert.equal(sanitizeProjectIdentity('九州美学品牌 DNA 合成'), '九州美学');
  assert.equal(sanitizeProjectIdentity('九州美学分析报告'), '九州美学');
});
