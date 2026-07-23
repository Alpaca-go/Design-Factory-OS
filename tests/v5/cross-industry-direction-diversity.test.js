import test from 'node:test';
import assert from 'node:assert/strict';

import { compileDirectionFamilyCandidates } from '../../src/v5/visual-translation/v2/visual-fact-first/direction-family-compiler.js';
import { resolveBenchmarkRequirementStatus } from '../../src/v5/visual-translation/v2/visual-fact-first/benchmark-status-resolver.js';
import { evaluatePipelineCompleteness } from '../../src/v5/visual-translation/v2/visual-fact-first/pipeline-completeness.js';
import { classifyPhotographySubject } from '../../src/v5/visual-translation/v2/runtime/photography-subject-classifier.js';
import { evaluateModelCriticAdvisory } from '../../src/v5/visual-translation/v2/runtime/lightweight-validator.js';
import { evaluateFamilyRecommendationBias } from '../../src/v5/visual-translation/v2/freeze-test/family-bias-monitor.js';

const opportunities = {
  differentiation_opportunities: [
    {
      opportunity_id: 'OP-01', title: '使用动作成为识别', visual_problem: '使用过程不可见',
      opportunity_statement: '把使用步骤转成连续图形', visual_protagonist: '手部使用动作',
      generative_mechanism: '动作节奏映射为图形序列', brand_fact_refs: ['BF-01'],
      visual_asset_refs: ['VA-01'], anti_template_refs: ['BG-01'], suitable_touchpoints: ['包装', '短视频'], confidence: 0.9
    },
    {
      opportunity_id: 'OP-02', title: '地域文化叙事', visual_problem: '品牌故事缺少独占表达',
      opportunity_statement: '把地域文化符号转成叙事章节', visual_protagonist: '地域器物',
      generative_mechanism: '文化片段重组为章节系统', brand_fact_refs: ['BF-02'],
      visual_asset_refs: [], anti_template_refs: ['BG-02'], suitable_touchpoints: ['门店', '海报'], confidence: 0.8
    },
    {
      opportunity_id: 'OP-03', title: '产品材料触感', visual_problem: '产品对象缺少近距离证据',
      opportunity_statement: '用材料与产品细节建立触感', visual_protagonist: '产品剖面',
      generative_mechanism: '材料层级生成版式比例', brand_fact_refs: ['BF-03'],
      visual_asset_refs: ['VA-02'], anti_template_refs: ['BG-03'], suitable_touchpoints: ['详情页', '陈列'], confidence: 0.85
    }
  ]
};

test('direction family compiler creates a diverse 5-7 candidate pool and selects three', () => {
  const result = compileDirectionFamilyCandidates({ visualOpportunitySynthesis: opportunities });
  assert.ok(result.candidates.length >= 5 && result.candidates.length <= 7);
  assert.equal(result.selected_candidates.length, 3);
  assert.ok(result.strategic_axes_covered.length >= 3);
  assert.ok(new Set(result.selected_candidates.map((item) => item.source_opportunity_ids[0])).size >= 2);
  assert.ok(result.candidates.every((item) => !['A', 'B', 'C'].includes(item.candidate_id)));
});

test('benchmark resolver exposes each subthreshold and partial cannot produce complete pipeline', () => {
  const cases = [
    ...Array.from({ length: 3 }, (_, index) => ({ case_id: `D${index}`, case_type: 'direct_industry' })),
    ...Array.from({ length: 3 }, (_, index) => ({ case_id: `B${index}`, case_type: 'business_model' }))
  ];
  const result = resolveBenchmarkRequirementStatus(cases);
  assert.equal(result.status, 'partial');
  assert.equal(result.requirement_status.total_usable.passed, true);
  assert.equal(result.requirement_status.anti_template.passed, false);
  const completeness = evaluatePipelineCompleteness({
    artifactNames: [
      '01-Visual-Brief.json', '01-Visual-Brief.md', '02-Visual-Asset-Evidence.json',
      '02-Visual-Asset-Evidence.md', '03-Benchmark-Query-Plan.json', '03-Benchmark-Cases.json',
      '04-Visual-Opportunity-Synthesis.json', '04-Visual-Opportunity-Synthesis.md', '05-Step4-Input-Context.json'
    ],
    visualFacts: {}, benchmarkRetrieval: { cases, retrieval_status: 'partial', minimum_case_requirements_met: false },
    visualOpportunitySynthesis: opportunities, step4Context: {}
  });
  assert.equal(completeness, 'partial');
});

test('photography authorization is only required for identifiable institutions', () => {
  assert.equal(classifyPhotographySubject({
    photography_object_system: { subject_and_background: '真实医院门头与机构 Logo 清晰可识别' }
  }).institution_authorization_required, true);
  for (const text of ['匿名化机构服务场景，不露出名称', '模型生成的示意场景', '平台操作界面', '产品静物与包装']) {
    assert.equal(classifyPhotographySubject({
      photography_object_system: { subject_and_background: text }
    }).institution_authorization_required, false, text);
  }
});

function criticDirection(id, status, detail) {
  return {
    local_status: status,
    direction: {
      direction_id: id, strategic_idea: `${detail}形成项目专属视觉机制`,
      source_opportunity_ids: [`OP-${id}`], brand_evidence: `${detail}品牌事实`,
      graphic_system: { brand_fact_mapping: `${detail}事实映射`, how_graphics_form: `${detail}生成图形` },
      selection_mechanism: { visual_mapping_rule: `${detail}映射规则` },
      core_reusable_assets: [{ asset_name: `${detail}资产`, reusable_touchpoints: ['海报', '页面'] }],
      execution_examples: [{ touchpoint: '海报', hero_subject: detail, communication_goal: '建立识别', industry_content: detail, brand_specific_detail: detail, responsive_adaptation: '横竖版适配' }],
      template_risks: ['避免通用模板'], anti_concept_art_constraints: [{}]
    }
  };
}

test('Critic decisions are mutually exclusive and FinalDirectionRanking is consistent', () => {
  const critic = evaluateModelCriticAdvisory({
    directions: [
      criticDirection('D01', 'ready', '使用动作'),
      criticDirection('D02', 'ready_with_warnings', '地域器物'),
      criticDirection('D03', 'rewrite_required', '通用节点网络')
    ],
    gates: {}
  }, { benchmarkRetrieval: { retrieval_status: 'completed' } });
  assert.equal(critic.per_direction.filter((item) => item.decision === 'primary_candidate').length, 1);
  assert.ok(critic.per_direction.filter((item) => item.decision === 'secondary_option').length <= 1);
  assert.notEqual(critic.final_direction_ranking.primary_direction_id, critic.final_direction_ranking.weakest_direction_id);
  assert.equal(critic.final_direction_ranking.rejected_direction_ids.includes(critic.final_direction_ranking.primary_direction_id), false);
  assert.notEqual(critic.per_direction.find((item) => item.direction_id === 'D03').decision, 'primary_candidate');
  assert.ok(critic.per_direction.every((item) =>
    Object.values(item.dimension_scores).every((dimension) => dimension.evidence.length || dimension.score <= 3)));
});

test('family recommendation bias is audited at seventy percent of projects', () => {
  const projects = Array.from({ length: 10 }, (_, index) => ({
    final_direction_ranking: { primary_direction_id: index < 7 ? `D${index}-A` : `D${index}-B` },
    directions: [
      { direction_id: `D${index}-A`, family_type: '动作系统', score: 80 },
      { direction_id: `D${index}-B`, family_type: '文化叙事', score: 75 }
    ]
  }));
  const result = evaluateFamilyRecommendationBias(projects);
  assert.equal(result.family_recommendation_bias, 'high');
  assert.equal(result.audit_warning, '动作系统');
});

