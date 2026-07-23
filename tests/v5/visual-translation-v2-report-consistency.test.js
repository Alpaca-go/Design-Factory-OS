import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileExecutionDirectionV2 } from '../../src/v5/visual-translation/v2/runtime/compile-execution-direction-v2.js';
import { renderNestedField } from '../../src/v5/visual-translation/v2/report/compile-execution-directions-report-v2.js';
import { compileExecutionDirectionsReportV2 } from '../../src/v5/visual-translation/v2/report/visual-directions-report-compiler.js';
import { gateIssueKey } from '../../src/v5/visual-translation/v2/runtime/gate-issue-aggregator.js';
import { normalizeConsumerValue } from '../../src/v5/visual-translation/v2/runtime/consumer-value-normalizer.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(HERE, '..', 'fixtures', 'visual-direction-v2');

const PROJECTS = [
  { fixture: 'jiuzhou-meixue', brandName: '九州美学', brandRole: '医美全链生态平台' },
  { fixture: 'mingjitang', brandName: '名济堂', brandRole: '中医与功效护肤品牌' },
  { fixture: 'vanke-suwan', brandName: '万科苏皖', brandRole: '社区生活服务商' }
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function compileFixture(project) {
  const base = join(FIXTURE_ROOT, project.fixture);
  const compiled = compileExecutionDirectionV2({
    rawDirections: readJson(join(base, 'v2-directions.json')),
    evidenceIndex: readJson(join(base, 'evidence-index.json')),
    audienceBoundary: readJson(join(base, 'audience-boundary.json')),
    assetBoundary: readJson(join(base, 'asset-boundary.json')),
    selectedTouchpoints: readJson(join(base, 'selected-touchpoints.json')),
    brandFacts: {
      reportLanguage: 'zh-CN',
      identity: { brandName: project.brandName, brandRole: project.brandRole }
    },
    expectedBrandName: project.brandName,
    brandRole: project.brandRole,
    failFast: false
  });
  return {
    compiled,
    report: compileExecutionDirectionsReportV2({ projectId: project.fixture, compiled })
  };
}

test('nested Markdown renderer expands objects and arrays without scalar leakage', () => {
  const lines = renderNestedField('信息区域', {
    position: '右下',
    content: ['主标题', { label: 'CTA', value: '预约咨询' }],
    ignored: undefined,
    empty: null
  });
  const markdown = lines.join('\n');
  assert.match(markdown, /信息区域/);
  assert.match(markdown, /位置：右下/);
  assert.match(markdown, /主标题/);
  assert.doesNotMatch(markdown, /\[object Object\]|\bundefined\b|\bnull\b/);
});

test('consumer normalization preserves precedence and legacy compatibility', () => {
  const fromExamples = normalizeConsumerValue({
    direction_id: 'E01',
    execution_examples: [
      { downstream_consumer_value: { present: true, consumer_value_role: 'auxiliary' } },
      { downstream_consumer_value: { present: true, consumer_value_role: 'secondary' } }
    ]
  });
  assert.equal(fromExamples.consumer_value_role, 'secondary');
  assert.equal(fromExamples.source, 'execution_examples');

  const legacy = normalizeConsumerValue({ direction_id: 'E02', consumer_role: 'strong_secondary' });
  assert.equal(legacy.consumer_value_role, 'strong_secondary');
  assert.equal(legacy.present, true);
  assert.equal(legacy.source, 'direction_level');

  const institutionValue = normalizeConsumerValue({
    direction_id: 'E03', downstream_consumer_value: {
      present: true, consumer_value_role: 'strong_secondary',
      value_statement: '降低机构采购风险并提升机构运营效率', visual_expression: '机构运营看板', touchpoints: [], evidence_ids: []
    }
  });
  assert.equal(institutionValue.value_audience, 'institution');
  const consumerValue = normalizeConsumerValue({
    direction_id: 'E02', downstream_consumer_value: {
      present: true, consumer_value_role: 'strong_secondary',
      value_statement: '让消费者获得安全、透明且可追溯的终端体验', visual_expression: '消费者结果层', touchpoints: [], evidence_ids: []
    }
  });
  assert.equal(consumerValue.value_audience, 'consumer');
});

for (const project of PROJECTS) {
  test(`${project.fixture} report is structurally safe and gate-consistent`, () => {
    const { compiled, report } = compileFixture(project);

    assert.doesNotMatch(report, /\[object Object\]/);
    assert.doesNotMatch(report, /\bundefined\b|\bnull\b/);
    assert.doesNotMatch(report, /非项目品牌\s+brand_role_reduced/);
    for (const item of compiled.directions) assert.match(report, new RegExp(item.direction.direction_id));

    const coverage = new Map(compiled.gates.consumer_value_coverage.per_direction.map((item) => [item.direction_id, item]));
    for (const item of compiled.gates.consumer_weight_consistency.per_direction) {
      assert.equal(item.consumer_value_role, coverage.get(item.direction_id)?.consumer_value_role);
      assert.equal(item.present, coverage.get(item.direction_id)?.present);
    }

    const keys = compiled.gate_issues.map(gateIssueKey);
    assert.equal(new Set(keys).size, keys.length, 'structured gate issues must be deduplicated');
    for (const issue of compiled.gate_issues) {
      if (issue.scope === 'direction' && issue.severity === 'blocking') {
        assert.ok(issue.field_path, `${issue.code} must include field_path`);
      }
    }

    for (const item of compiled.directions.filter((entry) => !entry.validation_error)) {
      assert.ok(Number.isFinite(item.structural_completeness_score));
      assert.ok(item.local_status);
      assert.ok(item.collection_status);
      assert.ok(item.local_execution_permission_status);
    }
  });
}
