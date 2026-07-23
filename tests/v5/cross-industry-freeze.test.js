import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';

import {
  CROSS_INDUSTRY_FREEZE_THRESHOLDS,
  evaluateCrossIndustryFreeze,
  validateCrossIndustryProjectRecord
} from '../../src/v5/visual-translation/v2/freeze-test/cross-industry-freeze.js';
import {
  buildCrossIndustryFreezeArtifacts,
  compareFrozenComponentManifests,
  createFrozenComponentManifest
} from '../../src/v5/visual-translation/v2/freeze-test/freeze-artifacts.js';

function project(testId, projectType, inputType, overrides = {}) {
  const base = {
    test_id: testId,
    project_name: `项目${testId}`,
    project_type: projectType,
    industry: '示例行业',
    business_model: '示例商业模式',
    input_type: inputType,
    git_commit: 'abc123',
    model: 'fixture-model',
    started_at: '2026-07-23T10:00:00.000Z',
    completed_at: '2026-07-23T10:10:00.000Z',
    artifacts: {
      input_manifest_path: 'input-manifest.json',
      report_path: 'report.md',
      audit_path: 'audit.md',
      runtime_log_path: 'runtime-log.json'
    },
    pipeline: {
      completed: true,
      completeness: 'complete',
      total_duration_ms: 1200,
      retry_count: 0,
      provider_fallback_count: 0,
      legacy_fallback: false,
      stage_durations_ms: { retrieval: 200 }
    },
    retrieval: {
      status: 'completed',
      query_count: 5,
      raw_result_count: 15,
      relevant_result_count: 10,
      usable_case_count: 8,
      direct_industry_count: 3,
      business_model_count: 3,
      anti_template_count: 1
    },
    brand_understanding: {
      brand_name_correct: true,
      industry_correct: true,
      business_model_correct: true,
      audience_correct: true,
      brand_role_correct: true,
      adjacent_industry_misread: false
    },
    evidence: {
      unsupported_specific_data: false,
      structure_only_specific_values: false,
      project_logo_misjudged: false,
      external_logo_missed: false,
      authorization_boundary_correct: true,
      serious_fact_leak: false,
      unauthorized_asset_use: false,
      cross_project_brand_contamination: false
    },
    directions: {
      count: 3,
      clearly_distinct: true,
      family_repeated: false,
      protagonists_distinct: true,
      mechanisms_distinct: true,
      touchpoints_realistic: true,
      drawable_count: 2,
      industry_template_expression: false
    },
    visual_assets: {
      provided: true,
      analysis_completed: true,
      inherited_asset_count: 1
    },
    critic: {
      ranked: true,
      unexplained_tie: false,
      system_top_direction_id: 'E01',
      human_top_two_direction_ids: ['E01', 'E02'],
      recommendation_confidence_reasonable: true,
      text_length_rewarded: false
    },
    anchor: {
      readiness: 'internal_test_only',
      reasons: ['满足内部测试条件'],
      eligible_direction_ids: ['E01'],
      smoke_test: null
    },
    scores: Object.fromEntries([
      'brand_understanding',
      'evidence_safety',
      'retrieval_effectiveness',
      'direction_difference',
      'brand_exclusivity',
      'visual_generatability',
      'cross_touchpoint_extension',
      'critic_reliability',
      'report_readability',
      'pipeline_stability'
    ].map((key) => [key, 4])),
    direction_visual_generatability: [4, 3, 3],
    issues: []
  };
  return merge(base, overrides);
}

function merge(base, override) {
  const output = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && output[key] && typeof output[key] === 'object') {
      output[key] = { ...output[key], ...value };
    } else {
      output[key] = value;
    }
  }
  return output;
}

function sixProjects() {
  return [
    project('T01', 'product_brand', 'A'),
    project('T02', 'product_brand', 'B'),
    project('T03', 'platform_service', 'C'),
    project('T04', 'platform_service', 'A'),
    project('T05', 'retail_dining', 'B'),
    project('T06', 'nonstandard', 'C')
  ];
}

test('freeze project schema requires fixed score dimensions and explicit evidence booleans', () => {
  const valid = validateCrossIndustryProjectRecord(project('T01', 'product_brand', 'A'));
  assert.equal(valid.scores.pipeline_stability, 4);
  assert.throws(
    () => validateCrossIndustryProjectRecord(merge(project('T01', 'product_brand', 'A'), { scores: { evidence_safety: 6 } })),
    /scores/
  );
  assert.throws(
    () => validateCrossIndustryProjectRecord(merge(project('T01', 'product_brand', 'A'), { evidence: { authorization_boundary_correct: undefined } })),
    /authorization_boundary_correct/
  );
});

test('six mixed-industry records can pass every documented freeze threshold', () => {
  const result = evaluateCrossIndustryFreeze(sixProjects(), { baselineCommit: 'abc123' });
  assert.equal(result.project_count, 6);
  assert.equal(result.checkpoint, 'checkpoint_b');
  assert.equal(result.input_coverage.minimum_mix_met, true);
  assert.equal(result.freeze_decision, 'passed');
  assert.equal(result.development_allowed, false);
  assert.ok(Object.values(result.criteria).every(Boolean));
  assert.equal(result.metrics.evidence_safety_rate, 1);
});

test('fewer than six projects remains an insufficient freeze run', () => {
  const result = evaluateCrossIndustryFreeze(sixProjects().slice(0, 5));
  assert.equal(result.freeze_decision, 'insufficient_projects');
  assert.equal(result.criteria.enough_projects, false);
});

test('freeze drift or a Legacy fallback prevents release even when quality metrics pass', () => {
  let result = evaluateCrossIndustryFreeze(sixProjects(), { frozenComponentsIntact: false });
  assert.equal(result.criteria.frozen_components_intact, false);
  assert.equal(result.freeze_decision, 'failed');

  const records = sixProjects();
  records[0] = merge(records[0], { pipeline: { legacy_fallback: true } });
  result = evaluateCrossIndustryFreeze(records);
  assert.equal(result.criteria.no_legacy_fallback, false);
  assert.equal(result.projects[0].pipeline_pass, false);
  assert.equal(result.freeze_decision, 'failed');

  result = evaluateCrossIndustryFreeze(sixProjects(), { baselineDirty: true });
  assert.equal(result.criteria.baseline_worktree_clean, false);
  assert.equal(result.freeze_decision, 'failed');
});

test('one direction failure in six still meets the 80 percent aggregate threshold', () => {
  const records = sixProjects();
  records[5] = merge(records[5], { directions: { clearly_distinct: false } });
  const result = evaluateCrossIndustryFreeze(records);
  assert.equal(result.metrics.direction_difference_pass_rate, 0.8333);
  assert.equal(result.criteria.direction_difference_pass_rate, true);
});

test('the same defect across three projects unlocks only cross-project defect development', () => {
  const records = sixProjects();
  for (let index = 0; index < 3; index += 1) {
    records[index].issues = [{
      issue_id: `${records[index].test_id}-01`,
      defect_key: 'logo-owner-default',
      classification: 'core_defect',
      severity: 'high',
      module: 'logo-ownership',
      description: '项目 Logo 被误判',
      minimum_fix_scope: 'Logo ownership resolver'
    }];
  }
  const result = evaluateCrossIndustryFreeze(records);
  assert.equal(result.development_triggers.repeated_cross_project_defect, true);
  assert.equal(result.development_allowed, true);
  assert.equal(result.repeated_defects[0].affected_project_count, 3);
});

test('a single high-risk fact or authorization failure immediately triggers development', () => {
  const records = sixProjects();
  records[2] = merge(records[2], {
    evidence: { unauthorized_asset_use: true, authorization_boundary_correct: false }
  });
  const result = evaluateCrossIndustryFreeze(records);
  assert.equal(result.freeze_decision, 'failed');
  assert.equal(result.development_triggers.unauthorized_asset_use, true);
  assert.deepEqual(result.high_risk_projects, ['T03']);
});

test('pipeline and benchmark development triggers use strict greater-than thresholds', () => {
  const records = [...sixProjects(), project('T07', 'product_brand', 'A'), project('T08', 'platform_service', 'B')];
  records[0] = merge(records[0], { pipeline: { completed: false } });
  records[1] = merge(records[1], { pipeline: { completed: false } });
  records[2] = merge(records[2], { retrieval: { status: 'failed' } });
  records[3] = merge(records[3], { retrieval: { status: 'failed' } });
  let result = evaluateCrossIndustryFreeze(records);
  assert.equal(result.development_triggers.pipeline_reliability, true);
  assert.equal(result.development_triggers.benchmark_reliability, false, 'exactly 25% is not greater than 25%');

  records[4] = merge(records[4], { retrieval: { status: 'failed' } });
  result = evaluateCrossIndustryFreeze(records);
  assert.equal(result.development_triggers.benchmark_reliability, true);
});

test('Anchor smoke execution is capped without producing formal Anchor candidates', () => {
  const records = sixProjects();
  for (let index = 0; index < 4; index += 1) {
    records[index] = merge(records[index], {
      anchor: {
        smoke_test: { attempted: true, passed: true, direction_count: 1, explorations_per_direction: 1 }
      }
    });
  }
  const result = evaluateCrossIndustryFreeze(records);
  assert.equal(result.anchor_smoke_test.policy_compliant, false);
  assert.match(result.anchor_smoke_test.violations[0], /project_limit/u);
  assert.equal(result.criteria.anchor_smoke_policy_compliant, false);
});

test('frozen component manifests detect any baseline drift', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'cross-industry-manifest-'));
  await writeFile(path.join(temporary, 'frozen.js'), 'export const value = 1;\n', 'utf8');
  const baseline = await createFrozenComponentManifest(temporary, ['frozen.js']);
  await writeFile(path.join(temporary, 'frozen.js'), 'export const value = 2;\n', 'utf8');
  const current = await createFrozenComponentManifest(temporary, ['frozen.js']);
  const comparison = compareFrozenComponentManifests(baseline, current);
  assert.equal(comparison.frozen_components_intact, false);
  assert.deepEqual(comparison.changed.map((item) => item.path), ['frozen.js']);
});

test('artifact compiler emits the required baseline, project and summary records', () => {
  const evaluation = evaluateCrossIndustryFreeze(sixProjects(), {
    baselineCommit: 'abc123',
    frozenComponentManifest: { digest: 'digest', files: [] }
  });
  const artifacts = buildCrossIndustryFreezeArtifacts(evaluation);
  for (const required of [
    '00-baseline/git-commit.txt',
    '00-baseline/config.json',
    '00-baseline/frozen-components.md',
    'summary/cross-project-matrix.md',
    'summary/repeated-defects.md',
    'summary/model-variance.md',
    'summary/anchor-smoke-test.md',
    'summary/final-freeze-decision.md'
  ]) assert.equal(artifacts.has(required), true, required);
  assert.equal([...artifacts.keys()].filter((key) => key.endsWith('/test-record.md')).length, 6);
  assert.match(artifacts.get('summary/final-freeze-decision.md'), /最终决策：passed/u);
  assert.equal(JSON.parse(artifacts.get('00-baseline/config.json')).thresholds.minimum_projects, CROSS_INDUSTRY_FREEZE_THRESHOLDS.minimum_projects);
});
