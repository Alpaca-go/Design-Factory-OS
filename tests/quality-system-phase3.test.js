import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  adaptBrandContext,
  adaptReportQualityContext,
  adaptVisualDirectionQualityContext,
  stableSourceHash
} from '../adapters/quality-context/index.js';
import { createJsonShadowResultStore } from '../storage/quality-system/index.js';
import { createFixtureSemanticEvaluator, createShadowModeValidator } from '../validators/index.js';

const generatedAt = '2026-07-19T12:00:00.000Z';
const goldenFile = path.resolve(import.meta.dirname, 'fixtures/quality-system/golden/golden-fixtures.json');
const criticalRules = new Set(['AP-BRAND-002', 'AP-BRAND-003', 'AP-BRAND-004', 'AP-REP-003', 'AP-PKG-001', 'AP-PKG-002']);

test('source hash is stable across object key order and sensitive to source changes', () => {
  const left = { b: 2, a: { y: [1, 2], x: 'value' } };
  const right = { a: { x: 'value', y: [1, 2] }, b: 2 };
  assert.equal(stableSourceHash(left), stableSourceHash(right));
  assert.notEqual(stableSourceHash(left), stableSourceHash({ ...right, b: 3 }));
  assert.match(stableSourceHash(left), /^[a-f0-9]{64}$/);
});

test('Visual Direction Adapter reads a checkpoint without modifying input and marks unavailable fingerprint fields', () => {
  const source = {
    checkpoint: {
      version: 'visual-translation-checkpoint-v1',
      protocolVersion: 'visual-translation-v1',
      projectId: 'project-a',
      analysisRunId: 'run-a',
      stageId: '04-three-creative-directions'
    },
    output: {
      directions: [{
        directionId: 'D01', name: '安心轨迹', compositionLanguage: '对角推进',
        distinctiveMechanism: '节点验证后连接', materialLanguage: ['哑光', '半透明']
      }]
    }
  };
  const before = structuredClone(source);
  const context = adaptVisualDirectionQualityContext({ source, generatedAt });
  assert.deepEqual(source, before);
  assert.equal(context.module, 'visual_direction');
  assert.equal(context.metadata.project_id, 'project-a');
  assert.equal(context.metadata.run_id, 'run-a');
  assert.equal(context.source_context.source_type, 'visual_translation_checkpoint');
  assert.equal(context.output.directions[0].visual_fingerprint.composition, '对角推进');
  assert.equal(context.output.directions[0].visual_fingerprint_availability.silhouette.status, 'unknown');
  assert.equal(Object.hasOwn(context.output.directions[0].visual_fingerprint, 'silhouette'), false);
  assert.ok(Object.isFrozen(context));
});

test('Brand and Report Adapters preserve unknown fields and map report scope without inference', () => {
  const brandSource = { brandFacts: { brandName: '匿名品牌' } };
  const brand = adaptBrandContext(brandSource);
  assert.equal(brand.brand_name.value, '匿名品牌');
  assert.equal(brand.industry.status, 'unknown');
  assert.equal(brand.business_model.status, 'unknown');
  assert.equal(adaptBrandContext(undefined).brand_name.status, 'unavailable');

  const source = { reportMarkdown: '# 原报告', recommendation: { recommendedDirectionId: 'D01' } };
  const before = structuredClone(source);
  const context = adaptReportQualityContext({ source, brandSource, projectId: 'project-r', runId: 'run-r', generatedAt });
  assert.deepEqual(source, before);
  assert.equal(context.module, 'report');
  assert.deepEqual(context.output.sections, ['# 原报告']);
  assert.equal(context.output.field_availability.scores.status, 'unknown');
  assert.equal(Object.hasOwn(context.output, 'scores'), false);
  assert.equal(context.brand_context.industry.status, 'unknown');
});

test('Quality Context carries every required version and source metadata field', () => {
  const context = adaptReportQualityContext({
    source: { reportMarkdown: '# Report' }, projectId: 'project-v', runId: 'run-v', evaluatorVersion: 'fixture-evaluator-v1', generatedAt
  });
  assert.deepEqual(Object.keys(context), ['module', 'output', 'metadata', 'brand_context', 'source_context']);
  for (const field of ['quality_system_version', 'rule_set_version', 'adapter_version', 'evaluator_version', 'project_id', 'run_id', 'source_hash', 'generated_at']) {
    assert.equal(typeof context.metadata[field], 'string', field);
    assert.ok(context.metadata[field].length > 0, field);
  }
});

test('adapter context can run in shadow mode and missing semantic evaluator remains not_evaluated', async () => {
  const context = adaptVisualDirectionQualityContext({
    source: { directions: { directions: [{ directionId: 'D01', name: '方向' }] } },
    projectId: 'project-s', runId: 'run-s', generatedAt
  });
  const result = await createShadowModeValidator().validate(context);
  const semantic = result.anti_patterns.find((finding) => finding.anti_pattern_id === 'AP-DIR-005');
  assert.equal(semantic.detected, false);
  assert.equal(semantic.evaluated, false);
  assert.equal(semantic.evaluation_mode, 'not_evaluated');
});

test('JSON shadow store saves and locates independent project/run/module records without source output', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mqs-shadow-store-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const store = createJsonShadowResultStore({ rootDir, clock: () => '2026-07-19T13:00:00.000Z' });
  const validator = createShadowModeValidator();
  const sourceA = { reportMarkdown: '# Original confidential report A' };
  const contextA = adaptReportQualityContext({ source: sourceA, projectId: 'project-a', runId: 'run-1', generatedAt });
  const resultA = await validator.validate(contextA);
  await store.save({ context: contextA, validationResult: resultA });
  const contextB = adaptReportQualityContext({ source: { reportMarkdown: '# Report B' }, projectId: 'project-b', runId: 'run-2', generatedAt });
  await store.save({ context: contextB, validationResult: await validator.validate(contextB) });

  const loadedA = await store.load({ projectId: 'project-a', runId: 'run-1', module: 'report' });
  assert.equal(loadedA.locator.project_id, 'project-a');
  assert.equal(loadedA.provenance.source_hash, contextA.metadata.source_hash);
  assert.equal(loadedA.provenance.adapter_version, contextA.metadata.adapter_version);
  assert.equal(loadedA.validation_result.mode, 'shadow');
  assert.equal(JSON.stringify(loadedA).includes('Original confidential report A'), false);
  assert.equal((await store.list()).length, 2);
  assert.equal((await store.list({ projectId: 'project-b' })).length, 1);
});

test('Human Review can append true positive and false negative records, then update in place', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mqs-human-review-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const store = createJsonShadowResultStore({ rootDir, clock: () => '2026-07-19T14:00:00.000Z' });
  const context = adaptReportQualityContext({
    source: {
      recommendation: {
        recommendedDirectionId: 'D01',
        comparison: [{ directionId: 'D01', rank: 1, comparisonScore: 0 }, { directionId: 'D02', rank: 2, comparisonScore: 0 }]
      }
    },
    projectId: 'project-review', runId: 'run-review', generatedAt
  });
  await store.save({ context, validationResult: await createShadowModeValidator().validate(context) });
  const locator = { projectId: 'project-review', runId: 'run-review', module: 'report' };
  await store.upsertReview(locator, {
    anti_pattern_id: 'AP-REP-003', system_detected: true, human_judgement: 'true_positive', notes: '确认评分冲突', reviewer_type: 'qa'
  });
  await store.upsertReview(locator, {
    anti_pattern_id: 'AP-GEN-005', system_detected: false, human_judgement: 'false_negative', notes: '人工发现 Suggested Assets 失控', reviewer_type: 'qa'
  });
  const updated = await store.upsertReview(locator, {
    anti_pattern_id: 'AP-REP-003', system_detected: true, human_judgement: 'uncertain', notes: '等待第二位复核者', reviewer_type: 'qa'
  });
  assert.equal(updated.human_reviews.length, 2);
  assert.equal(updated.human_reviews.find((review) => review.anti_pattern_id === 'AP-REP-003').human_judgement, 'uncertain');
  assert.equal(updated.human_reviews.find((review) => review.anti_pattern_id === 'AP-GEN-005').human_judgement, 'false_negative');
});

test('expanded Golden Fixtures replay with expected system findings and meet accuracy gates', async () => {
  const dataset = JSON.parse(await fs.readFile(goldenFile, 'utf8'));
  assert.ok(dataset.fixtures.length >= 30);
  let criticalExpected = 0;
  let criticalDetected = 0;
  let deterministicTruePositive = 0;
  let deterministicFalsePositive = 0;
  let falseNegative = 0;

  for (const sample of dataset.fixtures) {
    const evaluator = createFixtureSemanticEvaluator(sample.semantic_results);
    const options = {
      source: sample.source,
      brandSource: sample.brand_source || sample.source,
      projectId: sample.project_id,
      runId: sample.run_id,
      evaluatorVersion: evaluator.version,
      generatedAt
    };
    const context = sample.adapter === 'report'
      ? adaptReportQualityContext(options)
      : adaptVisualDirectionQualityContext(options);
    const result = await createShadowModeValidator({ evaluator }).validate(context);
    const findings = result.anti_patterns.filter((finding) => finding.detected && !finding.exception_applied);
    const detectedRules = findings.map((finding) => finding.anti_pattern_id);
    assert.deepEqual(detectedRules, sample.expected_system_rules, sample.id);
    assert.equal(result.status, sample.expected_status, sample.id);
    assert.ok(Array.isArray(sample.allowed_semantic_skips), sample.id);
    assert.ok(typeof sample.human_notes === 'string' && sample.human_notes, sample.id);

    for (const ruleId of sample.human_expected_rules.filter((id) => criticalRules.has(id))) {
      criticalExpected += 1;
      if (detectedRules.includes(ruleId)) criticalDetected += 1;
    }
    for (const finding of findings.filter((item) => item.evaluation_mode === 'deterministic')) {
      if (sample.human_expected_rules.includes(finding.anti_pattern_id)) deterministicTruePositive += 1;
      else deterministicFalsePositive += 1;
    }
    falseNegative += sample.human_expected_rules.filter((ruleId) => !detectedRules.includes(ruleId) && !sample.allowed_semantic_skips.includes(ruleId)).length;
  }

  const criticalRecall = criticalExpected ? criticalDetected / criticalExpected : 1;
  const deterministicPrecision = deterministicTruePositive / (deterministicTruePositive + deterministicFalsePositive);
  assert.equal(criticalRecall, 1);
  assert.ok(deterministicPrecision >= 0.95);
  assert.equal(deterministicPrecision, 1);
  assert.equal(falseNegative, 0);
});
