import test from 'node:test';
import assert from 'node:assert/strict';
import { runVisualTranslationV1 } from '../../src/v5/visual-translation/v1/index.js';
import { prepareDocumentSet } from '../../src/v5/shared/analysis/document-preparation.js';
import { validateVisualEvidenceMap } from '../../src/v5/visual-translation/v1/schemas/visual-evidence-map-v1.js';
import { validateVisualCreativeDirections } from '../../src/v5/visual-translation/v1/schemas/visual-creative-directions-v1.js';
import { buildDirectionScoreCard } from '../../src/v5/visual-translation/v1/schemas/direction-recommendation-v1.js';
import { buildDirectionRiskBreakdown } from '../../src/v5/visual-translation/v1/schemas/direction-risk-v1.js';
import { createFixtureDifferenceEvaluator } from '../../src/v5/visual-translation/v1/schemas/direction-difference-matrix-v1.js';
import { validateEvidenceConfidence } from '../../src/v5/visual-translation/v1/schemas/evidence-confidence-v1.js';
import { createShadowModeValidator } from '../../validators/index.js';
import { audienceBoundary, directionsOutput, evidenceOutput, semanticDifferenceMatrix, signalOpportunityOutput } from './helpers/visual-translation-phase35-fixtures.js';

const zhSource = '九州美学是服务制造商与合作机构的产业平台。终端消费者仅是辅助受益者。平台以透明履约建立长期信任。行业协作需要精确而克制。禁止使用未经确认的认证标识。';
const zhCorpus = {
  documents: [{ id: 'doc-zh', filename: '九州品牌.md', title: '九州品牌', sourceType: 'markdown', rawText: zhSource, sections: [{ heading: '品牌定位', content: zhSource }], characterCount: zhSource.length }],
  sourceIndex: [], mergedText: zhSource, warnings: []
};

const zhBoundary = {
  businessModel: 'b2b', businessModelEvidenceIds: ['VE002'],
  primaryAudience: [{ label: '制造商', evidenceIds: ['VE003'] }, { label: '合作机构', evidenceIds: ['VE003'] }],
  excludedAudience: [{ label: '作为核心受众的终端消费者', reason: '终端消费者仅是辅助受益者', evidenceIds: ['VE004'] }],
  consumerVisualPolicy: 'auxiliary_only', consumerVisualPolicyEvidenceIds: ['VE004']
};

function chineseEvidence(chunkId) {
  const output = evidenceOutput(chunkId);
  const root = output.visualEvidenceMap;
  root.identity = { projectName: '九州美学', brandName: '九州美学', status: 'confirmed', evidenceIds: ['VE001'] };
  root.audienceBoundary = structuredClone(zhBoundary);
  const values = [
    ['九州美学是当前品牌', '九州美学', '确认品牌资产归属'],
    ['业务是产业平台', '产业平台', '主视觉保持产业端视角'],
    ['主要受众是制造商与合作机构', '制造商与合作机构', '使用产业合作角色与触点'],
    ['终端消费者只能作为辅助链路', '终端消费者仅是辅助受益者', '消费者不能成为核心主体'],
    ['透明履约是核心能力', '透明履约', '表现可追溯的系统行为'],
    ['长期信任定义合作关系', '长期信任', '形成耐久的伙伴结构'],
    ['行业协作需要精确克制', '精确而克制', '避免消费护理意象'],
    ['未经确认的认证标识被禁止', '禁止使用未经确认的认证标识', '不得生成官方认证图形']
  ];
  root.evidence.forEach((item, index) => { item.sourceId = 'doc-zh'; [item.statement, item.shortestQuote, item.visualImpact] = values[index]; });
  root.missingInformation = [{ statement: '品牌未提供标志组合规范', evidenceIds: [] }];
  root.suggestedAssets[0].name = '透明履约关系图'; root.suggestedAssets[0].reason = '由已确认的运营能力推导';
  root.suggestedAssets[1].name = '可扫描合规二维码'; root.suggestedAssets[1].reason = '合规事实不等于授权生成二维码资产';
  return output;
}

function chineseSignals() {
  const output = signalOpportunityOutput();
  output.visualStrategySignalMap.audienceBoundary = structuredClone(zhBoundary);
  const signalText = ['可追溯节点表现透明履约', '已验证的状态转换表达可靠交付', '伙伴结构表达长期信任', '克制信心取代消费护理情绪', '长期责任保持克制', '系统精度与协作关系形成张力', '制造商与机构保持核心地位，消费者仅作辅助'];
  output.visualStrategySignalMap.signals.forEach((item, index) => { item.statement = signalText[index]; });
  const map = output.visualOpportunityMap;
  map.audienceBoundary = structuredClone(zhBoundary);
  map.visualizableFacts[0].statement = '业务伙伴之间经过验证的履约交接'; map.visualizableFacts[0].rationale = '将透明履约转化为可见的系统行为';
  map.metaphors[0].statement = '可问责的交接链'; map.metaphors[0].rationale = '连接履约能力与长期信任';
  map.aestheticTensions[0].statement = '精确结构与开放协作'; map.aestheticTensions[0].rationale = '平衡平台严谨性与伙伴关系';
  map.categoryCliches = [
    { pattern: '通用科技蓝', risk: '容易成为可替换的行业模板', allowedWhen: '已确认界面状态需要使用', prohibitedWhen: '仅作为行业暗示' },
    { pattern: '医疗认证徽章', risk: '可能虚构或夸大权威', allowedWhen: '存在已提供且授权的资产', prohibitedWhen: '仅存在合规事实' }
  ];
  return output;
}

function chineseDirections() {
  const output = directionsOutput();
  const root = output.visualCreativeDirections;
  root.audienceBoundary = structuredClone(zhBoundary);
  const names = ['可信交接', '伙伴共域', '审计节律'];
  root.directions.forEach((item, index) => {
    item.name = names[index]; item.internalCodeName = ['Verified Handoffs', 'Partner Field', 'Audit Rhythm'][index];
    item.oneSentenceConcept = '将产业平台能力转化为可辨识、可延展的视觉运行原则';
    item.coreMetaphor = ['可问责的交接链', '边界清晰的伙伴共域', '责任证据形成的审计节律'][index];
    item.distinctiveMechanism = ['状态只在交接验证后闭合', '独立伙伴区域在保持边界时形成协作', '证据密度形成可复核的节奏'][index];
    item.mechanismAssessment.brandSpecificReason = '机制来自透明履约与长期伙伴信任的品牌证据';
    item.mechanismAssessment.replacementMechanism = '使用证据关联的状态关系，替代通用发光节点';
    item.graphicLanguage = [['状态模块', '验证连接'], ['边界区域', '互惠留白'], ['审计刻度', '责任间隔']][index];
    item.colorLogic = '以炭黑为基础，仅使用克制的暖色确认点';
    item.materialLanguage = [['哑光系统层', '半透明验证层'], ['编织纤维', '柔和陶面'], ['致密纸张', '蚀刻金属']][index];
    item.lightingLanguage = '使用均匀而克制的结构明暗'; item.compositionLanguage = ['沿责任节点顺序推进', '以分布式区域形成平衡', '以非对称栏列形成垂直节律'][index];
    item.emotionalRole = ['验证带来的信心', '互惠带来的安心', '纪律带来的可靠'][index]; item.spatialBehavior = ['线性累积', '径向协作', '垂直节律'][index];
    item.subjectPolicy.people = ['行业专家仅作为辅助操作角色', '合作伙伴团队仅作为协作证据', '生态参与者仅作为辅助关系角色'][index];
    item.subjectPolicy.peopleRole = ['industry_expert', 'partner_team', 'ecosystem_participant'][index];
    item.subjectPolicy.products = '产品只作为产业系统证据'; item.subjectPolicy.environment = '伙伴运营与平台协作环境';
    item.suitableApplications = [{ name: '伙伴提案系统', audience: 'b2b', role: 'core' }, { name: '产业运营看板', audience: 'internal', role: 'core' }];
    item.risks = ['不得将品牌机制简化为通用网络图'];
  });
  root.directions[2].reason_basis = 'inference'; root.directions[2].evidence_confidence = 0.65;
  root.differenceMatrix = semanticDifferenceMatrix();
  root.differenceMatrix.pairs.forEach((pair) => {
    pair.shared_visual_traits = pair.direction_pair === 'D01/D03' ? ['网格化结构', '工程材质家族', '浅层三维叠层'] : ['克制的信息密度'];
    pair.dimensions.forEach((dimension) => { dimension.reason = `${pair.direction_pair} 在${dimension.name}上具有可说明的语义差异`; });
  });
  return output;
}

function chineseReasoner() {
  return async (messages) => {
    const content = messages.map((message) => message.content).join('\n');
    const stage = content.match(/PROTOCOL_STAGE=([^\n]+)/)?.[1];
    const chunkId = content.match(/"chunkId":"([^"]+)"/)?.[1];
    const output = stage === '01-visual-evidence' ? chineseEvidence(chunkId) : stage === '02-visual-signal-opportunity' ? chineseSignals() : chineseDirections();
    return { provider: 'mock', model: 'fixture', text: JSON.stringify(output), usage: { inputTokens: 1, outputTokens: 1 } };
  };
}

test('Chinese project produces Chinese formal direction names and at least 90% primary-language prose', async () => {
  const result = await runVisualTranslationV1({ projectId: 'phase351-zh', corpus: zhCorpus, reasoner: chineseReasoner(), provider: 'mock', modelId: 'fixture' });
  assert.equal(result.evidenceMap.reportLanguage, 'zh-CN');
  assert.ok(result.directions.directions.every((direction) => /\p{Script=Han}/u.test(direction.name)));
  assert.ok(result.languageMetadata.primary_language_ratio >= 0.9);
  assert.equal(result.languageMetadata.language_status, 'pass');
  const d03 = result.directions.directions[2];
  assert.equal(d03.reason_basis, 'inference'); assert.equal(d03.evidence_confidence, 0.65); assert.equal(d03.risk_breakdown.evidence_risk_penalty, 5);
});

test('Chinese evidence rejects English narrative fields before they reach the report', () => {
  const prepared = prepareDocumentSet({ projectId: 'phase351-language-gate', corpus: zhCorpus });
  const output = chineseEvidence(prepared.chunks[0].chunkId);
  output.visualEvidenceMap.evidence[0].statement = 'The brand name is Jiuzhou Aesthetics';
  assert.throws(
    () => validateVisualEvidenceMap(output, prepared),
    (error) => error.code === 'REPORT_LANGUAGE_POLLUTION' && error.path === 'visualEvidenceMap.evidence[0].statement'
  );
});

test('evidence basis fixes confidence at 1, 0.85 or 0.65', () => {
  assert.deepEqual(validateEvidenceConfidence({ reason_basis: 'direct_evidence', evidence_confidence: 1 }, 'item'), { reason_basis: 'direct_evidence', evidence_confidence: 1 });
  assert.throws(() => validateEvidenceConfidence({ reason_basis: 'inference', evidence_confidence: 0.9 }, 'item'), /must be 0.65/);
});

test('confidence participates in scoring before risk penalty', () => {
  const direction = { brandFit: 90, inspirationValue: 90, distinctiveness: 90, scalability: 90, evidence_confidence: 0.65, categoryClicheRisk: 'low', risk_breakdown: { template_risk_penalty: 0, audience_risk_penalty: 0, evidence_risk_penalty: 5, asset_risk_penalty: 0, anti_pattern_penalty: 0, risk_penalty_total: 5, penalty_reasons: ['evidence_basis:inference'] } };
  const score = buildDirectionScoreCard(direction);
  assert.equal(score.base_score, 90); assert.equal(score.confidence_adjusted_score, 58.5); assert.equal(score.final_score, 53.5);
});

test('medium and high template risks always receive a non-zero risk penalty', () => {
  const medium = buildDirectionRiskBreakdown({ categoryClicheRisk: 'medium', reason_basis: 'direct_evidence', mechanismAssessment: { industryTemplateRisk: 'low' } });
  const high = buildDirectionRiskBreakdown({ categoryClicheRisk: 'high', reason_basis: 'direct_evidence', mechanismAssessment: { industryTemplateRisk: 'low' } });
  assert.equal(medium.template_risk_penalty, 4); assert.equal(high.template_risk_penalty, 9);
  assert.throws(() => buildDirectionRiskBreakdown({ categoryClicheRisk: 'critical', reason_basis: 'direct_evidence', mechanismAssessment: { industryTemplateRisk: 'low' } }), (error) => error.code === 'INDUSTRY_TEMPLATE_RISK');
});

test('semantic evaluator can reject differently worded but semantically close directions', () => {
  const evidenceMap = { audienceBoundary, reportLanguage: 'en-US', evidence: Array.from({ length: 8 }, (_, index) => ({ evidenceId: `VE${String(index + 1).padStart(3, '0')}` })), executableSuggestedAssets: [{ assetId: 'SA001' }] };
  const signalMap = { signals: Array.from({ length: 7 }, (_, index) => ({ signalId: `VS${String(index + 1).padStart(2, '0')}` })) };
  const low = semanticDifferenceMatrix();
  low.pairs[0].dimensions.forEach((dimension, index) => { dimension.score = index < 3 ? 0 : 1; dimension.reason = 'The concepts use different words but preserve the same semantic behavior'; });
  low.pairs[0].total_score = 3; low.pairs[0].status = 'needs_rewrite';
  const evaluator = createFixtureDifferenceEvaluator(low);
  assert.throws(() => validateVisualCreativeDirections(directionsOutput(), { evidenceMap, signalMap, differenceEvaluator: evaluator }), (error) => error.code === 'DIRECTIONS_NOT_DISTINCT' && error.repairDirectionIds.includes('D02'));
});

test('valid Phase 3.5.1 report metadata does not trigger language pollution', async () => {
  const result = await createShadowModeValidator().validate({ module: 'report', output: { report_language_metadata: { report_language: 'zh-CN', primary_language_ratio: 0.96 }, direction_names: ['可信交接', '伙伴共域', '审计节律'] } });
  const finding = result.anti_patterns.find((item) => item.anti_pattern_id === 'AP-REP-004');
  assert.equal(finding.detected, false); assert.equal(finding.evaluated, true);
});
