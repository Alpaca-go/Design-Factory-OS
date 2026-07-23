import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileBenchmarkQueryPlan } from '../../src/v5/visual-translation/v2/visual-fact-first/benchmark-query-compiler.js';
import { retrieveBenchmarkCases } from '../../src/v5/visual-translation/v2/visual-fact-first/benchmark-retrieval.js';
import { evaluateVisualFactFirstAB } from '../../src/v5/visual-translation/v2/visual-fact-first/ab-evaluator.js';
import { buildVisualFactsPrompt } from '../../src/v5/visual-translation/v2/visual-fact-first/prompts.js';
import { runVisualFactFirstUpstream } from '../../src/v5/visual-translation/v2/visual-fact-first/run-upstream.js';
import { buildEvidenceBoundValueRegistry } from '../../src/v5/visual-translation/v2/visual-fact-first/evidence-bound-values.js';
import { adaptVisualFactFirstToStep4 } from '../../src/v5/visual-translation/v2/visual-fact-first/step4-input-adapter.js';
import { prepareDocumentSet } from '../../src/v5/shared/analysis/document-preparation.js';
import { runVisualTranslationV2 } from '../../src/v5/visual-translation/v2/runtime/run-visual-translation-v2.js';
import { DEFAULT_ANALYSIS_PIPELINE_MODE, normalizeAnalysisPipelineMode } from '../../src/v5/visual-translation/v2/config/analysis-pipeline-mode.js';
import { evaluateModelCriticAdvisory, validateLightweightDirections } from '../../src/v5/visual-translation/v2/runtime/lightweight-validator.js';
import { detectUnexpectedBrandNames } from '../../src/v5/visual-translation/v2/runtime/brand-identity-preservation-evaluator.js';
import { detectUnsupportedSpecificData } from '../../src/v5/visual-translation/v2/runtime/specific-data-evidence-evaluator.js';
import { evaluateGroupVisualAuthorization } from '../../src/v5/visual-translation/v2/runtime/group-visual-authorization-evaluator.js';
import { buildVisualAssetPipelineStatus } from '../../src/v5/visual-translation/v2/visual-fact-first/visual-asset-pipeline-status.js';
import { compileVisualDirectionsReportViewModel } from '../../src/v5/visual-translation/v2/report/visual-directions-report-compiler.js';

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

test('Retrieval First is the formal default while Legacy modes remain explicit', () => {
  assert.equal(DEFAULT_ANALYSIS_PIPELINE_MODE, 'retrieval_first');
  assert.equal(normalizeAnalysisPipelineMode(), 'retrieval_first');
  assert.equal(normalizeAnalysisPipelineMode('retrieval_first'), 'retrieval_first');
  assert.equal(normalizeAnalysisPipelineMode('visual_fact_first'), 'visual_fact_first');
  assert.equal(normalizeAnalysisPipelineMode('legacy_deep_analysis'), 'legacy_deep_analysis');
});

test('query compiler creates five query families and propagates exclusions', () => {
  const plan = compileBenchmarkQueryPlan(facts);
  for (const key of ['industry_queries', 'business_model_queries', 'tone_queries', 'touchpoint_queries', 'anti_template_queries']) assert.equal(plan[key].length, 1);
  assert.ok(plan.business_model_queries[0].query.includes('b2b2c_ecosystem'));
  assert.ok(plan.industry_queries[0].exclusion_terms.includes('skincare'));
});

test('benchmark retrieval deduplicates canonical URLs and ranks relevant cases', async () => {
  const plan = compileBenchmarkQueryPlan(facts);
  const base = { case_name: 'Case A', case_type: 'business_model', industry: 'healthcare', business_model: 'platform', relevant_touchpoints: ['digital'], useful_visual_mechanisms: ['verification window'], visual_strengths: ['clear hierarchy'], template_risks: [], relevance_score: 0.9, evidence_images: [] };
  const result = await retrieveBenchmarkCases({ queryPlan: plan, seedCases: [{ ...base, source_url: 'https://example.com/case?utm_source=x' }, { ...base, source_url: 'https://example.com/case' }] });
  assert.equal(result.query_count, 5);
  assert.equal(result.cases.length, 1);
  assert.equal(result.relevant_count, 1);
});

test('zero-result benchmark retrieval records diagnostics and executes fallback queries', async () => {
  const calls = [];
  const result = await retrieveBenchmarkCases({
    queryPlan: compileBenchmarkQueryPlan(facts),
    retriever: async (query) => { calls.push(query); return []; }
  });
  assert.equal(result.retrieval_status, 'failed');
  assert.equal(result.failure_reason, 'empty_response');
  assert.equal(result.fallback_query_count, 4);
  assert.equal(result.fallback_round_count, 4);
  assert.equal(calls.length, 9);
  assert.ok(result.query_diagnostics.every((item) => item.failure_reason === 'empty_response'));
  assert.ok(result.query_diagnostics.every((item) =>
    item.query_id && item.request_started_at && item.request_completed_at
    && item.request_status === 'success'
    && item.raw_result_count === 0 && item.usable_result_count === 0
  ));
  assert.equal(result.failure_stage, 'provider_response');
});

test('EvidenceBoundValue registry only authorizes values linked to confirmed evidence', () => {
  const registry = buildEvidenceBoundValueRegistry({
    fact_records: {
      specific_business_data: { status: 'confirmed', evidence_ids: ['VF-DATA'] },
      qualifications_and_coverage: { status: 'requires_confirmation', evidence_ids: ['VF-LOW'] }
    },
    evidence_registry: [
      { evidence_id: 'VF-DATA', excerpt: '服务覆盖200公里，拥有141座物流中心，温层10–25℃。', confidence: 0.95 },
      { evidence_id: 'VF-LOW', excerpt: '区域覆盖率96%。', confidence: 0.6 }
    ]
  });
  assert.equal(registry.find((item) => item.raw_value === '200公里').allowed_in_visual_direction, true);
  assert.equal(registry.find((item) => item.raw_value === '141座物流中心').status, 'confirmed');
  assert.equal(registry.find((item) => item.raw_value === '10–25℃').allowed_in_visual_direction, true);
  assert.equal(registry.find((item) => item.raw_value === '96%').allowed_in_visual_direction, false);
});

test('Step 4 removes raw unconfirmed business values and keeps only structure placeholders', () => {
  const visualFacts = structuredClone(facts);
  visualFacts.fact_records = {
    brand_name: { field: 'brand_name', status: 'confirmed', evidence_ids: ['VF001'] },
    qualifications_and_coverage: {
      field: 'qualifications_and_coverage', status: 'requires_confirmation',
      evidence_ids: ['VF-LOW'], value: '覆盖22省、141中心，覆盖率96%，温层10–25℃'
    }
  };
  visualFacts.evidence_registry.push({
    evidence_id: 'VF-LOW', source_file: 'doc1', source_location: 'chunk1',
    excerpt: '覆盖22省、141中心，覆盖率96%，温层10–25℃', confidence: 0.5
  });
  const context = adaptVisualFactFirstToStep4({
    visualFacts, visualAssetEvidence: assets,
    benchmarkRetrieval: { retrieval_status: 'failed', cases: [] },
    visualOpportunitySynthesis: synthesis
  });
  const serialized = JSON.stringify({
    rejected: context.rejected_evidence_bound_values,
    unconfirmed: context.fact_status_groups.requires_confirmation,
    brandFacts: context.brandFacts
  });
  for (const raw of ['22省', '141中心', '96%', '10–25℃']) assert.equal(serialized.includes(raw), false);
  assert.match(serialized, /structure_only/u);
  assert.match(serialized, /占位/u);
});

test('negative constraint phrases do not create unexpected-brand warnings', () => {
  for (const phrase of ['不得使用非授权集团VI', '禁止使用集团', '不可替换为集团', '未授权集团不得出现', '严禁使用某某集团']) {
    const result = detectUnexpectedBrandNames({ expectedBrandName: '九州美学', sourceText: phrase });
    assert.equal(result.hasUnexpected, false, phrase);
  }
});

test('numeric context exempts visual ratios but blocks business metrics and temperature commitments', () => {
  const detections = detectUnsupportedSpecificData({
    direction_id: 'E01',
    execution_examples: [{
      information_zone: { width_or_height: '信息区宽度 60%' },
      visual_structure: '摄影 40% / 图形 35% / 信息 25%',
      graphic_overlay: '透明度 15%'
    }],
    brand_evidence: '96% 区域覆盖',
    industry_recognition_layer: { industry_data_objects: ['10–25℃ 温控范围'] }
  });
  assert.deepEqual(detections.map((item) => item.detected_text).sort(), ['10–25℃', '96%']);
  assert.deepEqual(detections.map((item) => item.numeric_context).sort(), ['business_metric', 'temperature_value']);
});

test('project Logo is allowed while unconfirmed group Logo is a local rewrite', () => {
  const relationship = {
    relationship: 'group_backing', related_brand_name: '示例母集团',
    visual_authorization: 'not_confirmed'
  };
  const project = evaluateGroupVisualAuthorization([
    { direction_id: 'E01', brand_evidence: '项目品牌使用标准 Logo 与品牌 Logo' }
  ], relationship, '项目品牌');
  assert.equal(project.rewrite_required, false);
  assert.equal(project.issues.length, 0);

  const group = evaluateGroupVisualAuthorization([
    { direction_id: 'E01', brand_evidence: '沿用示例母集团 Logo 与集团 VI' }
  ], relationship, '项目品牌');
  assert.equal(group.rewrite_required, true);
  assert.equal(group.issues[0].asset_owner, 'parent_group');

  const unknown = evaluateGroupVisualAuthorization([
    { direction_id: 'E01', strategic_idea: '沿用 Logo 形成稳定识别' }
  ], relationship, '项目品牌');
  assert.equal(unknown.rewrite_required, false);
  assert.equal(unknown.warning, true);
  assert.equal(unknown.issues[0].severity, 'warning');
});

test('visual asset pipeline distinguishes provided, analyzed and direction usage states', () => {
  const evidence = {
    logo: [{ evidence_id: 'VA-01', authorization: 'locked' }],
    color: [], unresolved: []
  };
  const unused = buildVisualAssetPipelineStatus({ visualAssetEvidence: evidence, inputProvided: true, directions: [] });
  assert.deepEqual([unused.input_status, unused.analysis_status, unused.usage_status], ['provided', 'complete', 'not_referenced']);
  const used = buildVisualAssetPipelineStatus({
    visualAssetEvidence: evidence, inputProvided: true,
    directions: [{ direction: { asset_references: ['VA-01'] } }]
  });
  assert.equal(used.usage_status, 'referenced');
  assert.deepEqual(used.referenced_asset_ids, ['VA-01']);
});

test('Retrieval First upstream persists the formal artifact chain and exposes Partial when retrieval is absent', async () => {
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
  assert.equal(result.visualBrief.schema_version, 'visual-brief-v1');
  assert.equal(result.visualBrief.identity.brand_name.status, 'confirmed');
  assert.ok(sourceText.includes(result.visualBrief.identity.brand_name.evidence[0].excerpt));
  assert.deepEqual(saved.filter((item) => /\.md$/u.test(item.metadata.outputFile)).map((item) => item.metadata.outputFile), ['01-Visual-Brief.md', '02-Visual-Asset-Evidence.md', '04-Visual-Opportunity-Synthesis.md']);
  assert.deepEqual(saved.filter((item) => /Benchmark|Step4/u.test(item.metadata.outputFile)).map((item) => item.metadata.outputFile), [
    '03-Benchmark-Query-Plan.json', '03-Benchmark-Cases.json', '05-Step4-Input-Context.json'
  ]);
  assert.equal(saved.find((item) => item.stage === '03b-benchmark-retrieval').output.retrieval_status, 'not_configured');
  assert.equal(result.pipelineCompleteness, 'partial');
  assert.ok(result.step4Context.fact_status_groups.confirmed.some((item) => item.field === 'brand_name'));
  assert.equal(result.step4Context.brand_relationship.visual_authorization, 'not_confirmed');
  assert.deepEqual(result.step4Context.audience_structure.final_user_or_beneficiary, [], 'unconfirmed final-consumer facts must not enter Step 4');
  assert.ok(result.step4Context.fact_status_groups.unknown.some((item) => item.field === 'final_consumer'));
});

test('Lightweight Validator owns runtime status while Model Critic remains advisory', () => {
  const compiled = {
    directions: [{ content_readiness_score: 75 }, { content_readiness_score: 75 }, { content_readiness_score: 75 }],
    gates: {
      brand_identity_preservation: { brand_name_preserved: true },
      asset_authorization: { forgery_detected: false },
      direction_family_difference: { rewrite_required: true, difference_score: 0.5 },
      execution_example_completeness: {}, execution_example_specificity: {}
    }
  };
  const validation = validateLightweightDirections({ compiled, pipelineCompleteness: 'complete', benchmarkRetrieval: { retrieval_status: 'completed' } });
  const critic = evaluateModelCriticAdvisory(compiled);
  assert.equal(validation.status, 'rewrite_required');
  assert.deepEqual(validation.hard_blocks, []);
  assert.equal(critic.runtime_effect, 'none');
  assert.ok(['Recommended', 'Promising With Revision', 'Weak'].includes(critic.recommendation));
  assert.equal(critic.structural_readiness_excluded, true);
  assert.equal(Object.keys(critic.per_direction[0].dimensions).length, 7);
});

test('Design Critic excludes structural readiness and caps failed-retrieval scores at 69', () => {
  const direction = {
    direction: {
      direction_id: 'E01', brand_evidence: '项目品牌事实', asset_references: ['VA-01'],
      selection_mechanism: { visual_mapping_rule: '验证窗口映射规则', platform_signature: '平台标签' },
      graphic_system: { how_graphics_form: '轨迹切片形成规则', brand_fact_mapping: '品牌事实映射' },
      core_reusable_assets: [{}, {}, {}], template_risks: ['通用节点'],
      anti_concept_art_constraints: [{}],
      industry_recognition_layer: {},
      execution_examples: [
        { touchpoint: 'poster', hero_subject: '交付节点', communication_goal: '建立可信', industry_content: '真实流程', responsive_adaptation: '自适应' },
        { touchpoint: 'digital_hero', hero_subject: '验证窗口', communication_goal: '解释能力' }
      ]
    },
    structural_completeness_score: 10,
    content_readiness_score: 10
  };
  const compiled = { directions: [direction], gates: { brand_identity_preservation: { brand_name_preserved: true }, direction_family_difference: { difference_score: 0.9 } } };
  const first = evaluateModelCriticAdvisory(compiled, { benchmarkRetrieval: { retrieval_status: 'failed' } });
  direction.structural_completeness_score = 100;
  direction.content_readiness_score = 100;
  const second = evaluateModelCriticAdvisory(compiled, { benchmarkRetrieval: { retrieval_status: 'failed' } });
  assert.equal(first.score, second.score);
  assert.ok(first.score <= 69);
  assert.equal(first.collection_score_cap, 69);
});

test('Set-level Critic ranks directions and caps brand exclusivity when provided assets are unused', () => {
  const make = (id, family_type, mechanism, examples) => ({
    direction: {
      direction_id: id, family_type, strategic_idea: mechanism,
      brand_evidence: '项目品牌平台事实', asset_references: [],
      selection_mechanism: { visual_mapping_rule: mechanism, platform_signature: mechanism },
      graphic_system: { how_graphics_form: mechanism, brand_fact_mapping: '项目品牌事实映射' },
      core_reusable_assets: [{ reusable_touchpoints: ['poster'] }],
      execution_examples: examples,
      template_risks: id === 'E02' ? ['材质纹理可能通用'] : ['避免模板']
    }
  });
  const compiled = {
    directions: [
      make('E01', 'supply_chain_trust', '验证窗口映射温控轨迹与交付状态', [{ touchpoint: 'poster', hero_subject: '验证窗口', communication_goal: '可信交付', industry_content: '真实交付节点' }]),
      make('E02', 'product_material_aesthetics', '通用材质纹理与低透明叠加', [{ touchpoint: 'poster', hero_subject: '抽象氛围', communication_goal: '品质' }]),
      make('E03', 'industry_ecosystem', '角色服务交换与结果回流编排', [{ touchpoint: 'portal', hero_subject: '服务交换卡', communication_goal: '协同', industry_content: '真实角色行为' }])
    ],
    gates: { brand_identity_preservation: { brand_name_preserved: true }, direction_family_difference: { difference_score: 0.8 } }
  };
  const critic = evaluateModelCriticAdvisory(compiled, {
    benchmarkRetrieval: { retrieval_status: 'completed' },
    visualAssetEvidence: { logo: [{ evidence_id: 'VA-01' }] }
  });
  assert.equal(critic.set_level_critic.dimension_rankings.length, 7);
  assert.equal(critic.critic_confidence, 'low');
  assert.ok(critic.per_direction.every((item) => item.dimensions.brand_exclusivity <= 3));
  assert.ok(new Set(critic.per_direction.map((item) => item.score)).size > 1);
  assert.ok(critic.set_level_critic.best_direction_id);
  assert.ok(critic.set_level_critic.weakest_direction_id);
});

test('report exposes internal Anchor test readiness without entering formal Anchor', () => {
  const modelCritic = {
    recommendation: 'Promising With Revision', score: 68, critic_confidence: 'medium',
    set_level_critic: {
      best_direction_id: 'E01', weakest_direction_id: 'E03',
      recommendation_confidence: 'medium', comparative_summary: 'E01 临时优先。',
      dimension_rankings: [{ dimension: 'anchor_potential', ranking: ['E01', 'E02', 'E03'], rationale: 'E01 最高。' }]
    },
    per_direction: []
  };
  const vm = compileVisualDirectionsReportViewModel({
    projectId: 'anchor-internal-test',
    compiled: {
      overall_status: 'ready_with_warnings', execution_permission_status: 'conditional',
      anchor_readiness: 'blocked', gate_issues: [], model_critic: modelCritic,
      directions: ['E01', 'E02', 'E03'].map((id) => ({
        local_status: 'ready_with_warnings', direction: { direction_id: id, direction_name: id, execution_examples: [] }
      }))
    },
    pipelineCompleteness: 'partial',
    visualFactFirst: {
      visualBrief: {}, visualAssetEvidence: { unresolved: [] },
      benchmarkRetrieval: { retrieval_status: 'partial', cases: [{ case_id: 'BC001' }] },
      visualOpportunitySynthesis: { differentiation_opportunities: [{}, {}, {}] }
    }
  });
  assert.equal(vm.executive_summary.anchor_test_readiness, 'internal_test_only');
  assert.equal(vm.executive_summary.anchor_readiness, 'blocked');
});

test('A/B evaluator permits replacement only when every documented threshold passes', () => {
  const run = (visual) => ({ document_analysis_ms: visual ? 600 : 1000, upstream_input_tokens: visual ? 600 : 1000, brand_role_accuracy: 1, locked_asset_protection: 1, gate_false_positives: visual ? 0 : 1, direction_mechanism_difference: visual ? 0.9 : 0.7, template_risk: visual ? 0.1 : 0.3, e02_lab_drift: visual ? 0 : 1, anchor_usability: visual ? 0.9 : 0.6, permanent_running: 0 });
  const projects = ['九州美学', '名济堂', '万科苏皖'].map((project) => ({ project, legacy: [run(false), run(false), run(false)], visual_fact_first: [run(true), run(true), run(true)] }));
  const result = evaluateVisualFactFirstAB(projects);
  assert.equal(result.replacement_allowed, true);
  assert.equal(result.summary.anchor_wins, 3);
});

test('V2 runner executes Retrieval First while preserving Step 4 and lightweight validation', async () => {
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
    provider: 'fixture', modelId: 'fixture-model', analysisPipelineMode: 'retrieval_first',
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
  assert.equal(result.analysisPipelineMode, 'retrieval_first');
  assert.equal(result.pipelineObservability.pipeline_mode, 'retrieval_first');
  assert.equal(result.pipelineObservability.pipeline_completeness, 'partial');
  assert.equal(result.modelCallCount, 3);
  assert.match(result.reportMarkdown, /管线完整度：\*\*部分完整\*\*/u);
  assert.match(result.reportMarkdown, /## 4\. 三方向对比/u);
  assert.match(result.reportMarkdown, /## 附录 A：Retrieval First 证据摘要/u);
  assert.doesNotMatch(result.reportMarkdown, /visualDirectionV2\.|field_path|matched_rule|moderate_confidence_brand_indicator/u);
  assert.match(result.auditMarkdown, /## 1\. Runtime 状态/u);
  assert.match(result.auditMarkdown, /## 9\. 原始字段路径索引/u);
  for (const item of result.compiled.directions) {
    assert.equal(item.readiness_score.final_content_readiness, item.content_readiness_score);
  }
  assert.equal(result.compiled.directions.find((item) => item.direction.direction_id === 'E03').readiness_score.final_content_readiness, 59);
  assert.ok(result.rawDirections.every((direction) => direction.source_opportunity_ids.length > 0));
  assert.ok(checkpoints.some((item) => item.outputFile === '04-Visual-Opportunity-Synthesis.md'));
  assert.ok(checkpoints.some((item) => item.outputFile === '06-Visual-Directions.json'));
  assert.ok(checkpoints.some((item) => item.outputFile === '06-Visual-Directions-Report.md'));
  assert.ok(checkpoints.some((item) => item.outputFile === '06-Visual-Directions-Audit.md'));
  assert.equal(result.reportBasename, '06-Visual-Directions-Report.md');
  assert.equal(result.status, 'completed-directions');
});
