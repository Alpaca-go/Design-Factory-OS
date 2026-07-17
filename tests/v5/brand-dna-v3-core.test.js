import test from 'node:test';
import assert from 'node:assert/strict';
import { runBrandDnaV3Core } from '../../src/v5/brand-dna/v3/protocol/run-brand-dna-v3.js';
import { runV3VisualExtension } from '../../src/v5/brand-dna/v3/protocol/run-visual-extension.js';
import { applyRestrictedPatch, validateRestrictedPatch } from '../../src/v5/brand-dna/v3/repair/restricted-patch.js';

const corpus = {
  documents: [{
    id: 'doc-1', filename: '九州美学品牌定位提案.docx', title: '九州美学品牌定位提案', sourceType: 'docx',
    rawText: '九州美学服务医美产业链伙伴，以合规供应链、透明履约和生态协同建立长期信任。',
    sections: [{ heading: '品牌定位', content: '九州美学服务医美产业链伙伴，以合规供应链、透明履约和生态协同建立长期信任。' }],
    characterCount: 42
  }], sourceIndex: [], mergedText: '', warnings: []
};

function decision() {
  const gene = (type, statement, maturity = null) => ({ geneId: `local-${type}`, type, statement, evidenceIds: ['evidence-0001'], confidence: 'high', culturalMaturity: maturity, differentiationValue: 'high' });
  return {
    identity: { projectName: '九州美学品牌 DNA 合成', brandName: '九州美学', industry: '医美供应链服务', businessRole: '全链路资源整合与机构赋能平台', brandPositioning: '以合规和透明履约建立长期信任的生态伙伴', developmentStage: '独立品牌建立期', evidenceIds: ['evidence-0001'], confidence: 'high' },
    audiences: [{ audienceId: 'a', name: '医美机构经营者', priority: 'primary', needs: ['降低合规采购与稳定履约的不确定性'], barriers: ['信息和渠道不透明'], useCases: ['产品采购与机构运营'], evidenceIds: ['evidence-0001'], inferenceLevel: 'confirmed' }],
    strategy: { mission: '让安全专业的医美服务稳定抵达', promise: '提供透明可追溯的合规履约', valuePropositions: ['降低机构采购与履约风险'], differentiators: ['医药级合规网络与生态协同'], relationshipRole: '长期可信赖的生态共建者', personality: ['严谨', '有温度'], toneOfVoice: ['清晰', '克制'], emotionalOutcomes: ['安心', '从容'], evidenceIds: ['evidence-0001'] },
    genes: [gene('functional', '让机构获得更确定的合规采购与履约结果'), gene('capability', '以医药级供应链和透明追溯稳定交付'), gene('relational', '成为产业伙伴的长期生态共建者'), gene('emotional', '让经营决策更安心从容'), gene('cultural', '把合规责任内化为长期主义', 'declared'), gene('behavioral', '以透明、克制和协同行动'), gene('aesthetic', '以可验证的秩序承载人文温度')],
    oneSentenceDna: '以医药级合规供应链能力，为医美机构降低采购与履约不确定性，以生态共建关系交付安心从容，形成有温度的可信秩序。',
    diagnosis: { conflicts: [], missingInformation: ['消费者端品牌认知数据'], risks: [{ statement: '美学表达可能被供应链能力遮蔽', status: 'reasonable-inference', evidenceIds: ['evidence-0001'] }] },
    creativeThesis: { statement: '让每一次抵达，都成为安心之美的证据', rationale: '把透明履约能力转化为可感知的关系与情绪价值', coverage: { capability: 4, relationship: 4, emotion: 4, culture: 3, differentiation: 4 }, evidenceIds: ['evidence-0001'], isExistingSloganReuse: false, distinctiveMechanism: '将全链路节点转译为逐层被验证的安心轨迹' },
    visualMechanisms: [{ mechanismId: 'm', name: '安心轨迹', description: '节点只有在被验证后才形成连续且有温度的秩序轨迹', geneIds: ['gene-capability', 'gene-relational', 'gene-emotional'], evidenceIds: ['evidence-0001'], genericRisk: 'low' }],
    pendingConfirmations: ['正式 Logo 与认证资产']
  };
}

function visualPlan() {
  const direction = { decision: '让被验证的节点形成有呼吸的秩序', rationale: '对应能力、关系与情绪基因', actions: ['限制节点数量并明确验证前后状态'] };
  const task = (sequence, role, responsibility) => ({ taskId: `local-${sequence}`, sequence, role, titleZh: responsibility, responsibility, viewerTakeaway: '九州美学把复杂链路转化为可感知的安心', geneIds: ['gene-capability', 'gene-relational'], requiredElements: ['被验证的安心轨迹'], prohibitedElements: ['伪造 Logo', '认证标识'], consistencyWithGlobalSystem: ['沿用安心轨迹和克制秩序'], consistencyWithPreviousTasks: sequence === 1 ? [] : ['延续首图的安心轨迹'], differenceFromOtherTasks: [`只负责${responsibility}`], aspectRatio: sequence === 1 ? '3:2' : '4:5' });
  return { visualPersonality: ['严谨', '温和'], visualKeywords: ['验证', '抵达', '安心轨迹'], distinctiveAssets: [{ assetId: 'a', name: '安心轨迹', mechanism: '节点经验证后才连接成连续秩序', geneIds: ['gene-capability', 'gene-relational'] }], directions: { color: direction, typography: direction, graphic: direction, composition: direction, photography: direction, illustration: direction, material: direction, lighting: direction, motion: direction }, imageSystem: { systemId: 'brand-image-system-v3', anchorVisual: '被逐层验证的节点形成从理性到温度的连续安心轨迹', compositionSystem: '由离散节点向稳定关系递进', colorSystem: ['理性底色与温度确认色'], materialSystem: ['哑光基底', '半透明验证层'], lightingSystem: '柔和定向光标记已验证节点', imageLanguage: '真实触点与抽象轨迹并置', consistencyRules: ['所有图沿用同一安心轨迹', '确认色只用于已验证节点'], textPolicy: '不生成未提供的品牌文字', logoPolicy: '未提供 Logo 时只预留位置，不得设计或仿造' }, generationBoundary: { lockedFacts: ['品牌服务医美产业链伙伴'], lockedAssets: [], verifiedRequiredElements: ['安心轨迹'], suggestedElements: ['可验证节点'], creativeFreedom: ['可设计不代表真实业务设施的抽象关系场景'], prohibitedElements: ['虚构 Logo', '认证标识'], prohibitedClaims: ['行业第一'], pendingConfirmations: ['正式 Logo'] }, taskPlan: [task(1, 'anchor-image', '建立全局视觉锚点'), task(2, 'service-scene', '验证服务关系'), task(3, 'detail-craft', '验证细节质感'), task(4, 'poster', '形成传播记忆')] };
}

function mockReasoner() {
  const calls = [];
  const contexts = [];
  const reasoner = async (messages, context) => {
    const stage = messages[0].content.match(/PROTOCOL_STAGE=([^\n]+)/)?.[1];
    calls.push(stage); contexts.push(context);
    const chunkId = messages[0].content.match(/"chunkId":"([^"]+)"/)?.[1];
    const output = stage === '01-evidence-map'
      ? { evidenceMap: { evidence: [{ evidenceId: 'local', category: 'positioning', statement: '九州美学以合规供应链和透明履约服务医美产业链伙伴', quote: '以合规供应链、透明履约和生态协同建立长期信任', sourceId: 'doc-1', chunkId, sectionPath: ['品牌定位'], confidence: 'high' }], conflicts: [], missingInformation: [{ missingId: 'm', topic: '消费者认知', whyNeeded: '判断 C 端延伸基础' }] } }
      : stage === '05-visual-system-task-plan'
        ? { visualSystemTaskPlan: visualPlan() }
        : { brandCreativeDecision: decision() };
    return { runId: `run-${calls.length}`, provider: 'mock', model: 'mock-model', text: JSON.stringify(output), finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 50 } };
  };
  return { reasoner, calls, contexts };
}

test('v3 core uses Evidence Once + Decision Once and includes the unique creative thesis', async () => {
  const mock = mockReasoner();
  const saved = {};
  const result = await runBrandDnaV3Core({ projectId: 'project-1', corpus, reasoner: mock.reasoner, provider: 'mock', modelId: 'mock-model', lockedFacts: [], enableModelPatch: false, onCheckpoint(stage, value) { saved[stage] = value; } });
  assert.equal(result.modelCallCount, 2);
  assert.deepEqual(mock.calls, ['01-evidence-map', '02-brand-creative-decision']);
  assert.equal(mock.contexts[0].enableThinking, false);
  assert.equal(mock.contexts[1].enableThinking, true);
  assert.equal(result.decision.identity.projectName, '九州美学');
  assert.match(result.reportMarkdown, /唯一创意命题/);
  assert.match(result.reportMarkdown, /让每一次抵达，都成为安心之美的证据/);
  assert.match(result.reportMarkdown, /九州美学品牌定位提案\.docx/);
  assert.ok(saved['04-core-report'].checkpoint.outputHash);
});

test('v3 resumes evidence and decision checkpoints without another model call', async () => {
  const first = mockReasoner();
  const saved = {};
  await runBrandDnaV3Core({ projectId: 'project-1', corpus, reasoner: first.reasoner, provider: 'mock', modelId: 'mock-model', enableModelPatch: false, onCheckpoint(stage, value) { saved[stage] = value; } });
  let calls = 0;
  const resumed = await runBrandDnaV3Core({ projectId: 'project-1', corpus, checkpoints: saved, reasoner: async () => { calls += 1; }, provider: 'mock', modelId: 'mock-model', enableModelPatch: false });
  assert.equal(calls, 0);
  assert.ok(resumed.metrics.some((item) => item.stageId === '02-brand-creative-decision' && item.resumed));
});

test('restricted patch rejects paths outside validator whitelist', () => {
  assert.throws(() => validateRestrictedPatch({ operations: [{ op: 'replace', path: '/genes/0/statement', value: '伪造事实' }] }, ['/identity/industry']), (error) => error.code === 'PATCH_PATH_NOT_ALLOWED');
  const patch = validateRestrictedPatch({ operations: [{ op: 'replace', path: '/identity/industry', value: '医美供应链服务' }] }, ['/identity/industry']);
  assert.equal(applyRestrictedPatch({ identity: { industry: '错误定位' } }, patch).identity.industry, '医美供应链服务');
});

test('Sprint 2 produces one compact visual-system task plan without long prompts', async () => {
  const mock = mockReasoner();
  const core = await runBrandDnaV3Core({ projectId: 'project-1', corpus, reasoner: mock.reasoner, provider: 'mock', modelId: 'mock-model', enableModelPatch: false });
  const extended = await runV3VisualExtension({ projectId: 'project-1', reasoner: mock.reasoner, provider: 'mock', modelId: 'mock-model', lockedAssets: [] }, core);
  assert.equal(mock.calls.length, 3);
  assert.equal(extended.visualSystemTaskPlan.taskPlan.length, 4);
  assert.deepEqual(extended.visualSystemTaskPlan.taskPlan[0].consistencyWithPreviousTasks, []);
  assert.ok(extended.visualSystemTaskPlan.distinctiveAssets.some((item) => /安心轨迹/.test(item.name)));
  assert.equal('finalPrompt' in extended.visualSystemTaskPlan.taskPlan[0], false);
});
