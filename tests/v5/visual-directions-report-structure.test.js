import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { compileExecutionDirectionV2 } from '../../src/v5/visual-translation/v2/runtime/compile-execution-direction-v2.js';
import { compileExecutionDirectionsReportV2 as compileLegacyReport } from '../../src/v5/visual-translation/v2/report/compile-execution-directions-report-v2.js';
import {
  compileExecutionDirectionsAuditV2,
  compileExecutionDirectionsReportV2,
  compileVisualDirectionsReportViewModel,
  groupVisualDirectionIssues
} from '../../src/v5/visual-translation/v2/report/visual-directions-report-compiler.js';

const fixtureRoot = path.resolve('tests/fixtures/visual-direction-v2/jiuzhou-meixue');
const readJson = (name) => JSON.parse(readFileSync(path.join(fixtureRoot, name), 'utf8'));

function compiledFixture() {
  return compileExecutionDirectionV2({
    rawDirections: readJson('v2-directions.json'),
    evidenceIndex: readJson('evidence-index.json'),
    audienceBoundary: readJson('audience-boundary.json'),
    assetBoundary: readJson('asset-boundary.json'),
    selectedTouchpoints: readJson('selected-touchpoints.json'),
    brandFacts: { reportLanguage: 'zh-CN', identity: { brandName: '九州美学', brandRole: '医美全链生态平台' } },
    expectedBrandName: '九州美学',
    brandRole: '医美全链生态平台',
    failFast: false
  });
}

function visualFactFirstFixture() {
  return {
    pipelineCompleteness: 'partial',
    visualBrief: { schema_version: 'fixture' },
    visualAssetEvidence: { assets: [] },
    benchmarkRetrieval: { retrieval_status: 'failed', query_count: 5, result_count: 0, relevant_count: 0, cases: [], minimum_case_requirements_met: false },
    visualOpportunitySynthesis: { differentiation_opportunities: [
      { opportunity_id: 'VO01', opportunity_name: '可验证交付' },
      { opportunity_id: 'VO02', opportunity_name: '平台品质选择' },
      { opportunity_id: 'VO03', opportunity_name: '生态价值回流' }
    ] }
  };
}

test('formal report is decision-oriented while audit preserves technical evidence', () => {
  const compiled = compiledFixture();
  const visualFactFirst = visualFactFirstFixture();
  const input = { projectId: 'jiuzhou-report-refactor', compiled, pipelineCompleteness: 'partial', visualFactFirst };
  const report = compileExecutionDirectionsReportV2(input);
  const audit = compileExecutionDirectionsAuditV2(input);
  const legacyReport = compileLegacyReport({ projectId: input.projectId, compiled });

  for (const heading of ['## 1. 执行摘要', '## 2. 管线完整度', '## 3. 关键阻断与待确认事项', '## 4. 三方向对比', '## 8. 下一步动作']) {
    assert.match(report, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.equal((report.match(/### 执行触点（3）/gu) || []).length, 3);
  assert.doesNotMatch(report, /三个执行触点（完整）|visualDirectionV2\.|field_path|matched_rule|moderate_confidence_brand_indicator|not_configured|fabricated_data_or_credentials|0\.\d{3,}/u);
  assert.ok(report.length <= legacyReport.length * 0.65, 'formal report must be at least 35% shorter than the legacy technical report');
  assert.match(report, /标杆检索 \| 失败 \| 无可用检索案例/u);
  assert.match(report, /方向 Critic/u);

  assert.match(audit, /"field_path":/u);
  assert.match(audit, /"matched_rule":/u);
  assert.match(audit, /## 1\. Pipeline Integrity/u);
  assert.match(audit, /## 14\. Collection Status Compilation/u);
  assert.doesNotMatch(audit, /## (3b|8b|8c|8d)\b/u);
});

test('issue grouping folds six identical temperature hits into one user issue', () => {
  const issues = Array.from({ length: 6 }, (_, index) => ({
    code: 'EVIDENCE_BOUND_VALUE_REQUIRED', severity: 'blocking', scope: 'direction',
    direction_id: 'E01', source_direction_ids: ['E01'],
    field_path: `visualDirectionV2.execution_examples[${index}].industry_content`,
    matched_rule: 'confirmed_evidence_bound_value_required', detected_value: '10–25℃',
    evidence_excerpt: '温层 10—25℃', message: '具体数值未绑定证据'
  }));
  const groups = groupVisualDirectionIssues(issues);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].hit_count, 6);

  const compiled = compiledFixture();
  compiled.gate_issues = issues;
  const vm = compileVisualDirectionsReportViewModel({ projectId: 'temperature-grouping', compiled, visualFactFirst: visualFactFirstFixture() });
  const report = compileExecutionDirectionsReportV2({ projectId: 'temperature-grouping', compiled, visualFactFirst: visualFactFirstFixture() });
  assert.equal(vm.issue_groups.length, 1);
  assert.equal((report.match(/具体数值缺少事实依据/gu) || []).length, 1);
  assert.match(report, /合并 6 处命中/u);
});
