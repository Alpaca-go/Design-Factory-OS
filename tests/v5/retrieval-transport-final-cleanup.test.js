import test from 'node:test';
import assert from 'node:assert/strict';

import { retrieveBenchmarkCases } from '../../src/v5/visual-translation/v2/visual-fact-first/benchmark-retrieval.js';
import { resolveAssetOwnership } from '../../src/v5/visual-translation/v2/runtime/asset-ownership-resolver.js';
import { classifyPlaceholder } from '../../src/v5/visual-translation/v2/runtime/placeholder-classifier.js';
import { evaluateModelCriticAdvisory } from '../../src/v5/visual-translation/v2/runtime/lightweight-validator.js';

const queryPlan = {
  industry_queries: [{ query: 'healthcare platform identity', purpose: 'industry', expected_case_type: 'direct_industry' }]
};

const benchmarkCase = {
  case_name: 'Platform identity',
  source_url: 'https://example.com/platform',
  case_type: 'direct_industry',
  industry: 'healthcare',
  business_model: 'platform',
  relevant_touchpoints: ['poster'],
  useful_visual_mechanisms: ['verification window'],
  visual_strengths: ['clear hierarchy'],
  template_risks: [],
  relevance_score: 0.9,
  evidence_images: []
};

function provider(name, implementation, health = { healthy: true, status_code: 200 }) {
  const fn = implementation;
  fn.provider = name;
  fn.endpoint = `https://${name}.example/search`;
  fn.method = 'GET';
  fn.healthCheck = async () => health;
  return fn;
}

test('transport retries a network failure then switches provider without query fallback', async () => {
  let primaryCalls = 0;
  const primary = provider('primary', async () => {
    primaryCalls += 1;
    throw Object.assign(new Error('socket network failure'), { code: 'ECONNRESET' });
  });
  const secondary = provider('secondary', async () => [benchmarkCase]);
  const composite = async () => [];
  composite.providers = [primary, secondary];

  const result = await retrieveBenchmarkCases({
    queryPlan,
    retriever: composite,
    transportOptions: { retryDelaysMs: [0, 0], timeoutMs: 100 }
  });

  assert.equal(primaryCalls, 3);
  assert.equal(result.result_count, 1);
  assert.equal(result.fallback_state.provider_fallback_count, 1);
  assert.equal(result.fallback_state.query_fallback_count, 0);
  assert.deepEqual(result.fallback_state.providers_tried, ['primary', 'secondary']);
  assert.equal(result.transport_diagnostics.filter((item) => item.provider === 'primary').length, 3);
  assert.ok(result.transport_diagnostics.filter((item) => item.provider === 'primary')
    .every((item) => item.failure_reason === 'network_error' && item.failure_stage === 'connect'));
});

test('transport does not retry 401 but does retry 429', async () => {
  let unauthorizedCalls = 0;
  const unauthorized = provider('unauthorized', async () => {
    unauthorizedCalls += 1;
    throw Object.assign(new Error('unauthorized'), { status: 401 });
  });
  let limitedCalls = 0;
  const limited = provider('limited', async () => {
    limitedCalls += 1;
    throw Object.assign(new Error('rate limited'), { status: 429 });
  });
  const success = provider('success', async () => [benchmarkCase]);
  const composite = async () => [];
  composite.providers = [unauthorized, limited, success];

  const result = await retrieveBenchmarkCases({
    queryPlan,
    retriever: composite,
    transportOptions: { retryDelaysMs: [0, 0], timeoutMs: 100 }
  });

  assert.equal(unauthorizedCalls, 1);
  assert.equal(limitedCalls, 3);
  assert.equal(result.result_count, 1);
  assert.ok(result.transport_diagnostics.some((item) => item.failure_reason === 'unauthorized'));
  assert.ok(result.transport_diagnostics.some((item) => item.failure_reason === 'rate_limited'));
});

test('unhealthy primary is skipped before formal benchmark queries', async () => {
  let primaryCalls = 0;
  const primary = provider('primary', async () => { primaryCalls += 1; return []; }, { healthy: false, status_code: 503 });
  const secondary = provider('secondary', async () => [benchmarkCase]);
  const composite = async () => [];
  composite.providers = [primary, secondary];

  const result = await retrieveBenchmarkCases({ queryPlan, retriever: composite });
  assert.equal(primaryCalls, 0);
  assert.equal(result.provider_health[0].status, 'unhealthy');
  assert.equal(result.fallback_state.provider_fallback_count, 1);
  assert.deepEqual(result.fallback_state.providers_tried, ['secondary']);
});

test('Logo ownership defaults project labels and excludes generic inheritance language', () => {
  assert.equal(resolveAssetOwnership({ text: '标准 Logo' }), 'project_brand');
  assert.equal(resolveAssetOwnership({ text: '品牌 Logo' }), 'project_brand');
  assert.equal(resolveAssetOwnership({ text: '九州美学 Logo', projectBrandName: '九州美学' }), 'project_brand');
  assert.equal(resolveAssetOwnership({ text: '九州通集团 VI', parentBrandName: '九州通集团' }), 'parent_group');
  assert.equal(resolveAssetOwnership({ text: '合作品牌 Logo' }), 'partner_brand');
  assert.equal(resolveAssetOwnership({ text: '供应商品牌 Logo' }), 'third_party');
  assert.equal(resolveAssetOwnership({ text: '继承现有视觉资产' }), null);
});

test('safe structure placeholders are distinct from unresolved user inputs', () => {
  const direction = { asset_authorization: { document_visualization_mode: 'structure_only' } };
  assert.equal(classifyPlaceholder({ detected_text: '资质占位区', reason: '示意字段' }, direction), 'safe_structure_placeholder');
  assert.equal(classifyPlaceholder({ detected_text: '待确认覆盖率数据' }, {}), 'unresolved_data_placeholder');
  assert.equal(classifyPlaceholder({ detected_text: '待确认集团 Logo' }, {}), 'authorization_placeholder');
});

test('Critic second pass differentiates equal first-pass scores using comparative semantics', () => {
  const make = (id, detail) => ({
    direction: {
      direction_id: id,
      family_type: 'supply_chain_trust',
      strategic_idea: '验证窗口映射规则',
      brand_evidence: '项目品牌事实',
      asset_references: [],
      selection_mechanism: { visual_mapping_rule: '验证窗口映射规则', platform_signature: '平台标签' },
      graphic_system: { how_graphics_form: '轨迹切片形成规则', brand_fact_mapping: '品牌事实映射' },
      core_reusable_assets: [{ reusable_touchpoints: ['poster'] }],
      template_risks: [],
      execution_examples: [{
        touchpoint: 'poster', hero_subject: '验证窗口', communication_goal: '建立信任',
        industry_content: '真实流程', brand_specific_detail: detail
      }]
    }
  });
  const critic = evaluateModelCriticAdvisory({
    directions: [make('E01', '验证交付追溯机制'), make('E02', '通用材质纹理氛围')],
    gates: {
      brand_identity_preservation: { brand_name_preserved: true },
      direction_family_difference: { difference_score: 0.8 }
    }
  }, { benchmarkRetrieval: { retrieval_status: 'completed' } });

  assert.equal(critic.second_pass_required, true);
  assert.equal(critic.set_level_critic.second_pass_resolved, true);
  assert.notEqual(critic.per_direction[0].score, critic.per_direction[1].score);
  assert.deepEqual(
    critic.set_level_critic.comparative_direction_results.map((item) => item.relative_rank).sort(),
    [1, 2]
  );
});
