import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createOpenAICompatibleTextReasoner
} from '../../src/v5/adapters/openai-compatible-text-reasoner.js';
import { runBrandDnaPipeline } from '../../src/v5/brand-dna/run-brand-dna-pipeline.js';
import {
  compileBrandDnaReport,
  validateBrandDnaReport
} from '../../src/v5/brand-dna/report-compiler.js';
import { normalizeStructuredStageOutput } from '../../src/v5/brand-dna/normalization/normalize-image-task-output.js';
import {
  createBrandDnaCheckpointStore,
  stableJsonHash
} from '../../src/v5/brand-dna/runtime/checkpoint-store.js';

const evidenceId = 'evidence-0001';

function fact(value, status = 'confirmed') {
  return {
    value,
    status,
    confidence: status === 'confirmed' ? 'high' : 'medium',
    evidenceIds: status === 'confirmed' ? [evidenceId] : [],
    evidence: []
  };
}

function dnaStage() {
  return {
    projectName: fact('九州美学'),
    brandName: fact('九州美学'),
    category: fact('东方生活方式品牌'),
    businessModel: fact('内容与产品结合'),
    developmentStage: fact('品牌建立期', 'inferred'),
    audience: {
      primary: [fact('重视文化审美与可信品质的城市青年')],
      secondary: [fact('东方美学爱好者', 'inferred')],
      needs: [fact('获得可进入日常生活的东方审美')],
      barriers: [fact('传统符号容易流于表面', 'inferred')],
      usageScenarios: [fact('居家与礼赠场景')]
    },
    strategy: {
      purpose: fact('让东方审美成为当代生活方法'),
      positioning: fact('可信、克制、可日常使用的东方生活方式品牌'),
      brandPromise: fact('提供有文化依据且能实际使用的产品体验'),
      differentiators: [fact('文化研究与实际产品体验结合')],
      valueProposition: [fact('降低东方美学进入日常生活的门槛')],
      brandValues: [fact('诚实'), fact('克制'), fact('长期主义')]
    },
    personality: {
      traits: [fact('克制'), fact('温和坚定')],
      relationshipRole: fact('可信赖的东方生活向导'),
      toneOfVoice: [fact('清晰而不卖弄')],
      emotionalOutcome: [fact('安定与从容')]
    },
    culture: {
      culturalContext: [fact('东方日常生活智慧')],
      symbolicAssets: [fact('留白与秩序', 'inferred')],
      narrativeThemes: [fact('传统如何进入今天')]
    },
    boundaries: {
      prohibitedClaims: [fact('不得编造文化权威背书', 'suggested')],
      prohibitedStyles: [fact('避免符号堆砌', 'suggested')],
      complianceRisks: [fact('产品功效需另行确认', 'missing')]
    },
    genes: [
      { id: 'gene-functional', type: 'functional', statement: '可进入日常生活', evidenceIds: [evidenceId], confidence: 'high' },
      { id: 'gene-capability', type: 'capability', statement: '文化研究支撑产品体验', evidenceIds: [evidenceId], confidence: 'high' },
      { id: 'gene-relational', type: 'relational', statement: '像可信赖的向导', evidenceIds: [evidenceId], confidence: 'medium' },
      { id: 'gene-emotional', type: 'emotional', statement: '带来安定与从容', evidenceIds: [evidenceId], confidence: 'high' },
      { id: 'gene-cultural', type: 'cultural', statement: '以东方生活智慧为根', evidenceIds: [evidenceId], confidence: 'high' },
      { id: 'gene-behavioral', type: 'behavioral', statement: '克制表达并持续验证', evidenceIds: [evidenceId], confidence: 'medium' },
      { id: 'gene-aesthetic', type: 'aesthetic', statement: '克制留白而非符号堆砌', evidenceIds: [evidenceId], confidence: 'medium' }
    ],
    oneSentenceDna: '品牌依靠文化研究能力，在当代生活情境中为重视审美的城市青年解决东方文化难以日常化的任务，以可信向导关系交付可使用与安定从容的价值，最终建立克制而真实的东方生活认知。',
    diagnosis: {
      conflicts: [],
      missingInformation: ['产品功效证据'],
      genericStatements: ['高端'],
      strategicRisks: ['若只使用传统符号会削弱差异化']
    }
  };
}

function strategicItem(statement) {
  return { statement, status: 'confirmed', evidenceIds: [evidenceId], confidence: 0.92 };
}

function imageSystem() {
  return {
    systemId: 'brand-image-system-v1',
    brandDnaSummary: '可信文化研究进入当代日常',
    creativeThesis: '让东方秩序在当代日常中缓慢显形',
    anchorVisual: '真实生活静物被稳定留白与柔和侧光组织成可感知的东方秩序',
    visualPersonality: ['克制', '从容'],
    compositionSystem: '稳定重心，大面积留白，主体不超过画面三分之一',
    colorSystem: [{ role: '背景', direction: '低饱和自然色', usage: '保持安定与真实' }],
    materialSystem: ['自然纤维', '哑光纸张'],
    lightingSystem: '柔和侧光，避免戏剧化高反差',
    imageLanguage: '真实生活静物与可观察使用痕迹',
    consistencyRules: ['所有任务沿用同一低饱和色彩角色', '所有任务保持稳定留白和柔和侧光'],
    lockedFacts: ['品牌名称与文档确认定位不得改变'],
    knownAssets: ['未提供正式 Logo 或既有视觉资产'],
    creativeFreedom: ['可在不新增业务事实的前提下设计概念静物场景'],
    globalProhibitions: ['不得伪造正式 Logo', '不得编造产品功效或市场数据'],
    textPolicy: '不生成准确长文字，只预留后期排版区域',
    logoPolicy: '未提供正式 Logo，不得生成、重绘或替代 Logo'
  };
}

function visualTranslation() {
  const direction = [{ direction: '低饱和自然色与稳定留白', rationale: '对应安定、克制的 DNA', actions: ['限制综合色相数量'] }];
  return {
    creativeTranslation: {
      visualPersonality: ['克制', '从容'],
      visualKeywords: ['留白', '秩序', '生活痕迹'],
      emotionalTemperature: ['温静'],
      colorDirection: direction,
      typographyDirection: direction,
      graphicDirection: direction,
      compositionDirection: direction,
      photographyDirection: direction,
      illustrationDirection: direction,
      materialDirection: direction,
      lightingDirection: direction,
      motionDirection: direction,
      suggestedAssets: ['Anchor Image', '品牌海报'],
      avoidDirections: ['传统符号堆砌', '虚构正式 Logo']
    },
    mappings: dnaStage().genes.map((gene, index) => ({
      dnaGeneId: gene.id,
      strategicMeaning: gene.statement,
      visualVariable: ['composition', 'color', 'shape', 'typography', 'material', 'lighting', 'rhythm'][index],
      decision: '建立可观察且克制的统一视觉动作',
      rationale: `由 ${gene.statement} 直接推导`,
      applicationExamples: ['品牌锚点图', '应用场景'],
      avoid: ['空泛风格词']
    }))
  };
}

function imageTasks() {
  const roles = ['anchor-image', 'brand-poster', 'application-scene', 'detail-craft'];
  return roles.map((role, index) => ({
    id: `task-${index + 1}`,
    systemId: 'brand-image-system-v1',
    sequence: index + 1,
    title: ['品牌锚点图', '品牌情绪海报', '日常应用场景', '材质细节图'][index],
    role,
    objective: ['建立全局视觉母题', '表达品牌核心情绪', '验证真实使用关系', '验证材质与工艺语言'][index],
    brandDnaBasis: ['gene-functional', 'gene-emotional'],
    viewerTakeaway: '这是一个可信、克制且能进入当代日常的东方生活方式品牌',
    subject: '不带品牌文字的真实生活静物组合',
    environment: '有自然光进入的当代居住空间',
    narrativeMoment: '使用行为刚刚发生后留下轻微生活痕迹',
    composition: '稳定重心，大面积留白，主体位于三分线附近',
    focalHierarchy: '先看到主体关系，再看到材质细节，最后感知留白',
    cameraAndPerspective: '平视中近景，使用自然透视，不使用夸张广角',
    colorDirection: '低饱和自然中性色，单一温和强调色承担视线引导',
    materialAndTexture: '哑光纸张、自然纤维与真实使用痕迹',
    lighting: '柔和侧光，控制高光，不使用舞台式强反差',
    atmosphere: '温静、可信、从容',
    requiredElements: ['真实生活静物', '大留白'],
    optionalElements: ['自然纤维'],
    prohibitedElements: ['虚构 Logo', '乱码文字', '未经确认的产品功效'],
    lockedAssetInstructions: ['没有现有 Logo 可使用，不得自行生成'],
    textPolicy: '不生成正式品牌文字，为后期排版预留清晰区域',
    logoPolicy: '不得伪造、重绘或替代正式 Logo',
    consistencyWithGlobalSystem: ['沿用 brand-image-system-v1 的色彩、留白、材质与光线'],
    consistencyWithPreviousTasks: index === 0 ? [] : ['延续前序任务的低饱和色彩、稳定留白和柔和侧光'],
    intentionalDifferenceFromPreviousTasks: [
      index === 0
        ? '负责建立锚点'
        : `本图新增证明${['', '情绪表达', '使用关系', '工艺细节'][index]}，采用不同场景视角，并避免重复前图构图`
    ],
    aspectRatio: index === 1 ? '4:5' : '3:2',
    outputResponsibility: ['建立母题', '表达情绪', '验证场景', '强化质感'][index],
    finalPrompt: `图片职责：${['建立全局视觉母题', '表达品牌核心情绪', '验证真实使用关系', '验证材质与工艺语言'][index]}。依据品牌 DNA 中“可进入日常生活”和“安定从容”，在有自然光进入的当代居住空间中呈现不带品牌文字的真实生活静物组合。采用稳定重心、大面积留白、平视中近景与自然透视；使用低饱和自然中性色、哑光纸张和自然纤维，以柔和侧光表现真实使用痕迹。沿用统一视觉锚点，但本图承担独立职责。禁止虚构 Logo、乱码长文字、未经确认的产品功效和市场信息；不生成正式品牌文字，只预留后期排版区域。`
  }));
}

function audit(passed = true) {
  return {
    passed,
    totalScore: passed ? 91 : 70,
    dimensionScores: {
      projectIdentityAndBoundaries: passed ? 14 : 10,
      evidence: passed ? 14 : 10,
      strategy: passed ? 14 : 10,
      diagnosis: 9,
      brandDna: 10,
      creativeThesis: 10,
      visualSpecificity: 9,
      imageExecution: passed ? 9 : 6,
      crossFieldTechnical: passed ? 5 : 2
    },
    hardFailures: passed ? [] : ['生图任务缺少足够的限制'],
    repairInstructions: passed ? [] : ['补齐所有图片任务的限制与一致性说明']
  };
}

const corpus = {
  documents: [{
    id: 'doc-1',
    filename: '品牌策划.md',
    sourceType: 'markdown',
    rawText: '品牌定位内容',
    sections: [{ heading: '品牌定位', content: '为城市青年提供可信赖的东方生活方式选择' }],
    tables: [],
    characterCount: 23,
    parseWarnings: []
  }],
  sourceIndex: [],
  mergedText: '品牌定位内容',
  warnings: []
};

function responseForStage(stage, options = {}) {
  const dna = dnaStage();
  const thesis = {
    selected: {
      statement: '让东方秩序在当代日常中缓慢显形',
      dnaBasis: ['gene-functional', 'gene-emotional'],
      visualPotential: '可通过留白、真实生活痕迹和柔和侧光形成跨触点系统'
    },
    rejectedCandidateSummaries: [{ reason: '过度依赖传统符号' }, { reason: '缺少真实使用关系' }],
    decisionScore: 92
  };
  const visual = visualTranslation();
  const system = imageSystem();
  if (options.visualCreativeFreedomAsString) {
    system.creativeFreedom = system.creativeFreedom[0];
  }
  const tasks = imageTasks();
  const outputs = {
    'atomic-evidence': {
      atomicEvidence: [{
        id: 'local-evidence',
        claim: '品牌面向城市青年提供可信赖的东方生活方式选择',
        category: 'positioning',
        status: 'explicit',
        sourceRefs: [{
          sourceId: options.sourceId,
          chunkId: options.chunkId,
          excerpt: '为城市青年提供可信赖的东方生活方式选择'
        }],
        confidence: 0.96
      }]
    },
    'normalized-facts': {
      normalizedFacts: [{
        id: 'fact-local',
        statement: '品牌面向城市青年提供可信赖的东方生活方式选择',
        status: 'confirmed',
        evidenceIds: [evidenceId],
        confidence: 0.96,
        reasoningSummary: '文档定位章节直接表达'
      }]
    },
    'strategic-model': {
      strategicModel: {
        categoryDefinition: strategicItem('东方生活方式品牌'),
        businessReality: strategicItem('内容与产品结合'),
        primaryAudience: [strategicItem('城市青年')],
        userContext: [strategicItem('希望东方审美进入日常生活')],
        jobsToBeDone: [strategicItem('获得可信且可使用的东方生活选择')],
        barriersAndTensions: [strategicItem('传统符号容易流于表面')],
        functionalValue: [strategicItem('降低进入门槛')],
        emotionalValue: [strategicItem('安定与从容')],
        socialValue: [strategicItem('形成不卖弄的文化认同')],
        positioning: strategicItem('可信、克制、可日常使用'),
        brandPromise: strategicItem('提供有文化依据且能实际使用的体验'),
        reasonsToBelieve: [strategicItem('文化研究支撑产品体验')],
        differentiators: [strategicItem('研究与日常使用结合')],
        relationshipModel: strategicItem('可信赖的向导')
      }
    },
    'strategic-critic': {
      strategicIssues: [{
        id: 'issue-1',
        severity: 'major',
        issue: '高端表达过于空泛',
        evidenceIds: [evidenceId],
        consequence: '无法指导视觉与产品决策',
        recommendation: '用文化依据和真实使用关系替代空泛定位',
        recommendationStatus: 'suggested'
      }]
    },
    'dna-synthesis': { brandDna: dna },
    'creative-thesis-decision': { creativeThesisDecision: thesis },
    'visual-causal-translation': { visualTranslation: visual, imageSystem: system },
    'gpt-image-task-compiler': { imageTasks: tasks },
    'quality-auditor': { qualityAudit: audit(options.auditPassed !== false) },
    'targeted-repair': {
      stageId: 'targeted-repair',
      operations: [{
        op: 'replace',
        path: '/imageTasks/1/finalPrompt',
        value: `${tasks[1].finalPrompt} subtle but distinct precision`
      }]
    }
  };
  return outputs[stage];
}

function mockReasoner(options = {}) {
  const attempts = new Map();
  const calls = [];
  const contexts = [];
  const prompts = [];
  const reasoner = async (messages, context = {}) => {
    const text = messages[1].content;
    const stage = text.match(/PROTOCOL_STAGE=([^\n]+)/)?.[1];
    assert.ok(stage);
    assert.ok(messages.every((message) => typeof message.content === 'string'));
    calls.push(stage);
    contexts.push(context);
    prompts.push(text);
    if (stage === 'structured-patch-repair') {
      const targetStage = text.match(/"stageId":"([^"]+)"/)?.[1];
      const allowedPaths = JSON.parse(
        text.match(/"allowedPaths":(\[[^\]]*\])/)?.[1] || '[]'
      );
      return {
        runId: `run-${calls.length}`,
        usageCallId: `usage-${calls.length}`,
        provider: 'mock',
        model: 'text-model',
        finishReason: 'stop',
        text: JSON.stringify({
          stageId: targetStage,
          targetObjectId: 'task-2',
          operations: allowedPaths.map((allowedPath) => ({
            op: 'replace',
            path: allowedPath,
            value: options.patchFails
              ? []
              : allowedPath.endsWith('/evidenceIds')
                ? [evidenceId]
                : ['延续第一张锚点图的低饱和色彩、稳定留白和柔和侧光']
          }))
        })
      };
    }
    const attempt = (attempts.get(stage) || 0) + 1;
    attempts.set(stage, attempt);
    if (options.invalidFirstStage === stage && attempt === 1) {
      if (stage === 'gpt-image-task-compiler') {
        const invalidTasks = imageTasks();
        invalidTasks[1].consistencyWithPreviousTasks = [];
        return {
          runId: `run-${calls.length}`,
          usageCallId: `usage-${calls.length}`,
          provider: 'mock',
          model: 'text-model',
          finishReason: 'stop',
          text: JSON.stringify({ imageTasks: invalidTasks })
        };
      }
      if (stage === 'strategic-critic') {
        const invalidIssues = responseForStage(stage, {
          chunkId: text.match(/"chunkId":"([^"]+)"/)?.[1],
          sourceId: text.match(/"sourceId":"([^"]+)"/)?.[1]
        });
        invalidIssues.strategicIssues[0].evidenceIds = ['evidence-does-not-exist'];
        invalidIssues.strategicIssues.push({
          ...structuredClone(invalidIssues.strategicIssues[0]),
          id: 'issue-2',
          evidenceIds: ['another-evidence-that-does-not-exist']
        });
        return {
          runId: `run-${calls.length}`,
          usageCallId: `usage-${calls.length}`,
          provider: 'mock',
          model: 'text-model',
          finishReason: 'stop',
          text: JSON.stringify(invalidIssues)
        };
      }
      return {
        runId: `run-${calls.length}`,
        usageCallId: `usage-${calls.length}`,
        provider: 'mock',
        model: 'text-model',
        text: '{}'
      };
    }
    const chunkId = text.match(/"chunkId":"([^"]+)"/)?.[1];
    const sourceId = text.match(/"sourceId":"([^"]+)"/)?.[1];
    const auditPassed = stage === 'quality-auditor'
      ? (options.auditSequence?.shift() ?? true)
      : true;
    return {
      runId: `run-${calls.length}`,
      provider: 'mock',
      model: 'text-model',
      text: JSON.stringify(responseForStage(stage, {
        chunkId,
        sourceId,
        auditPassed,
        visualCreativeFreedomAsString: options.visualCreativeFreedomAsString
      }))
    };
  };
  return { reasoner, calls, contexts, prompts };
}

test('Brand DNA deep protocol runs all stages, patches one malformed field, and compiles GPT image specs', async () => {
  const { reasoner, calls, contexts } = mockReasoner({ invalidFirstStage: 'gpt-image-task-compiler' });
  const stages = [];
  const result = await runBrandDnaPipeline({
    corpus,
    projectNameHint: '临时项目',
    qualityTier: 'experimental',
    reasoner,
    onProgress: ({ stage }) => stages.push(stage)
  });
  assert.equal(result.metadata.protocolVersion, 'brand-dna-v1.1');
  assert.equal(result.metadata.imageTaskSchemaVersion, 'gpt-image-task-v2');
  assert.equal(result.qualityAudit.totalScore, 91);
  assert.equal(result.deepBenchmarkPassed, false);
  assert.equal(result.schemaRetryCount, 1);
  assert.ok(calls.includes('atomic-evidence'));
  assert.ok(calls.includes('strategic-model'));
  assert.ok(calls.includes('quality-auditor'));
  assert.equal(contexts[0].pipelineStage, 'brand-dna.evidence-extraction');
  assert.equal(contexts[0].attemptNumber, 1);
  const repairIndex = calls.indexOf('structured-patch-repair');
  assert.ok(repairIndex > 0);
  assert.equal(contexts[repairIndex].pipelineStage, 'brand-dna.repair');
  assert.equal(contexts[repairIndex].attemptNumber, 2);
  assert.ok(contexts[repairIndex].parentCallId);
  assert.equal(result.metadata.reportSchemaVersion, 'brand-dna-report-v2');
  assert.match(result.reportMarkdown, /## 6\. 视觉创意系统/);
  assert.match(result.reportMarkdown, /已确认且必须保持的事实/);
  assert.match(result.reportMarkdown, /Logo 政策/);
  assert.match(result.reportMarkdown, /## E\. 协议、模型与运行元数据/);
  assert.doesNotThrow(() => validateBrandDnaReport(result.reportMarkdown, {
    imageSystem: result.intermediateObjects.imageSystem,
    imageTasks: result.intermediateObjects.imageTasks
  }));
  assert.ok(stages.includes('diagnosing-strategy'));
  assert.ok(stages.includes('planning-generation-tasks'));
});

test('visual stage normalizes scalar Creative Freedom and report compiler remains defensive', async () => {
  const { reasoner } = mockReasoner({ visualCreativeFreedomAsString: true });
  const stageProgress = [];
  const result = await runBrandDnaPipeline({
    corpus,
    projectNameHint: '临时项目',
    qualityTier: 'experimental',
    reasoner,
    onStageProgress: (event) => stageProgress.push(event)
  });
  assert.deepEqual(result.intermediateObjects.imageSystem.creativeFreedom, [
    '可在不新增业务事实的前提下设计概念静物场景'
  ]);
  assert.ok(result.warnings.some((warning) => (
    warning.includes('STRING_TO_SINGLE_ITEM_ARRAY')
      && warning.includes('imageSystem.creativeFreedom')
  )));
  assert.match(result.reportMarkdown, /可发挥空间[\s\S]*可在不新增业务事实的前提下设计概念静物场景/);
  const reportSystem = {
    ...result.intermediateObjects.imageSystem,
    creativeFreedom: '兼容旧检查点中的字符串值'
  };
  assert.doesNotThrow(() => compileBrandDnaReport(result.brandDna, {
    metadata: result.metadata,
    qualityAudit: result.qualityAudit,
    imageSystem: reportSystem,
    imageTasks: result.intermediateObjects.imageTasks
  }));
  assert.ok(stageProgress.some((event) => (
    event.stageId === 'report-compiler' && event.status === 'running'
  )));
  assert.ok(stageProgress.some((event) => (
    event.stageId === 'report-compiler' && event.status === 'completed'
  )));
});

test('visual stage normalizer wraps Qwen scalar string fields without changing their content', () => {
  const system = imageSystem();
  system.creativeFreedom = system.creativeFreedom[0];
  const normalized = normalizeStructuredStageOutput({
    stageId: 'visual-causal-translation',
    output: {
      visualTranslation: visualTranslation(),
      imageSystem: system
    }
  });
  assert.deepEqual(normalized.output.imageSystem.creativeFreedom, [
    '可在不新增业务事实的前提下设计概念静物场景'
  ]);
  assert.deepEqual(normalized.warnings, [{
    code: 'STRING_TO_SINGLE_ITEM_ARRAY',
    jsonPath: 'imageSystem.creativeFreedom',
    action: 'wrap-string-in-array',
    sourcePath: null
  }]);
});

test('strategic critic repairs every invalid evidenceIds field in one safe patch', async () => {
  const { reasoner, calls, prompts } = mockReasoner({ invalidFirstStage: 'strategic-critic' });
  const result = await runBrandDnaPipeline({
    corpus,
    projectNameHint: '临时项目',
    qualityTier: 'experimental',
    reasoner
  });
  assert.equal(result.success, true);
  assert.equal(result.schemaRetryCount, 1);
  assert.ok(calls.includes('structured-patch-repair'));
  const repairPrompt = prompts.find((prompt) => prompt.includes('PROTOCOL_STAGE=structured-patch-repair'));
  assert.match(repairPrompt, /"approvedReferenceContext":\{"approvedEvidence":\[\{"id":"evidence-0001"/);
  assert.match(repairPrompt, /"targetContainers":\{.*"id":"issue-1"/);
  assert.deepEqual(
    result.intermediateObjects.strategicIssues[0].evidenceIds,
    [evidenceId]
  );
  assert.deepEqual(
    result.intermediateObjects.strategicIssues[1].evidenceIds,
    [evidenceId]
  );
});

test('Brand DNA resumes from validated checkpoints after image task compilation fails', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-resume-'));
  const checkpointRoot = path.join(temporary, 'brand-dna');
  const checkpointOptions = {
    root: checkpointRoot,
    corpus,
    projectId: 'project-resume',
    provider: 'mock',
    modelId: 'text-model',
    apiProfileId: 'profile-1'
  };
  const first = mockReasoner({
    invalidFirstStage: 'gpt-image-task-compiler',
    patchFails: true
  });
  await assert.rejects(
    runBrandDnaPipeline({
      corpus,
      projectNameHint: '临时项目',
      qualityTier: 'experimental',
      reasoner: first.reasoner,
      checkpointStore: createBrandDnaCheckpointStore({
        ...checkpointOptions,
        analysisRunId: 'run-1'
      }),
      resumeMode: 'continue'
    }),
    (error) => error.code === 'FAILED_SCHEMA_AFTER_PATCH'
  );

  const second = mockReasoner();
  const stageProgress = [];
  const result = await runBrandDnaPipeline({
    corpus,
    projectNameHint: '临时项目',
    qualityTier: 'experimental',
    reasoner: second.reasoner,
    checkpointStore: createBrandDnaCheckpointStore({
      ...checkpointOptions,
      analysisRunId: 'run-2'
    }),
    resumeMode: 'continue',
    onStageProgress: (event) => stageProgress.push(event)
  });
  assert.equal(result.success, true);
  assert.equal(second.calls.includes('atomic-evidence'), false);
  assert.equal(second.calls.includes('strategic-model'), false);
  assert.equal(second.calls.includes('gpt-image-task-compiler'), true);
  assert.ok(stageProgress.some((event) => (
    event.stageId === 'visual-causal-translation' && event.status === 'reused'
  )));
  await fs.rm(temporary, { recursive: true, force: true });
});

test('legacy visual checkpoint normalization preserves downstream checkpoint reuse', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-legacy-visual-'));
  const checkpointRoot = path.join(temporary, 'brand-dna');
  const checkpointOptions = {
    root: checkpointRoot,
    corpus,
    projectId: 'project-legacy-visual',
    provider: 'mock',
    modelId: 'text-model',
    apiProfileId: 'profile-1'
  };
  const first = mockReasoner();
  await runBrandDnaPipeline({
    corpus,
    projectNameHint: '临时项目',
    qualityTier: 'experimental',
    reasoner: first.reasoner,
    checkpointStore: createBrandDnaCheckpointStore({
      ...checkpointOptions,
      analysisRunId: 'run-1'
    }),
    resumeMode: 'continue'
  });

  const stage7OutputPath = path.join(checkpointRoot, 'stage-outputs', '07-visual-causal-translation.json');
  const stage7CheckpointPath = path.join(checkpointRoot, 'checkpoints', '07-visual-causal-translation.checkpoint.json');
  const stage8OutputPath = path.join(checkpointRoot, 'stage-outputs', '08-gpt-image-task-compiler.json');
  const stage8CheckpointPath = path.join(checkpointRoot, 'checkpoints', '08-gpt-image-task-compiler.checkpoint.json');
  const stage9CheckpointPath = path.join(checkpointRoot, 'checkpoints', '09-quality-auditor.checkpoint.json');
  const stage7Output = JSON.parse(await fs.readFile(stage7OutputPath, 'utf8'));
  const stage7Checkpoint = JSON.parse(await fs.readFile(stage7CheckpointPath, 'utf8'));
  const stage8Output = JSON.parse(await fs.readFile(stage8OutputPath, 'utf8'));
  const stage8Checkpoint = JSON.parse(await fs.readFile(stage8CheckpointPath, 'utf8'));
  const stage9Checkpoint = JSON.parse(await fs.readFile(stage9CheckpointPath, 'utf8'));

  stage7Output.system.creativeFreedom = stage7Output.system.creativeFreedom[0];
  stage7Checkpoint.outputHash = stableJsonHash(stage7Output);
  const afterStage7 = stableJsonHash({
    upstreamOutputHash: stage7Checkpoint.upstreamOutputHash,
    stageId: 'visual-causal-translation',
    value: stage7Output
  });
  stage8Checkpoint.upstreamOutputHash = afterStage7;
  stage9Checkpoint.upstreamOutputHash = stableJsonHash({
    upstreamOutputHash: afterStage7,
    stageId: 'gpt-image-task-compiler',
    value: stage8Output
  });
  await fs.writeFile(stage7OutputPath, `${JSON.stringify(stage7Output, null, 2)}\n`);
  await fs.writeFile(stage7CheckpointPath, `${JSON.stringify(stage7Checkpoint, null, 2)}\n`);
  await fs.writeFile(stage8CheckpointPath, `${JSON.stringify(stage8Checkpoint, null, 2)}\n`);
  await fs.writeFile(stage9CheckpointPath, `${JSON.stringify(stage9Checkpoint, null, 2)}\n`);

  let modelCalls = 0;
  const stageProgress = [];
  const result = await runBrandDnaPipeline({
    corpus,
    projectNameHint: '临时项目',
    qualityTier: 'experimental',
    reasoner: async () => {
      modelCalls += 1;
      throw new Error('不应重新调用模型');
    },
    checkpointStore: createBrandDnaCheckpointStore({
      ...checkpointOptions,
      analysisRunId: 'run-2'
    }),
    resumeMode: 'continue',
    onStageProgress: (event) => stageProgress.push(event)
  });
  assert.equal(modelCalls, 0);
  assert.deepEqual(result.intermediateObjects.imageSystem.creativeFreedom, [
    '可在不新增业务事实的前提下设计概念静物场景'
  ]);
  assert.ok(stageProgress
    .filter((event) => event.status === 'reused')
    .some((event) => event.stageId === 'quality-auditor'));
  await fs.rm(temporary, { recursive: true, force: true });
});

test('quality gate performs one targeted repair and fails closed when the second audit still fails', async () => {
  const { reasoner, calls, prompts } = mockReasoner({ auditSequence: [false, false] });
  await assert.rejects(
    runBrandDnaPipeline({
      corpus,
      projectNameHint: '临时项目',
      qualityTier: 'qualified',
      reasoner
    }),
    (error) => {
      assert.equal(error.code, 'FAILED_QUALITY_GATE');
      return true;
    }
  );
  assert.equal(calls.filter((stage) => stage === 'targeted-repair').length, 1);
  assert.equal(calls.filter((stage) => stage === 'quality-auditor').length, 2);
  const repairPrompt = prompts.find((prompt) => prompt.includes('PROTOCOL_STAGE=targeted-repair'));
  assert.match(repairPrompt, /返回差异补丁/);
  assert.match(repairPrompt, /"stageId":"targeted-repair","operations"/);
});

test('targeted quality repair returns a compact patch and preserves the validated package', async () => {
  const { reasoner } = mockReasoner({ auditSequence: [false, true] });
  const result = await runBrandDnaPipeline({
    corpus,
    projectNameHint: '临时项目',
    qualityTier: 'qualified',
    reasoner
  });
  assert.equal(result.success, true);
  assert.equal(result.qualityRepairCount, 1);
  assert.match(
    result.intermediateObjects.imageTasks[1].finalPrompt,
    /subtle but distinct precision/
  );
});

test('unsupported model tier is rejected before any model request', async () => {
  let calls = 0;
  await assert.rejects(
    runBrandDnaPipeline({
      corpus,
      projectNameHint: '临时项目',
      qualityTier: 'unsupported',
      reasoner: async () => { calls += 1; }
    }),
    (error) => error.code === 'UNSUPPORTED_MODEL_TIER'
  );
  assert.equal(calls, 0);
});

test('pipeline time budget stops new requests with a distinct error code', async () => {
  let calls = 0;
  await assert.rejects(
    runBrandDnaPipeline({
      corpus,
      projectNameHint: '临时项目',
      qualityTier: 'experimental',
      pipelineBudgetMs: 0,
      reasoner: async () => { calls += 1; }
    }),
    (error) => error.code === 'PIPELINE_TIME_BUDGET_EXCEEDED'
  );
  assert.equal(calls, 0);
});

test('OpenAI-compatible text reasoner never sends image_url content', async () => {
  const requests = [];
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret-key',
    baseUrl: 'https://example.test/v1',
    model: 'text-only-model',
    provider: 'generic-provider',
    client: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'response-1',
          model: 'text-only-model',
          choices: [{ message: { content: '{"ok":true}' } }]
        })
      };
    }
  });
  const result = await reasoner([
    { role: 'system', content: 'system' },
    { role: 'user', content: 'document text' }
  ]);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(requests[0].url, 'https://example.test/v1/chat/completions');
  assert.ok(body.messages.every((message) => typeof message.content === 'string'));
  assert.doesNotMatch(requests[0].options.body, /image_url|data:image/);
  assert.equal(result.provider, 'generic-provider');
});

test('Qwen structured reasoner sends JSON mode, output limit, and explicit thinking setting', async () => {
  const requests = [];
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret-key',
    baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3-vl-plus',
    provider: 'qwen',
    jsonMode: true,
    client: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'response-json-mode',
          model: 'qwen3-vl-plus',
          choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }]
        })
      };
    }
  });
  await reasoner([
    { role: 'system', content: '只返回严格 JSON' },
    { role: 'user', content: '输出 JSON 对象' }
  ], {
    structuredOutputMode: 'json-object',
    maxOutputTokens: 10_000,
    thinkingEnabled: false
  });
  const body = JSON.parse(requests[0].options.body);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.max_tokens, 10_000);
  assert.equal('max_completion_tokens' in body, false);
  assert.equal(body.enable_thinking, false);
});

test('OpenAI-compatible reasoner prefers json_schema when the adapter declares reliable support', async () => {
  const requests = [];
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret-key',
    baseUrl: 'https://example.test/v1',
    model: 'schema-model',
    provider: 'schema-provider',
    jsonMode: true,
    jsonSchema: true,
    strictJsonSchema: true,
    client: async (_url, options) => {
      requests.push(options);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'schema-response',
          choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }]
        })
      };
    }
  });
  await reasoner([{ role: 'user', content: 'JSON' }], {
    structuredOutputMode: 'json-schema',
    jsonSchema: {
      name: 'test_schema',
      strict: true,
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false
      }
    },
    maxOutputTokens: 100
  });
  const body = JSON.parse(requests[0].body);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.max_tokens, 100);
});

test('OpenAI-compatible text reasoner rejects responses truncated by the provider', async () => {
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret-key',
    baseUrl: 'https://example.test/v1',
    model: 'text-model',
    client: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ finish_reason: 'length', message: { content: '{"partial":' } }]
      })
    })
  });
  await assert.rejects(
    reasoner([{ role: 'user', content: 'JSON' }]),
    (error) => error.code === 'OUTPUT_TRUNCATED' && /JSON 被截断/.test(error.message)
  );
});

test('OpenAI-compatible text reasoner distinguishes request timeout from user cancellation', async () => {
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret-key',
    baseUrl: 'https://example.test/v1',
    model: 'slow-model',
    client: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    })
  });
  await assert.rejects(
    reasoner([{ role: 'user', content: 'JSON' }], { requestTimeoutMs: 10 }),
    (error) => error.code === 'REQUEST_TIMEOUT'
      && error.details.abortReason === 'request-timeout'
  );
});
