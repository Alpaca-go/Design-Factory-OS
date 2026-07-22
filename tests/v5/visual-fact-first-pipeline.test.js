import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileBenchmarkQueryPlan } from '../../src/v5/visual-translation/v2/visual-fact-first/benchmark-query-compiler.js';
import { retrieveBenchmarkCases } from '../../src/v5/visual-translation/v2/visual-fact-first/benchmark-retrieval.js';
import { evaluateVisualFactFirstAB } from '../../src/v5/visual-translation/v2/visual-fact-first/ab-evaluator.js';
import { buildVisualFactsPrompt } from '../../src/v5/visual-translation/v2/visual-fact-first/prompts.js';
import { runVisualFactFirstUpstream } from '../../src/v5/visual-translation/v2/visual-fact-first/run-upstream.js';
import { prepareDocumentSet } from '../../src/v5/shared/analysis/document-preparation.js';
import { runVisualTranslationV2 } from '../../src/v5/visual-translation/v2/runtime/run-visual-translation-v2.js';
import { DEFAULT_ANALYSIS_PIPELINE_MODE, normalizeAnalysisPipelineMode } from '../../src/v5/visual-translation/v2/config/analysis-pipeline-mode.js';

const sourceText = '九州美学是医美产业服务品牌，定位为B2B2C医美全链生态平台，服务上游品牌与医美机构，最终受益者为消费者。核心能力包括物流、仓储、GSP、温控与上下游协同。目标气质是专业、稳定、安全、可信、有温度。';
const prepared = {
  documentSetHash: 'doc-hash', sourceDocuments: [{ sourceId: 'doc1', originalFileName: '策略.md', characterCount: sourceText.length }],
  chunks: [{ sourceId: 'doc1', chunkId: 'chunk1', text: sourceText }]
};
const ref = { evidence_id: 'VF001', source_file: 'doc1', source_location: 'chunk1', excerpt: sourceText, confidence: 0.95 };
const facts = {
  schema_version: 'visual-facts-v1',
  project_identity: { brand_name: '九州美学', brand_name_evidence: [ref], industry: '医美产业服务', business_type: 'b2b2c_ecosystem', brand_role: '医美全链生态平台', business_model: '连接上游品牌、医美机构与消费者', geographic_scope: 'unknown' },
  offer_structure: { primary_products_or_services: ['供应链与平台服务'], service_delivery_model: 'B2B2C协同', price_tier: 'professional_procurement', decision_cost: 'very_high', purchase_context: '机构专业采购' },
  audience_structure: { primary_customer: ['上游品牌', '医美机构'], secondary_customer: [], final_user_or_beneficiary: ['消费者'], decision_maker: ['机构采购决策者'], user_relationship: '平台连接上下游并服务消费者结果' },
  brand_positioning: { core_value: ['可信交付'], differentiation: ['全链协同'], desired_perception: ['专业', '可信'], personality_traits: ['稳定'], emotional_tone: ['有温度'] },
  visual_direction_signals: { desired_style: ['专业'], desired_materiality: [], desired_image_behavior: ['真实业务对象'], desired_information_density: 'medium', premium_level: 'mid_premium', professional_level: 'high' },
  business_objects: { real_products: [], real_services: ['供应链服务'], real_processes: ['温控交付'], real_scenes: ['仓储'], real_documents_or_interfaces: ['验收界面'] },
  locked_assets: { brand_name_locked: true, logo_locked: true, industry_locked: true, business_role_locked: true, packaging_structure_locked: false, other_locked_assets: [] },
  editable_assets: { color_system_editable: true, typography_editable: true, graphic_system_editable: true, photography_editable: true, layout_editable: true, visual_anchor_editable: true },
  prohibited_misinterpretations: ['不得表现为护肤品品牌', '不得表现为实验室研发品牌'],
  evidence_constraints: { must_use_source_evidence: ['业务能力'], cannot_fabricate: ['资质编号'], data_placeholder_allowed: ['温控字段'] },
  search_tags: { industry_tags: ['medical aesthetics services'], business_model_tags: ['B2B2C platform'], audience_tags: ['institutional buyer'], tone_tags: ['professional trusted'], touchpoint_tags: ['poster', 'digital hero'], exclusion_tags: ['skincare', 'laboratory brand', 'real estate exhibition'] },
  confidence: { overall: 0.9, unresolved_fields: ['集团VI使用权'], conflicting_evidence: [] }, evidence_registry: [ref],
  fact_evidence: Object.fromEntries(['brand_name', 'industry', 'business_type', 'brand_role', 'business_model', 'primary_offer', 'primary_customer', 'locked_assets'].map((key) => [key, ['VF001']]))
};
const assets = { logo: [], color: [], typography: [], graphic_assets: [], photography: [], layout: [], packaging_structure: [], reusable_assets: [], weak_assets: [], replaceable_assets: [], unresolved: ['未提供关键视觉图片'] };
const synthesis = {
  category_conventions: { commonly_used_visual_language: ['蓝色科技节点'], useful_industry_codes: ['真实流程界面'], overused_templates: ['实验室微观粒子'] },
  brand_existing_position: { strengths_to_keep: ['平台角色'], weaknesses_to_fix: ['视觉资产不足'], underused_assets: ['温控交付流程'] },
  differentiation_opportunities: ['验证交付', '平台品质选择', '生态价值回流'].map((title, index) => ({ opportunity_id: `VO0${index + 1}`, title, visual_problem: '通用模板不能表达平台价值', brand_evidence: ['VF001'], benchmark_evidence: [], opportunity_statement: `${title}形成可复用视觉机制`, reusable_asset_potential: ['信息模块'], suitable_touchpoints: ['poster'], risks: ['不得虚构数据'], confidence: 0.8 })),
  prohibited_shortcuts: ['实验室模板'], direction_generation_constraints: ['三个方向使用不同构图机制'], recommended_direction_families: [{ family: 'A', opportunity_id: 'VO01', reason: '可信交付' }]
};

test('Visual Facts prompt rejects broad business analysis and requires grounded evidence', () => {
  const text = buildVisualFactsPrompt(prepared)[0].content;
  assert.match(text, /不是品牌策划分析器/u);
  assert.match(text, /不要总结市场规模/u);
  assert.match(text, /excerpt 必须是对应 Chunk 的逐字子串/u);
});

test('the core keeps Legacy compatibility while Desktop can explicitly select Visual Fact First', () => {
  assert.equal(DEFAULT_ANALYSIS_PIPELINE_MODE, 'legacy_deep_analysis');
  assert.equal(normalizeAnalysisPipelineMode(), 'legacy_deep_analysis');
  assert.equal(normalizeAnalysisPipelineMode('visual_fact_first'), 'visual_fact_first');
  assert.equal(normalizeAnalysisPipelineMode('legacy_deep_analysis'), 'legacy_deep_analysis');
});

test('query compiler creates five query families and propagates exclusions', () => {
  const plan = compileBenchmarkQueryPlan(facts);
  for (const key of ['direct_industry_queries', 'business_model_queries', 'tone_price_queries', 'touchpoint_queries', 'anti_template_queries']) assert.equal(plan[key].length, 1);
  assert.ok(plan.business_model_queries[0].query.includes('b2b2c_ecosystem'));
  assert.ok(plan.direct_industry_queries[0].exclusion_terms.includes('skincare'));
});

test('benchmark retrieval deduplicates canonical URLs and ranks relevant cases', async () => {
  const plan = compileBenchmarkQueryPlan(facts);
  const base = { case_name: 'Case A', case_type: 'business_model', industry: 'healthcare', business_model: 'platform', relevant_touchpoints: ['digital'], useful_visual_mechanisms: ['verification window'], visual_strengths: ['clear hierarchy'], template_risks: [], relevance_score: 0.9, evidence_images: [] };
  const result = await retrieveBenchmarkCases({ queryPlan: plan, seedCases: [{ ...base, source_url: 'https://example.com/case?utm_source=x' }, { ...base, source_url: 'https://example.com/case' }] });
  assert.equal(result.query_count, 5);
  assert.equal(result.cases.length, 1);
  assert.equal(result.relevant_count, 1);
});

test('Visual Fact First upstream produces six review/program artifacts and Step 4 context', async () => {
  const saved = [];
  const fixtures = { '01-visual-relevant-facts': facts, '02-visual-asset-evidence': assets, '03c-visual-opportunity-synthesis': synthesis };
  const result = await runVisualFactFirstUpstream({
    input: { provider: 'fixture', modelId: 'fixture', lockedFacts: [], lockedAssets: [], benchmarkCases: [] }, prepared,
    model: async (stage, _messages, validator) => validator(fixtures[stage]),
    local: async (_stage, action) => action(),
    save: async (stage, output, metadata) => { saved.push({ stage, output, metadata }); return output; },
    resume: () => null, selectedTouchpoints: ['poster', 'digital_hero']
  });
  assert.equal(result.visualFacts.project_identity.brand_name, '九州美学');
  assert.equal(result.step4Context.brand_identity.business_type, 'b2b2c_ecosystem');
  assert.equal(result.step4Context.visual_opportunities.differentiation_opportunities.length, 3);
  assert.deepEqual(saved.filter((item) => /\.md$/u.test(item.metadata.outputFile)).map((item) => item.metadata.outputFile), ['01-Visual-Relevant-Brand-Facts.md', '02-Visual-Asset-Evidence.md', '03-Visual-Opportunity-Synthesis.md']);
  assert.equal(saved.find((item) => item.stage === '03b-benchmark-retrieval').output.retrieval_status, 'not_configured');
});

test('A/B evaluator permits replacement only when every documented threshold passes', () => {
  const run = (visual) => ({ document_analysis_ms: visual ? 600 : 1000, upstream_input_tokens: visual ? 600 : 1000, brand_role_accuracy: 1, locked_asset_protection: 1, gate_false_positives: visual ? 0 : 1, direction_mechanism_difference: visual ? 0.9 : 0.7, template_risk: visual ? 0.1 : 0.3, e02_lab_drift: visual ? 0 : 1, anchor_usability: visual ? 0.9 : 0.6, permanent_running: 0 });
  const projects = ['九州美学', '名济堂', '万科苏皖'].map((project) => ({ project, legacy: [run(false), run(false), run(false)], visual_fact_first: [run(true), run(true), run(true)] }));
  const result = evaluateVisualFactFirstAB(projects);
  assert.equal(result.replacement_allowed, true);
  assert.equal(result.summary.anchor_wins, 3);
});

test('V2 runner switches to Visual Fact First while preserving Step 4 and Gate', async () => {
  const corpus = { documents: [{ id: 'doc1', filename: '策略.md', sourceType: 'markdown', rawText: sourceText, characterCount: sourceText.length, sections: [{ heading: '品牌', content: sourceText }] }] };
  const runtimePrepared = prepareDocumentSet({ projectId: 'visual-fact-first-e2e', corpus });
  const runtimeFacts = structuredClone(facts);
  runtimeFacts.project_identity.brand_name_evidence[0].source_location = runtimePrepared.chunks[0].chunkId;
  runtimeFacts.evidence_registry[0].source_location = runtimePrepared.chunks[0].chunkId;
  const directions = JSON.parse(readFileSync('tests/fixtures/visual-direction-v2/jiuzhou-meixue/v2-directions.json', 'utf8')).map((direction) => {
    const copy = structuredClone(direction);
    delete copy.evidence_ids;
    delete copy.asset_references;
    return copy;
  });
  const stages = [];
  const checkpoints = [];
  const result = await runVisualTranslationV2({
    projectId: 'visual-fact-first-e2e', analysisRunId: 'run-vff-01', corpus,
    provider: 'fixture', modelId: 'fixture-model', analysisPipelineMode: 'visual_fact_first',
    reasoner: async (messages) => {
      const protocol = messages[0].content.match(/PROTOCOL_STAGE=([^\n]+)/u)?.[1];
      stages.push(protocol);
      const payload = protocol === '01-visual-relevant-facts' ? { visualRelevantBrandFacts: runtimeFacts }
        : protocol === '02-visual-asset-evidence' ? { visualAssetEvidence: assets }
          : protocol === '03-visual-opportunity-synthesis' ? { visualOpportunitySynthesis: synthesis }
            : { visualDirectionV2Set: { directions } };
      return { text: JSON.stringify(payload), finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 200 }, provider: 'fixture', model: 'fixture-model' };
    },
    onCheckpoint: async (stage, payload) => checkpoints.push({ stage, outputFile: payload.checkpoint.outputFile }),
    onProgress: () => {}, onModelResponse: () => {}
  });
  assert.deepEqual(stages, ['01-visual-relevant-facts', '03-visual-opportunity-synthesis', '04-execution-oriented-directions-v2']);
  assert.equal(result.analysisPipelineMode, 'visual_fact_first');
  assert.equal(result.pipelineObservability.pipeline_mode, 'visual_fact_first');
  assert.equal(result.modelCallCount, 3);
  assert.match(result.reportMarkdown, /上游分析管线：visual_fact_first/u);
  assert.ok(checkpoints.some((item) => item.outputFile === '03-Visual-Opportunity-Synthesis.md'));
  assert.equal(result.status, 'completed-directions');
});
