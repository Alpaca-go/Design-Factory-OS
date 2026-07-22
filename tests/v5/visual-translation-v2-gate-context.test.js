import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { classifyFieldSemanticRole, isNegatedContext } from '../../src/v5/visual-translation/v2/runtime/field-semantic-role.js';
import { evaluateAssetAuthorization } from '../../src/v5/visual-translation/v2/runtime/asset-authorization-evaluator.js';
import { evaluateSpatialDrift } from '../../src/v5/visual-translation/v2/runtime/spatial-drift-evaluator.js';
import { detectUnexpectedBrandNames, normalizeBrandCandidate } from '../../src/v5/visual-translation/v2/runtime/brand-identity-preservation-evaluator.js';
import { evaluateExecutionExampleCompleteness, hasMeaningfulValue } from '../../src/v5/visual-translation/v2/runtime/execution-example-completeness-evaluator.js';
import { evaluateDirectionFamilyDifference } from '../../src/v5/visual-translation/v2/runtime/direction-family-difference-evaluator.js';
import { aggregateGateIssues } from '../../src/v5/visual-translation/v2/runtime/gate-issue-aggregator.js';
import { compileExecutionDirectionV2 } from '../../src/v5/visual-translation/v2/runtime/compile-execution-direction-v2.js';
import { compileExecutionDirectionsReportV2 } from '../../src/v5/visual-translation/v2/report/compile-execution-directions-report-v2.js';
import { buildExecutionDirectionV2Prompt } from '../../src/v5/visual-translation/v2/prompts/direction-generation-prompt-v2.js';

const fixtureRoot = path.resolve('tests/fixtures/visual-direction-v2/jiuzhou-meixue');
const readJson = (name) => JSON.parse(readFileSync(path.join(fixtureRoot, name), 'utf8'));
const context = () => ({
  rawDirections: readJson('v2-directions.json'),
  evidenceIndex: readJson('evidence-index.json'),
  audienceBoundary: readJson('audience-boundary.json'),
  assetBoundary: readJson('asset-boundary.json'),
  selectedTouchpoints: readJson('selected-touchpoints.json'),
  brandFacts: { reportLanguage: 'zh-CN', identity: { brandName: '九州美学', brandRole: '医美全链生态平台' } }
});

test('negative fields and local negation never become positive violations', () => {
  assert.equal(classifyFieldSemanticRole('visualDirectionV2.execution_examples[0].prohibited_content'), 'negative_constraint');
  assert.equal(isNegatedContext('不得伪造认证徽章', 4), true);

  const safe = evaluateAssetAuthorization({
    direction_id: 'D01',
    execution_constraints: ['不得伪造官方认证徽章'],
    prohibited_content: '禁止出现官方资质图标'
  });
  assert.equal(safe.ok, true);
  assert.equal(safe.detections.length, 0);

  const mixed = evaluateAssetAuthorization({
    direction_id: 'D01',
    strategic_idea: '禁止使用认证徽章，但可仿制认证徽章作为主视觉'
  });
  assert.equal(mixed.ok, false);
  assert.equal(mixed.detections.filter((item) => item.risk_level === 'blocked').length, 1);

  const spatial = evaluateSpatialDrift([{
    direction_id: 'D01', prohibited_content: '禁止展厅、建筑透视构图和地产沙盘式布局',
    composition_templates: [{}, {}], graphic_system: { how_graphics_form: '验证窗口' },
    information_system: { information_hierarchy: ['品牌', '能力', '行动'] },
    anti_concept_art_constraints: ['保持平面'], execution_examples: [{ brand_specific_detail: '九州美学验证窗口' }]
  }]);
  assert.equal(spatial.spatial_drift_status, 'pass');
  assert.equal(spatial.evidence.length, 0);
});

test('brand fragments are rejected and evidenced group backing is not replacement', () => {
  assert.equal(normalizeBrandCandidate('以真实业'), null);
  assert.equal(normalizeBrandCandidate('背靠九州通医药集团'), '九州通医药集团');
  const relation = detectUnexpectedBrandNames({
    expectedBrandName: '九州美学',
    sourceText: '九州美学背靠九州通医药集团建立平台能力，但不得继承集团 Logo 或 VI',
    fieldPath: 'visualDirectionV2.strategic_idea',
    sourceEvidenceText: '九州美学获得九州通医药集团背书'
  });
  const detected = relation.detections.find((item) => item.detected_text === '九州通医药集团');
  assert.ok(detected);
  assert.equal(detected.brand_reference_role, 'group_backing');
  assert.equal(detected.source_supported, true);
});

test('dash placeholders are missing and drive direction-local rewrite semantics', () => {
  for (const value of [null, undefined, '', ' ', '—', '-', 'N/A', 'NA', '待补充', '待定', '暂无', {}, []]) {
    assert.equal(hasMeaningfulValue(value), false, `expected missing: ${JSON.stringify(value)}`);
  }
  const example = {
    touchpoint: '平台首页', hero_subject: '真实产品组合', reused_assets: ['E01-G-01'], industry_recognition_source: 'VE001',
    information_zone: '—', brand_zone: '—', canvas_ratio: '16:9', subject: '产品组合', visual_structure: '平台选择框',
    hero_subject_position: '中央', hero_subject_scale: '大', whitespace_behavior: '功能留白', responsive_adaptation: '横竖适配', anti_concept_art_rule: '保持平面'
  };
  const completeness = evaluateExecutionExampleCompleteness([{ direction_id: 'E01', execution_examples: [example] }]);
  assert.deepEqual(completeness.per_direction[0].examples[0].required_missing, ['information_zone', 'brand_zone']);

  const input = context();
  input.rawDirections[1].execution_examples[0].information_zone = '—';
  input.rawDirections[1].execution_examples[0].brand_zone = '—';
  const compiled = compileExecutionDirectionV2(input);
  const e02 = compiled.directions.find((item) => item.direction.direction_id === 'E02');
  assert.equal(e02.local_status, 'rewrite_required');
  assert.equal(e02.local_execution_permission_status, 'conditional');
  assert.equal(compiled.overall_status, 'rewrite_required');
  assert.equal(compiled.execution_permission_status, 'conditional');
  assert.equal(compiled.anchor_readiness, 'blocked');
});

test('direction issues preserve their source direction without pretending to affect all directions', () => {
  const input = context();
  const d03 = input.rawDirections[2];
  d03.downstream_consumer_value.present = false;
  d03.downstream_consumer_value.consumer_value_role = 'none';
  d03.compliance_weights.consumer_value_weight = 0.1;
  const compiled = compileExecutionDirectionV2(input);
  const issue = compiled.gate_issues.find((item) => item.code === 'CONSUMER_WEIGHT_CONSISTENCY');
  assert.ok(issue);
  assert.deepEqual(issue.source_direction_ids, ['E03']);
  assert.notDeepEqual(issue.affected_direction_ids, ['E01', 'E02', 'E03']);
  assert.equal(compiled.directions.find((item) => item.direction.direction_id === 'E03').local_status, 'rewrite_required');
  const report = compileExecutionDirectionsReportV2({ projectId: 'gate-context-test', compiled });
  assert.match(report, /问题发生方向 E03/u);
  assert.doesNotMatch(report, /影响方向：E01、E02、E03/u);
  assert.match(report, /Anchor Readiness：\*\*Blocked\*\*/u);
});

test('warning aggregation folds identical rule evidence while retaining field details', () => {
  const issues = aggregateGateIssues(Array.from({ length: 8 }, (_, index) => ({
    code: 'ASSET_AUTHORIZATION_WARNING', severity: 'warning', scope: 'direction', direction_id: 'E02',
    field_path: `visualDirectionV2.execution_examples[${index}].information_hierarchy`,
    matched_rule: 'FABRICATED_DATA_FIELD_STRUCTURE', evidence_excerpt: '该指标字段可保留结构 / 占位，不得填具体数值',
    message: '通用占位提示', value_source: 'provider'
  })));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].occurrences.length, 8);
  assert.equal(issues[0].field_paths.length, 8);
});

test('similarity gate detects one shared execution composition despite different wording', () => {
  const make = (id, family, idea) => ({
    direction_id: id, direction_family: family, strategic_idea: idea,
    composition_templates: [{ subject_position: '左侧主体', information_position: '右侧信息，底部 CTA', image_object_rule: '低透明度图形叠加' }],
    execution_examples: [{ hero_subject_position: '左侧', photography_ratio: 0.4, graphic_ratio: 0.35, information_ratio: 0.25, graphic_overlay: '低透明度叠加', information_hierarchy: '品牌—能力—行动', responsive_adaptation: '移动端垂直堆叠', layout_structure: '左主体右信息' }],
    information_system: { information_hierarchy: ['品牌', '能力', '行动'] }, layout_behavior: { multi_size_adaptation: '移动端垂直堆叠' }
  });
  const result = evaluateDirectionFamilyDifference([
    make('E01', 'A', '可信交付'), make('E02', 'B', '品质选择'), make('E03', 'C', '生态协同')
  ]);
  assert.equal(result.execution_template_difference, 'rewrite_required');
  assert.equal(result.rewrite_required, true);
});

test('direction prompt encodes the three differentiated quality mechanisms', () => {
  const messages = buildExecutionDirectionV2Prompt({
    projectId: 'prompt-quality-test', evidenceIndex: {}, audienceBoundary: {},
    assetBoundary: {}, selectedTouchpoints: [], brandFacts: {}
  });
  const prompt = messages.map((message) => message.content).join('\n');
  assert.match(prompt, /验证窗口|时间带|批次轨迹/u);
  assert.match(prompt, /平台品质选择/u);
  assert.match(prompt, /不是成分、配方、实验室、护肤品或单一医械品牌/u);
  assert.match(prompt, /上游品牌.*平台.*机构.*消费者.*安全.*稳定.*透明/us);
});
