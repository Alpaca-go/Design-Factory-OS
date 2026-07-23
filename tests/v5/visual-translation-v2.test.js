// Execution-oriented Visual Direction v2 — test suite (doc section 十/十三).
//
// Covers: Direction Contract v2 schema, Anchor Contract v2 schema, Execution
// Readiness Evaluator, Anti-concept-art constraint check, Asset Authorization
// regression, Evidence preservation regression, and the A/B runner integration
// over the three project fixtures. Fully offline and deterministic.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as v2 from '../../src/v5/visual-translation/v2/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'fixtures', 'visual-direction-v2');
const SNAP = join(HERE, '..', 'snapshots', 'visual-direction-v2');
const PROJECTS = ['jiuzhou-meixue', 'mingjitang', 'vanke-suwan'];

function load(project, file) {
  return JSON.parse(readFileSync(join(FIX, project, file), 'utf8'));
}

function projectContext(project) {
  const ei = load(project, 'evidence-index.json');
  const ab = load(project, 'asset-boundary.json');
  return {
    evidenceIndex: ei,
    assetBoundary: ab,
    audienceBoundary: load(project, 'audience-boundary.json'),
    selectedTouchpoints: load(project, 'selected-touchpoints.json'),
    brandFacts: { reportLanguage: 'zh-CN' },
    evidenceIds: new Set(ei.map((e) => e.evidence_id)),
    allowedAssetIds: new Set(ab.allowed_assets.map((a) => a.asset_id)),
    restrictedAssetIds: new Set(ab.restricted_assets.map((a) => a.asset_id))
  };
}

function projectConfig(project, humanPreference = 'v2') {
  const ctx = projectContext(project);
  return {
    projectId: project,
    brandFacts: ctx.brandFacts,
    evidenceIndex: ctx.evidenceIndex,
    assetBoundary: ctx.assetBoundary,
    audienceBoundary: ctx.audienceBoundary,
    selectedTouchpoints: ctx.selectedTouchpoints,
    v1Directions: load(project, 'v1-directions.json'),
    v2Directions: load(project, 'v2-directions.json'),
    humanPreference
  };
}

// ---- Direction Contract v2 schema ----
test('Direction v2 schema validates every fixture direction and enforces required coverage', () => {
  for (const project of PROJECTS) {
    const dirs = load(project, 'v2-directions.json');
    const ctx = projectContext(project);
    assert.equal(dirs.length, 3);
    for (const raw of dirs) {
      const d = v2.validateExecutionDirectionV2(raw, ctx);
      assert.equal(d.contract_version, v2.VISUAL_DIRECTION_V2_CONTRACT_VERSION);
      const types = new Set(d.core_reusable_assets.map((a) => a.asset_type));
      for (const t of v2.REQUIRED_REUSABLE_ASSET_TYPES) {
        assert.ok(types.has(t), `${project} ${d.direction_id} missing required asset type ${t}`);
      }
      assert.equal(d.core_reusable_assets.length, 4);
      assert.equal(d.anti_concept_art_constraints.length, 9);
      const cats = new Set(d.execution_examples.map((e) => e.touchpoint_category));
      for (const c of ['core_brand', 'capability_product', 'digital_event']) {
        assert.ok(cats.has(c), `${project} ${d.direction_id} missing example category ${c}`);
      }
      assert.ok(d.composition_templates.length >= 2);
    }
  }
});

test('Direction v2 schema rejects a direction missing a required asset type', () => {
  const ctx = projectContext('jiuzhou-meixue');
  const raw = structuredClone(load('jiuzhou-meixue', 'v2-directions.json')[0]);
  raw.core_reusable_assets = raw.core_reusable_assets.filter((a) => a.asset_type !== 'layout_asset');
  assert.throws(() => v2.validateExecutionDirectionV2(raw, ctx), (e) => e.code === 'FAILED_SCHEMA');
});

test('direction-specific deliverable touchpoints remain executable and Anchor-compatible', () => {
  const ctx = projectContext('jiuzhou-meixue');
  const raw = structuredClone(load('jiuzhou-meixue', 'v2-directions.json')[1]);
  raw.composition_templates[0].touchpoint = 'quality_selection_board';
  raw.composition_templates[1].touchpoint = 'product_selection_catalog';
  const direction = v2.validateExecutionDirectionV2(raw, ctx);
  const antiConcept = v2.checkAntiConceptArtConstraints(direction);
  assert.ok(!antiConcept.violations.includes('must_convert_to_flat_design'));
  assert.ok(!antiConcept.violations.includes('must_generate_poster_booklet_packaging_page_template'));

  const anchor = buildAnchor('jiuzhou-meixue', raw.core_reusable_assets[0].asset_id);
  anchor.anchor_image_brief.expected_touchpoint = 'quality_selection_board';
  assert.equal(v2.validateAnchorCandidateV2(anchor, { assetIds: new Set(raw.core_reusable_assets.map((asset) => asset.asset_id)) })
    .anchor_image_brief.expected_touchpoint, 'quality_selection_board');
});

test('Direction v2 schema rejects unknown Evidence references', () => {
  const ctx = projectContext('jiuzhou-meixue');
  const raw = structuredClone(load('jiuzhou-meixue', 'v2-directions.json')[0]);
  raw.evidence_ids = ['VE-UNKNOWN'];
  assert.throws(() => v2.validateExecutionDirectionV2(raw, ctx), (e) => e.code === 'FAILED_SCHEMA');
});

test('Direction v2 schema rejects restricted asset references (asset authorization regression)', () => {
  const ctx = projectContext('jiuzhou-meixue');
  const raw = structuredClone(load('jiuzhou-meixue', 'v2-directions.json')[0]);
  raw.asset_references = ['AS-JZ-PARENT'];
  assert.throws(() => v2.validateExecutionDirectionV2(raw, ctx), (e) => e.code === 'FAILED_SCHEMA');
});

test('Direction v2 strategic_idea is bounded to 80 Chinese characters and not a slogan', () => {
  const ctx = projectContext('jiuzhou-meixue');
  const raw = structuredClone(load('jiuzhou-meixue', 'v2-directions.json')[0]);
  raw.strategic_idea = '短口号';
  assert.throws(() => v2.validateExecutionDirectionV2(raw, ctx), (e) => e.code === 'FAILED_SCHEMA');
});

// ---- Anchor Contract v2 schema ----
function buildAnchor(project, graphicAssetId, valid = true) {
  const assets = load(project, 'v2-directions.json')[0].core_reusable_assets;
  return {
    anchor_id: 'AC01',
    anchor_name: '执行母版',
    execution_thesis: '以真实行业对象与节点图形生成招商主视觉',
    core_asset_combination: {
      graphic_asset_id: valid ? graphicAssetId : 'A999',
      industry_or_photo_object: '冷链运输箱实景',
      information_module: '资质数据卡',
      layout_mechanism: '左图右信息栅格'
    },
    primary_layout_template: {
      subject_position: '左 45% 实景',
      information_position: '右 35% 信息',
      brand_position: '左上',
      whitespace_ratio: 0.2,
      supporting_asset_position: '右下',
      landscape_adaptation: '上图下文',
      portrait_adaptation: '左图右信息'
    },
    industry_object_rule: '以真实冷链箱与仓储为主体',
    photography_graphic_mix: '实景 40% + 节点图形 35%',
    information_hierarchy: ['品牌', '能力', '数据', 'CTA'],
    composition_behavior: '栅格叠加',
    reusable_components: ['节点图形', '数据卡'],
    execution_examples: ['招商海报', '能力手册页'],
    anchor_image_brief: {
      image_purpose: '招商主视觉',
      subject: '冷链运输箱',
      industry_object: 'GSP 仓储',
      graphic_overlay: '节点图形角落',
      info_whitespace: '右侧留白放信息',
      composition_visual_hierarchy: '实景主导+图形点缀',
      prohibited_content: '建筑/展馆主体',
      expected_touchpoint: 'poster'
    },
    prohibited_drift: ['不得退化为地产大片'],
    difference_from_other_candidates: '更强调真实冷链资产',
    execution_readiness: null
  };
}

test('Anchor v2 schema validates a candidate that references a real core asset', () => {
  const project = 'jiuzhou-meixue';
  const assetId = load(project, 'v2-directions.json')[0].core_reusable_assets[0].asset_id;
  const assetIds = new Set(load(project, 'v2-directions.json')[0].core_reusable_assets.map((a) => a.asset_id));
  const anchor = v2.validateAnchorCandidateV2(buildAnchor(project, assetId), { assetIds });
  assert.equal(anchor.contract_version, v2.ANCHOR_V2_CONTRACT_VERSION);
  assert.equal(anchor.anchor_image_brief.expected_touchpoint, 'poster');
});

test('Anchor v2 schema rejects a candidate referencing an unknown core asset', () => {
  const project = 'jiuzhou-meixue';
  const assetIds = new Set(load(project, 'v2-directions.json')[0].core_reusable_assets.map((a) => a.asset_id));
  assert.throws(() => v2.validateAnchorCandidateV2(buildAnchor(project, 'A999', false), { assetIds }), (e) => e.code === 'FAILED_SCHEMA');
});

// ---- Execution Readiness Evaluator ----
test('Execution Readiness Evaluator marks a valid v2 direction ready and a real-estate-drift direction rewrite_required', () => {
  const ctx = projectContext('jiuzhou-meixue');
  const validated = v2.validateExecutionDirectionV2(load('jiuzhou-meixue', 'v2-directions.json')[0], ctx);
  const ready = v2.evaluateExecutionReadiness(validated);
  assert.equal(ready.execution_status, 'ready');
  assert.ok(ready.metrics.industry_recognition_strength >= 4);
  assert.ok(ready.metrics.directly_executable_degree >= 4);
  assert.ok(ready.metrics.flat_design_conversion_ability >= 4);
  assert.ok(ready.metrics.brand_exclusivity >= 4);
  assert.ok(ready.metrics.concept_art_risk <= 2);
  assert.ok(ready.metrics.real_estate_drift_risk <= 2);

  const bad = structuredClone(validated);
  bad.layout_behavior.subject_area = '以建筑作为视觉主体，远景宏大空间装置';
  const rewrite = v2.evaluateExecutionReadiness(bad);
  assert.equal(rewrite.execution_status, 'rewrite_required');
  assert.ok(rewrite.concept_art_violations.includes('no_architecture_pavilion_sculpture_realestate_as_subject'));
  assert.ok(rewrite.failed_criteria.length > 0);
});

// ---- Anti-concept-art constraint check ----
test('Anti-concept-art checker returns no violations for a clean v2 direction', () => {
  const ctx = projectContext('jiuzhou-meixue');
  const validated = v2.validateExecutionDirectionV2(load('jiuzhou-meixue', 'v2-directions.json')[0], ctx);
  const { violations } = v2.checkAntiConceptArtConstraints(validated);
  assert.deepEqual(violations, []);
});

// ---- Asset Authorization regression ----
test('Asset Authorization guard passes on fixtures and fails on a restricted reference', () => {
  const ctx = projectContext('jiuzhou-meixue');
  const ab = ctx.assetBoundary;
  for (const raw of load('jiuzhou-meixue', 'v2-directions.json')) {
    const validated = v2.validateExecutionDirectionV2(raw, ctx);
    assert.ok(v2.guardAssetAuthorization(validated, ab).ok, `${validated.direction_id} asset guard`);
  }
  const validated = v2.validateExecutionDirectionV2(load('jiuzhou-meixue', 'v2-directions.json')[0], ctx);
  const broken = structuredClone(validated);
  broken.asset_references = ['AS-JZ-PARENT'];
  assert.equal(v2.guardAssetAuthorization(broken, ab).ok, false);
});

// ---- Evidence preservation regression ----
test('Evidence Preservation guard passes on fixtures and fails on an unknown reference', () => {
  const ctx = projectContext('jiuzhou-meixue');
  const ei = ctx.evidenceIndex;
  for (const raw of load('jiuzhou-meixue', 'v2-directions.json')) {
    const validated = v2.validateExecutionDirectionV2(raw, ctx);
    const g = v2.guardEvidencePreservation(validated, ei);
    assert.ok(g.ok, `${validated.direction_id} evidence guard`);
    assert.equal(g.preservedEvidenceCount, ei.length);
  }
  const validated = v2.validateExecutionDirectionV2(load('jiuzhou-meixue', 'v2-directions.json')[0], ctx);
  const broken = structuredClone(validated);
  broken.evidence_ids = ['VE-UNKNOWN'];
  assert.equal(v2.guardEvidencePreservation(broken, ei).ok, false);
});

// ---- A/B runner integration ----
test('A/B comparison per project matches the stored snapshot and shows v2 improvement', () => {
  for (const project of PROJECTS) {
    const cfg = projectConfig(project);
    const cmp = v2.runABComparison(cfg);
    const snap = JSON.parse(readFileSync(join(SNAP, `${project}-ab.json`), 'utf8'));
    assert.deepEqual(cmp, snap);
    assert.equal(cmp.project_verdict, 'pass');
    assert.ok(cmp.measurable_criteria.industry_recognition_improved);
    assert.ok(cmp.measurable_criteria.executability_improved);
    assert.ok(cmp.measurable_criteria.at_least_3_assets);
    assert.ok(cmp.measurable_criteria.poster_packaging_page_imaginable);
    assert.ok(cmp.measurable_criteria.evidence_asset_intact);
    assert.ok(cmp.v2_average_metrics.industry_recognition_strength > cmp.v1_average_metrics.industry_recognition_strength);
    assert.ok(cmp.v2_average_metrics.concept_art_risk <= cmp.v1_average_metrics.concept_art_risk);
  }
});

test('A/B runner recommends merge when >= 2 projects meet criteria', () => {
  const configs = PROJECTS.map((p) => projectConfig(p));
  const summary = v2.runABRunner(configs);
  assert.equal(summary.project_count, 3);
  assert.equal(summary.projects_meeting_criteria, 3);
  assert.equal(summary.merge_recommendation, 'candidate_for_merge');
  assert.ok(summary.evidence_asset_intact_all);
  const stored = JSON.parse(readFileSync(join(SNAP, 'ab-runner-summary.json'), 'utf8'));
  assert.deepEqual(summary, stored);
});

test('direction_generation_mode uses execution_oriented_v2 as the formal default and keeps conceptual_v1 internal', () => {
  assert.equal(v2.PRODUCTION_BASELINE_MODE, 'execution_oriented_v2');
  assert.equal(v2.EXPERIMENT_MODE, 'execution_oriented_v2');
  assert.equal(v2.isExecutionMode('conceptual_v1'), false);
  assert.equal(v2.isExecutionMode('execution_oriented_v2'), true);
  assert.throws(() => v2.normalizeDirectionGenerationMode('bogus'), (e) => e.code === 'UNKNOWN_DIRECTION_GENERATION_MODE');
});
