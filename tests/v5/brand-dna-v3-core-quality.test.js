import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBrandCreativeDecision } from '../../src/v5/brand-dna/v3/decision/validate-decision.js';
import { runCoreQualityGate } from '../../src/v5/brand-dna/v3/quality/run-core-quality-gate.js';
import { compileV3CoreReport } from '../../src/v5/brand-dna/v3/report/compile-core-report.js';
import { buildV3CoreReportViewModel } from '../../src/v5/brand-dna/v3/report/build-core-report-view-model.js';
import { buildBrandCreativeDecisionPrompt } from '../../src/v5/brand-dna/v3/decision/brand-creative-decision-prompt.js';
import { applyRestrictedPatch, validateRestrictedPatch } from '../../src/v5/brand-dna/v3/repair/restricted-patch.js';

const evidenceMap = {
  evidence: [
    { evidenceId: 'evidence-0001', category: 'business-model', statement: '九州美学以合规供应链服务医美机构', quote: '合规供应链与透明履约', sourceId: 'doc-1', chunkId: 'chunk-1', sectionPath: ['品牌定位'], confidence: 'high' },
    { evidenceId: 'evidence-0002', category: 'capability', statement: '具备物流、资质和上下游资源协同能力', quote: 'GSP 物流、温层管理与上下游协同', sourceId: 'doc-1', chunkId: 'chunk-2', sectionPath: ['核心能力'], confidence: 'high' }
  ],
  conflicts: [],
  missingInformation: []
};

const prepared = {
  documentSetHash: 'hash-for-quality-regression',
  sourceDocuments: [{ sourceId: 'doc-1', originalFileName: '九州美学品牌定位提案-1.1.docx' }]
};

function item(status, statement, evidenceIds = ['evidence-0001']) { return { status, statement, evidenceIds }; }

function rawDecision() {
  const gene = (type, statement, evidenceIds = ['evidence-0001']) => ({ type, statement, evidenceIds, confidence: 'high', maturity: type === 'cultural' ? 'declared' : 'not-applicable', differentiationValue: 'high' });
  return {
    identity: { projectName: '九州美学品牌战略升级', brandName: '九州美学', analysisTaskName: null, industry: '医美产业链服务', businessRole: 'B2B 医美供应链与合规赋能平台', brandPositioning: '中国医美全链生态美学领航者', brandPositioningStatus: 'suggested', developmentStage: '独立品牌建立期', evidenceIds: ['evidence-0001'], confidence: 'medium' },
    audiences: [
      { name: '中游医美机构', priority: 'primary', needs: [item('confirmed', '获得稳定、合规、透明的供应与运营支持')], barriers: [item('confirmed', '采购和合规信息不透明')], useCases: [item('confirmed', '产品采购与机构运营')], evidenceIds: ['evidence-0001'] },
      { name: '上游产品与设备厂商', priority: 'secondary', needs: [item('reasonable-inference', '降低渠道触达与合规协作成本')], barriers: [], useCases: [item('reasonable-inference', '渠道协同与机构服务')], evidenceIds: ['evidence-0001'] },
      { name: '自有品牌终端消费者', priority: 'extension', needs: [item('missing', '确认终端消费者对安心医美体验的具体需求', [])], barriers: [], useCases: [], evidenceIds: [] }
    ],
    strategy: { mission: '让安全专业的医美服务稳定抵达', promise: '提供透明可追溯的合规履约', valuePropositions: ['降低机构采购与履约风险'], differentiators: ['医药级合规网络与生态协同'], relationshipRole: '长期可信赖的生态共建者', personality: ['严谨', '有温度'], toneOfVoice: ['清晰', '克制'], emotionalOutcomes: ['安心', '从容'], evidenceIds: ['evidence-0001'] },
    genes: [
      gene('functional', '让合作机构获得稳定、合规、透明的一站式供应与运营支持，降低采购、交付和合规风险'),
      gene('capability', '依托 GSP 物流网络、温层管理、经营资质、系统、上游资源与机构渠道协同交付', ['evidence-0002']),
      gene('relational', '成为产业伙伴长期可信赖的生态共建者'),
      gene('emotional', '让机构经营者在复杂决策中感到安心与从容'),
      gene('cultural', '以长期主义把合规责任转化为行业共生'),
      gene('behavioral', '以透明、克制和协同行动'),
      gene('aesthetic', '以可验证的秩序承载人文温度')
    ],
    oneSentenceDna: '以医药级合规供应链能力，为医美机构降低采购与履约不确定性，以生态共建关系交付安心从容，形成有温度的可信秩序。',
    diagnosis: { risks: [
      { status: 'conflicting', severity: 'major', topic: '集团背景口径', statement: '集团发展年限存在两种口径', evidenceIds: ['evidence-0001'], recommendedAction: '统一经审核的对外口径' },
      { status: 'confirmed', severity: 'major', topic: '渠道关系', statement: '一定导致 B2B 渠道利益冲突', evidenceIds: ['evidence-0001'], recommendedAction: '明确 B2B 与 B2C 边界' },
      { status: 'missing', severity: 'major', topic: '官方证明', statement: '缺少标准制定者的公开证明', evidenceIds: [], recommendedAction: null }
    ] },
    creativeThesis: { statement: '科学有度，美有温度：以可信供应链连接医美生态', rationale: '把合规交付能力转译为长期关系和安心体验', geneIds: ['G02', 'G03', 'G04', 'G05'], coverage: { capability: 4, relationship: 4, emotion: 4, culture: 3, differentiation: 4 }, evidenceIds: ['evidence-0001', 'evidence-0002'], isExistingSloganReuse: false, distinctiveMechanism: '让合规边界成为柔性连接被逐层验证的轨迹' },
    visualMechanisms: [{ name: '合规边界内的柔性连接', description: '双边界只在供应链节点完成验证后连接，并由理性秩序逐步转向人文温度', geneIds: ['G02', 'G03', 'G04'], evidenceIds: ['evidence-0001', 'evidence-0002'], genericRisk: 'low' }],
    pendingConfirmations: ['确认唯一视觉与色彩方向', '补充标准制定者官方证明']
  };
}

test('V3 normalizer separates task identity, calibrates confidence and softens unsupported absolute risk language', () => {
  const decision = validateBrandCreativeDecision(rawDecision(), evidenceMap);
  assert.equal(decision.identity.projectName, '九州美学');
  assert.equal(decision.identity.analysisTaskName, '品牌战略升级');
  assert.deepEqual(decision.genes.map((item) => item.geneId), ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07']);
  assert.equal(decision.genes.find((item) => item.type === 'cultural').maturity, 'declared');
  assert.equal(decision.genes.find((item) => item.type === 'cultural').confidence, 'medium');
  assert.equal(decision.genes.find((item) => item.type === 'aesthetic').confidence, 'medium');
  assert.ok(decision.genes.some((item) => item.confidence !== 'high'));
  assert.equal(decision.diagnosis.risks[1].status, 'reasonable-inference');
  assert.match(decision.diagnosis.risks[1].statement, /可能导致/);
  assert.ok(decision.normalization.deterministicFixes.some((item) => item.code === 'PROJECT_NAME_TASK_TERM_REMOVED'));
});

test('V3 quality gate enforces identity separation, customer-result needs and functional/capability semantics', () => {
  const decision = validateBrandCreativeDecision(rawDecision(), evidenceMap);
  const validGate = runCoreQualityGate(decision, evidenceMap);
  assert.equal(validGate.passed, true);
  const invalid = structuredClone(decision);
  invalid.identity.industry = '医美生态领航者';
  invalid.identity.businessRole = '可信伙伴';
  invalid.audiences[0].needs[0].statement = '打造生态平台';
  invalid.audiences[0].useCases[0].statement = '品牌海报设计';
  invalid.genes[0].statement = '依托全国仓储物流网络与经营资质';
  invalid.genes[1].statement = '让客户获得安心体验';
  const codes = runCoreQualityGate(invalid, evidenceMap).issues.map((item) => item.code);
  for (const code of ['IDENTITY_INDUSTRY_POSITIONING_MIXED', 'IDENTITY_BUSINESS_ROLE_MISSING', 'AUDIENCE_NEED_NOT_CUSTOMER_RESULT', 'AUDIENCE_USE_CASE_IS_DESIGN_APPLICATION', 'GENE_FUNCTIONAL_IS_CAPABILITY', 'GENE_CAPABILITY_FOUNDATION_MISSING']) assert.ok(codes.includes(code), code);
});

test('Core Report v3 compiles only from the validated view model and exposes required quality sections in Chinese', () => {
  const decision = validateBrandCreativeDecision(rawDecision(), evidenceMap);
  const qualityGate = runCoreQualityGate(decision, evidenceMap);
  const metrics = [{ kind: 'model', durationMs: 1200, usage: { inputTokens: 900, outputTokens: 500 }, modelId: 'mock-model' }, { kind: 'model', durationMs: 1800, usage: { inputTokens: 700, outputTokens: 600 }, modelId: 'mock-model' }];
  const input = { decision, evidenceMap, prepared, qualityGate, metrics };
  const view = buildV3CoreReportViewModel(input);
  const report = compileV3CoreReport(input);
  assert.equal(view.protocol.protocolVersion, 'brand-dna-v3-deep-compact');
  assert.equal(view.protocol.reportVersion, 'brand-dna-core-report-v3');
  assert.match(report, /^# 九州美学\n## 品牌 DNA 核心分析报告/m);
  assert.match(report, /> 分析任务：品牌战略升级/);
  assert.match(report, /## 0\. 执行摘要/);
  assert.match(report, /## 8\. 唯一创意命题/);
  assert.match(report, /## 9\. 品牌专属视觉机制候选/);
  assert.match(report, /## 附录 C：核心质量闸门/);
  assert.match(report, /\| G01 \| 功能结果/);
  assert.match(report, /状态：合理推断/);
  assert.match(report, /九州美学品牌定位提案-1\.1\.docx/);
  const mainReport = report.split('## 附录 A：')[0];
  assert.doesNotMatch(mainReport, /\bconfirmed\b|\breasonable-inference\b|\bconflicting\b|\bmissing\b|\bsuggested\b|\bhigh\b|\bmedium\b|\blow\b/);
  assert.doesNotMatch(report, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.equal(view.metadata.modelCallCount, 2);
  assert.deepEqual(view.metadata.usage, { inputTokens: 1600, outputTokens: 1100 });
});

test('V3 core decision prompt explicitly contains the repaired identity, gene, audience, risk and thesis rules', () => {
  const prompt = buildBrandCreativeDecisionPrompt({ prepared: { projectNameCandidates: [], sourceDocuments: [] }, evidenceMap, lockedFacts: [] })[0].content;
  for (const expected of ['PROMPT_VERSION=brand-creative-decision-prompt-v3.2', 'analysisTaskName', 'Functional Gene', 'Capability Gene', 'maturity=declared', 'primary、secondary、extension', '每条 Risk', 'Creative Thesis']) assert.match(prompt, new RegExp(expected));
});

test('V3 core repair remains restricted to the exact failing gene field', () => {
  const decision = validateBrandCreativeDecision(rawDecision(), evidenceMap);
  const invalid = structuredClone(decision);
  invalid.genes[0].statement = '依托全国仓储物流网络与经营资质';
  const gate = runCoreQualityGate(invalid, evidenceMap);
  const target = gate.issues.find((item) => item.code === 'GENE_FUNCTIONAL_IS_CAPABILITY');
  assert.equal(target.path, '/genes/0/statement');
  const patch = validateRestrictedPatch({ operations: [{ op: 'replace', path: target.path, value: '让合作机构获得稳定合规的供应支持，降低采购和履约风险' }] }, [target.path]);
  const repaired = validateBrandCreativeDecision(applyRestrictedPatch(invalid, patch), evidenceMap);
  assert.equal(runCoreQualityGate(repaired, evidenceMap).passed, true);
  assert.throws(() => validateRestrictedPatch({ operations: [{ op: 'replace', path: '/identity/projectName', value: '伪造项目' }] }, [target.path]), (error) => error.code === 'PATCH_PATH_NOT_ALLOWED');
});
