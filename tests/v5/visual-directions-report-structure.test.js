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
  assert.match(report, /标杆检索 \| 失败 \| 无可用检索案例 \| 方向可生成，但缺少外部参照/u);
  assert.match(report, /当前优先保留方向：\*\*(?:E0[1-3]|暂不选择)\*\*/u);
  assert.match(report, /正式推荐方向：\*\*(?:E0[1-3]|暂不确定)\*\*/u);
  assert.match(report, /推荐原因：.+/u);
  assert.match(report, /进入条件：\n\s+1\./u);
  assert.match(report, /\| 主要修改项 \| Anchor \|/u);
  assert.equal((report.match(/### 方向 Critic/gu) || []).length, 3);
  assert.equal((report.match(/### 核心视觉系统/gu) || []).length, 3);
  assert.match(report, /技术字段路径、Gate 规则与原始命中记录见：[\s\S]*06-Visual-Directions-Audit\.md/u);
  assert.doesNotMatch(report, /已阻断|方向 Critic：|———|综合就绪|存在一项需要|根据技术审计|查看对应 Gate/u);
  assert.ok((report.match(/^\d+\. \[(?:高|中|低)\]/gmu) || []).length <= 6);

  assert.match(audit, /"field_path":/u);
  assert.match(audit, /"rule_id":/u);
  for (const heading of [
    '## 1. Runtime 状态', '## 2. Pipeline Completeness 原始数据', '## 3. Gate 命中明细',
    '## 4. EvidenceRef 审计', '## 5. 品牌与授权审计', '## 6. Execution Example 完整性',
    '## 7. 方向相似度', '## 8. Model Critic 原始结果', '## 9. 原始字段路径索引'
  ]) assert.match(audit, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
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
  assert.equal(vm.grouped_issues.length, 1);
  assert.equal((report.match(/#### 无证据具体数据/gu) || []).length, 1);
  assert.match(report, /命中次数：6/u);
});

test('user report hides generic technical fallbacks while audit keeps the raw hit', () => {
  const compiled = compiledFixture();
  compiled.gate_issues = [{
    code: 'UNCLASSIFIED_TECHNICAL_HIT', severity: 'warning', direction_id: 'E02',
    field_path: 'visualDirectionV2.internal.value', matched_rule: 'internal_rule',
    message: 'FIELD_PATH_MISSING', recommendation: '查看对应 Gate 明细和方向级证据后修正。'
  }];
  const report = compileExecutionDirectionsReportV2({ projectId: 'fallback-filter', compiled, visualFactFirst: visualFactFirstFixture() });
  const audit = compileExecutionDirectionsAuditV2({ projectId: 'fallback-filter', compiled, visualFactFirst: visualFactFirstFixture() });
  assert.doesNotMatch(report, /FIELD_PATH_MISSING|查看对应 Gate|internal_rule/u);
  assert.match(audit, /FIELD_PATH_MISSING/u);
  assert.match(audit, /internal_rule/u);
});
