import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runVisualTranslationV1 } from '../../src/v5/visual-translation/v1/index.js';
import { validateVisualCreativeDirections } from '../../src/v5/visual-translation/v1/schemas/visual-creative-directions-v1.js';
import { parseStructuredResponse } from '../../src/v5/shared/analysis/response-parser.js';
import { createOpenAICompatibleTextReasoner } from '../../src/v5/adapters/openai-compatible-text-reasoner.js';

const text = '九州美学服务医美产业链伙伴，以合规供应链、透明履约和生态协同建立长期信任。品牌希望严谨而有温度，避免医疗蓝、装饰性科技流线和未经确认的认证符号。';
const corpus = {
  documents: [{
    id: 'doc-1', filename: '九州美学品牌定位提案.docx', title: '九州美学品牌定位提案', sourceType: 'docx',
    rawText: text, sections: [{ heading: '品牌定位', content: text }], characterCount: text.length
  }],
  sourceIndex: [], mergedText: text, warnings: []
};

function evidenceOutput(chunkId) {
  const items = [
    ['identity', '九州美学是当前品牌主体', '九州美学', '品牌名称影响所有视觉资产归属'],
    ['business-context', '品牌服务医美产业链伙伴', '服务医美产业链伙伴', '画面应表现产业协同而非单一消费产品'],
    ['capability', '合规供应链是稳定交付基础', '合规供应链', '画面需要可验证的节点与秩序'],
    ['relationship', '生态协同建立长期伙伴关系', '生态协同', '主体关系应互联而非中心压制'],
    ['emotion', '品牌希望传递长期信任', '长期信任', '节奏与光线需要稳定克制'],
    ['aesthetic-intent', '严谨与温度需要同时出现', '严谨而有温度', '需要理性结构与温和触感并置'],
    ['prohibited', '避免医疗蓝与装饰性科技流线', '避免医疗蓝、装饰性科技流线', '避免落入医美科技模板'],
    ['constraint', '不得使用未经确认的认证符号', '未经确认的认证符号', '画面不得出现伪造认证与批准标识']
  ];
  return {
    visualEvidenceMap: {
      identity: { projectName: '九州美学', brandName: '九州美学', status: 'confirmed', evidenceIds: ['VE001'] },
      evidence: items.map(([type, statement, shortestQuote, visualImpact], index) => ({ evidenceId: `VE${String(index + 1).padStart(3, '0')}`, sourceId: 'doc-1', chunkId, type, statement, status: 'confirmed', shortestQuote, visualImpact })),
      conflicts: [], missingInformation: [{ statement: '正式 Logo 与认证资产待确认', evidenceIds: [] }], lockedAssets: [], suggestedAssets: ['可验证的安心轨迹']
    }
  };
}

function signalOpportunityOutput() {
  return {
    visualStrategySignalMap: { signals: [
      { type: 'capability', statement: '以可验证的供应链节点表达稳定交付', evidenceIds: ['VE003'], importance: 'primary', visualPotential: 'high' },
      { type: 'capability', statement: '将透明履约转化为清晰状态变化', evidenceIds: ['VE003'], importance: 'secondary', visualPotential: 'high' },
      { type: 'relationship', statement: '生态伙伴以互相支撑的结构出现', evidenceIds: ['VE004'], importance: 'primary', visualPotential: 'high' },
      { type: 'emotion', statement: '从复杂链路中获得安心与从容', evidenceIds: ['VE005'], importance: 'primary', visualPotential: 'high' },
      { type: 'culture', statement: '长期主义表现为克制、稳定和责任感', evidenceIds: ['VE005'], importance: 'secondary', visualPotential: 'medium' },
      { type: 'aesthetic-tension', statement: '严谨秩序与人文温度并置', evidenceIds: ['VE006'], importance: 'primary', visualPotential: 'high' },
      { type: 'aesthetic-tension', statement: '产业基础设施与轻盈品牌感并置', evidenceIds: ['VE002', 'VE006'], importance: 'secondary', visualPotential: 'high' }
    ] },
    visualOpportunityMap: {
      visualizableFacts: [{ statement: '供应链节点逐层验证后才连接', rationale: '合规能力可通过状态变化被看见', evidenceIds: ['VE003'], brandability: 'high' }],
      metaphors: [{ statement: '安心轨迹', rationale: '把履约节点转译为持续抵达的关系轨迹', evidenceIds: ['VE003', 'VE005'], brandability: 'high' }],
      aestheticTensions: [{ statement: '精密网格与柔性半透明层共存', rationale: '对应严谨与温度的双重要求', evidenceIds: ['VE006'], brandability: 'high' }],
      categoryCliches: [
        { pattern: '医疗蓝渐变', risk: '容易与行业模板混同', allowedWhen: '只作为有证据的功能状态辅助色', prohibitedWhen: '用作无差别全局科技背景' },
        { pattern: '装饰性科技流线', risk: '缺乏品牌因果逻辑', allowedWhen: '流线明确表示已验证的履约关系', prohibitedWhen: '仅用于制造速度感' }
      ]
    }
  };
}

function directionsOutput() {
  return { visualCreativeDirections: { directions: [
    {
      name: '安心轨迹', oneSentenceConcept: '被验证的节点形成有温度的连续抵达', strategicSignals: ['VS01', 'VS03', 'VS04'], evidenceIds: ['VE003', 'VE004', 'VE005'], coreMetaphor: '逐层被验证的安心轨迹', distinctiveMechanism: '节点确认后才由离散变为连续', graphicLanguage: ['离散节点', '连续轨迹', '确认标记'], colorLogic: '深石墨底色配克制暖金确认色', materialLanguage: ['哑光基底', '半透明验证层'], lightingLanguage: '柔和定向光只照亮已验证节点', compositionLanguage: '从左下离散到右上稳定连接', subjectPolicy: { people: '只呈现协作动作与局部手势', products: '产品作为关系节点而非英雄主体', environment: '可信的供应链与服务触点' }, suitableApplications: ['品牌海报', '服务流程', '空间导视'], brandFit: 94, inspirationValue: 92, distinctiveness: 93, categoryClicheRisk: 'low', risks: ['轨迹必须避免退化为普通科技流线']
    },
    {
      name: '共生容器', oneSentenceConcept: '多方资源在柔性边界中形成共生支持', strategicSignals: ['VS03', 'VS05', 'VS06'], evidenceIds: ['VE004', 'VE005', 'VE006'], coreMetaphor: '能够呼吸的共生容器', distinctiveMechanism: '不同主体保持边界又共享一个柔性空间', graphicLanguage: ['嵌套轮廓', '柔性边界', '负形连接'], colorLogic: '温润米白与低饱和植物灰绿', materialLanguage: ['自然纤维', '磨砂陶瓷'], lightingLanguage: '大面积漫射自然光', compositionLanguage: '中心留白与环抱式层次', subjectPolicy: { people: '呈现平等交流的真实人物', products: '产品融入日常服务关系', environment: '安静、有呼吸感的当代空间' }, suitableApplications: ['关系海报', '会员沟通', '包装概念'], brandFit: 88, inspirationValue: 90, distinctiveness: 87, categoryClicheRisk: 'medium', risks: ['自然语言可能弱化专业能力']
    },
    {
      name: '责任刻度', oneSentenceConcept: '每一次专业承诺都留下可审视的责任刻度', strategicSignals: ['VS01', 'VS02', 'VS05'], evidenceIds: ['VE003', 'VE006', 'VE008'], coreMetaphor: '被时间校准的责任刻度', distinctiveMechanism: '信息、材质与空间以可审计刻度逐层对齐', graphicLanguage: ['精密刻度', '硬边框架', '留白标签'], colorLogic: '冷灰白、炭黑与单点朱砂红', materialLanguage: ['蚀刻金属', '高密度纸张'], lightingLanguage: '高角度硬光形成清晰边缘', compositionLanguage: '严格轴线、模块分栏与大比例留白', subjectPolicy: { people: '不出现完整人物，仅保留专业操作痕迹', products: '以细节与批次关系呈现', environment: '档案室、实验台式抽象空间' }, suitableApplications: ['专业报告封面', '资质展示', 'B2B 物料'], brandFit: 90, inspirationValue: 85, distinctiveness: 91, categoryClicheRisk: 'low', risks: ['刻度语言可能显得过冷']
    }
  ] } };
}

function mockReasoner() {
  const calls = [];
  return {
    calls,
    reasoner: async (messages) => {
      const stage = messages[0].content.match(/PROTOCOL_STAGE=([^\n]+)/)?.[1];
      calls.push(stage);
      const chunkId = messages[0].content.match(/"chunkId":"([^"]+)"/)?.[1];
      const output = stage === '01-visual-evidence' ? evidenceOutput(chunkId) : stage === '02-visual-signal-opportunity' ? signalOpportunityOutput() : directionsOutput();
      return { provider: 'mock', model: 'mock-visual-model', text: JSON.stringify(output), finishReason: 'stop', usage: { inputTokens: 120, outputTokens: 80 } };
    }
  };
}

test('Sprint 1 runs three model stages, compiles a visual-first directions report and saves checkpoints', async () => {
  const mock = mockReasoner(); const checkpoints = {};
  const result = await runVisualTranslationV1({ projectId: 'project-1', corpus, reasoner: mock.reasoner, provider: 'mock', modelId: 'mock-visual-model', onCheckpoint(stage, value) { checkpoints[stage] = structuredClone(value); } });
  assert.equal(result.modelCallCount, 3);
  assert.deepEqual(mock.calls, ['01-visual-evidence', '02-visual-signal-opportunity', '04-three-creative-directions']);
  assert.equal(result.directions.directions.length, 3);
  assert.equal(result.recommendation.humanSelectionRequired, true);
  assert.equal(result.status, 'completed-directions');
  assert.ok(result.composition.visualRatio >= 0.65);
  assert.match(result.reportMarkdown, /五类视觉策略信号/);
  assert.match(result.reportMarkdown, /三个视觉方向/);
  assert.doesNotMatch(result.reportMarkdown, /七类 Brand DNA/);
  assert.ok(checkpoints['10-local-report-compiler'].checkpoint.outputHash);
  if (process.env.UPDATE_VISUAL_TRANSLATION_FIXTURE === '1') {
    const output = path.resolve('tests/fixtures/visual-translation/jiuzhou-meixue/expected');
    await fs.mkdir(output, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(output, 'visual-directions-report-v1.md'), result.reportMarkdown, 'utf8'),
      fs.writeFile(path.join(output, 'visual-evidence-map-v1.json'), `${JSON.stringify(result.evidenceMap, null, 2)}\n`, 'utf8'),
      fs.writeFile(path.join(output, 'visual-strategy-signal-map-v1.json'), `${JSON.stringify(result.signalMap, null, 2)}\n`, 'utf8'),
      fs.writeFile(path.join(output, 'visual-opportunity-map-v1.json'), `${JSON.stringify(result.opportunityMap, null, 2)}\n`, 'utf8'),
      fs.writeFile(path.join(output, 'visual-creative-directions-v1.json'), `${JSON.stringify(result.directions, null, 2)}\n`, 'utf8'),
      fs.writeFile(path.join(output, 'direction-recommendation-v1.json'), `${JSON.stringify(result.recommendation, null, 2)}\n`, 'utf8'),
      fs.writeFile(path.join(output, 'visual-translation-run-report-v1.json'), `${JSON.stringify({ protocolVersion: 'visual-translation-v1', status: result.status, modelCallCount: result.modelCallCount, metrics: result.metrics, composition: result.composition, note: 'Offline mock regression; real Provider Token and latency were not measured.' }, null, 2)}\n`, 'utf8')
    ]);
  }
});

test('valid Sprint 1 checkpoints resume without another model call', async () => {
  const first = mockReasoner(); const checkpoints = {};
  await runVisualTranslationV1({ projectId: 'project-1', corpus, reasoner: first.reasoner, provider: 'mock', modelId: 'mock-visual-model', onCheckpoint(stage, value) { checkpoints[stage] = structuredClone(value); } });
  let calls = 0;
  const result = await runVisualTranslationV1({ projectId: 'project-1', corpus, checkpoints, reasoner: async () => { calls += 1; throw new Error('should not run'); }, provider: 'mock', modelId: 'mock-visual-model' });
  assert.equal(calls, 0);
  assert.equal(result.modelCallCount, 0);
  assert.ok(result.metrics.some((item) => item.stageId === '04-three-creative-directions' && item.resumed));
});

test('direction validator rejects three cosmetic variants', () => {
  const evidenceMap = { evidence: Array.from({ length: 8 }, (_, index) => ({ evidenceId: `VE00${index + 1}` })) };
  const signalMap = { signals: Array.from({ length: 7 }, (_, index) => ({ signalId: `VS0${index + 1}` })) };
  const output = directionsOutput();
  for (const key of ['coreMetaphor', 'graphicLanguage', 'colorLogic', 'materialLanguage', 'lightingLanguage', 'compositionLanguage', 'subjectPolicy']) output.visualCreativeDirections.directions[1][key] = structuredClone(output.visualCreativeDirections.directions[0][key]);
  assert.throws(() => validateVisualCreativeDirections(output, { evidenceMap, signalMap }), (error) => error.code === 'DIRECTIONS_NOT_DISTINCT');
});

test('structured response parser accepts fenced JSON with a trailing comma', () => {
  assert.deepEqual(parseStructuredResponse('```json\n{"ok":true,}\n```'), { ok: true });
});

test('text reasoner sends text-only messages and applies stage thinking controls', async () => {
  const requests = [];
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret-key', model: 'qwen-test', provider: 'qwen',
    baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    client: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'r1', model: 'qwen-test', choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
    }
  });
  const result = await reasoner([{ role: 'user', content: 'document text' }], { enableThinking: true, thinkingBudget: 2048, maxOutputTokens: 6000 });
  assert.equal(requests[0].enable_thinking, true);
  assert.equal(requests[0].thinking_budget, 2048);
  assert.equal(requests[0].max_tokens, 6000);
  assert.ok(requests[0].messages.every((message) => typeof message.content === 'string'));
  assert.equal(result.usage.inputTokens, 10);
});

test('text reasoner exposes truncated output before structured parsing', async () => {
  const reasoner = createOpenAICompatibleTextReasoner({
    apiKey: 'secret-key', model: 'limited', baseUrl: 'https://example.test/v1',
    client: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{"broken":' } }] }) })
  });
  await assert.rejects(reasoner([{ role: 'user', content: 'test' }]), (error) => error.code === 'OUTPUT_TRUNCATED');
});
