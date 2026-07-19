import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { adaptVisualDirectionQualityContext, adaptReportQualityContext } from '../adapters/quality-context/index.js';
import { buildAccuracyReport } from '../metrics/quality-system/index.js';
import { ORCHESTRATOR_VERSION, runOfflineShadowBatch, selectQualityAdapter } from '../orchestrators/quality-system/index.js';
import { exportHumanReviews, importHumanReviews } from '../reviews/quality-system/index.js';
import { createJsonShadowResultStore } from '../storage/quality-system/index.js';
import { createFixtureSemanticEvaluator, createShadowModeValidator } from '../validators/index.js';

const now = '2026-07-19T12:00:00.000Z';
const later = '2026-07-19T12:00:01.000Z';
const goldenFile = path.resolve(import.meta.dirname, 'fixtures/quality-system/golden/golden-fixtures.json');

test('offline orchestrator runs one project, selects adapters, and preserves source input', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mqs-4a-single-'));
  const sourceRoot = path.join(root, 'inputs');
  const store = createJsonShadowResultStore({ rootDir: path.join(root, 'shadow'), clock: () => now });
  const source = directionCheckpoint('project-one', 'run-one');
  const file = path.join(sourceRoot, 'project-one', 'run-one', '04-three-creative-directions.json');
  await writeFixture(file, source);
  const before = await fs.readFile(file, 'utf8');

  const result = await runOfflineShadowBatch({ roots: sourceRoot, store, clock: sequenceClock() });
  assert.deepEqual(result.statistics, { discovered: 1, recognized: 1, succeeded: 1, skipped: 0, planned: 0, failed: 0, unrecognized: 0 });
  assert.equal(await fs.readFile(file, 'utf8'), before);
  const record = await store.load({ projectId: 'project-one', runId: 'run-one', module: 'visual_direction' });
  assert.equal(record.provenance.orchestrator_version, ORCHESTRATOR_VERSION);
  assert.equal(record.provenance.command_mode, 'default');
  assert.equal(record.provenance.batch_id, result.batch_id);
  assert.equal(record.provenance.source_path, file);
});

test('recursive multi-project runs isolate failures and choose Report checkpoint correctly', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mqs-4a-multi-'));
  const sourceRoot = path.join(root, 'inputs');
  const store = createJsonShadowResultStore({ rootDir: path.join(root, 'shadow') });
  await writeFixture(path.join(sourceRoot, 'project-a', 'run-a', 'direction.json'), directionCheckpoint('project-a', 'run-a'));
  await writeFixture(path.join(sourceRoot, 'project-b', 'run-b', 'report.json'), reportCheckpoint('project-b', 'run-b'));
  await writeFixture(path.join(sourceRoot, 'project-c', 'run-c', 'other.json'), { arbitrary: true });
  await fs.mkdir(path.join(sourceRoot, 'project-d', 'run-d'), { recursive: true });
  await fs.writeFile(path.join(sourceRoot, 'project-d', 'run-d', 'broken.json'), '{invalid', 'utf8');

  const result = await runOfflineShadowBatch({ roots: [sourceRoot], store });
  assert.equal(result.statistics.discovered, 4);
  assert.equal(result.statistics.succeeded, 2);
  assert.equal(result.statistics.failed, 1);
  assert.equal(result.statistics.unrecognized, 1);
  assert.ok(await store.load({ projectId: 'project-a', runId: 'run-a', module: 'visual_direction' }));
  assert.ok(await store.load({ projectId: 'project-b', runId: 'run-b', module: 'report' }));
});

test('unchanged source skips, --force reruns, and --dry-run never writes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mqs-4a-modes-'));
  const file = path.join(root, 'inputs', 'project-a', 'run-a', 'direction.json');
  await writeFixture(file, directionCheckpoint('project-a', 'run-a'));
  const store = createJsonShadowResultStore({ rootDir: path.join(root, 'shadow') });
  await runOfflineShadowBatch({ roots: path.join(root, 'inputs'), store });
  const skipped = await runOfflineShadowBatch({ roots: path.join(root, 'inputs'), store });
  assert.equal(skipped.statistics.skipped, 1);
  const forced = await runOfflineShadowBatch({ roots: path.join(root, 'inputs'), store, force: true });
  assert.equal(forced.statistics.succeeded, 1);
  const forcedRecord = await store.load({ projectId: 'project-a', runId: 'run-a', module: 'visual_direction' });
  assert.equal(forcedRecord.provenance.command_mode, 'force');

  const dryStore = createJsonShadowResultStore({ rootDir: path.join(root, 'dry-shadow') });
  const dry = await runOfflineShadowBatch({ roots: path.join(root, 'inputs'), store: dryStore, dryRun: true });
  assert.equal(dry.statistics.planned, 1);
  assert.deepEqual(await dryStore.list(), []);
});

test('adapter selection recognizes Visual Translation, Visual Direction, and Report shapes', () => {
  assert.equal(selectQualityAdapter({ result: { directions: { directions: [] } } }, 'visual-translation-result.json').module, 'visual_direction');
  assert.equal(selectQualityAdapter(directionCheckpoint('p', 'r'), 'checkpoint.json').module, 'visual_direction');
  assert.equal(selectQualityAdapter(reportCheckpoint('p', 'r'), 'checkpoint.json').module, 'report');
  assert.equal(selectQualityAdapter({ anything: true }, 'unknown.json'), null);
});

test('Human Review export is complete and import is idempotent with per-row isolation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mqs-4a-review-'));
  const store = createJsonShadowResultStore({ rootDir: root, clock: () => now });
  const context = adaptVisualDirectionQualityContext({
    source: { evidenceMap: { suggestedAssets: [{ assetId: 'SA1', name: 'new', executable: true }] } },
    projectId: 'review-project', runId: 'review-run', generatedAt: now
  });
  await store.save({ context, validationResult: await createShadowModeValidator().validate(context) });
  const rows = [{
    project_id: 'review-project', run_id: 'review-run', module: 'visual_direction', anti_pattern_id: 'AP-GEN-005',
    system_detected: true, human_judgement: 'true_positive', notes: 'confirmed', reviewed_at: now, reviewer_type: 'qa'
  }, {
    project_id: 'review-project', run_id: 'review-run', module: 'visual_direction', anti_pattern_id: 'AP-DIR-005',
    system_detected: true, human_judgement: 'true_positive', notes: 'conflicts with actual output', reviewed_at: now, reviewer_type: 'qa'
  }, {
    project_id: '', run_id: 'review-run', module: 'visual_direction', anti_pattern_id: 'bad',
    system_detected: false, human_judgement: 'false_negative', notes: '', reviewed_at: now, reviewer_type: 'qa'
  }];
  const first = await importHumanReviews({ store, input: JSON.stringify({ reviews: rows }) });
  assert.deepEqual({ imported: first.imported, failed: first.failed }, { imported: 1, failed: 2 });
  const second = await importHumanReviews({ store, input: JSON.stringify({ reviews: [rows[0]] }) });
  assert.equal(second.skipped, 1);
  const record = await store.load({ projectId: 'review-project', runId: 'review-run', module: 'visual_direction' });
  assert.equal(record.human_reviews.length, 1);

  const exported = await exportHumanReviews({ store, format: 'jsonl' });
  assert.equal(exported.count, record.validation_result.anti_patterns.length);
  const reviewed = exported.rows.find((row) => row.anti_pattern_id === 'AP-GEN-005');
  assert.equal(reviewed.human_judgement, 'true_positive');
  assert.ok(reviewed.evidence.length > 0);
  assert.ok(reviewed.repair.length > 0);
});

test('Accuracy Report calculates confusion metrics, groupings, versions, and stability warning', () => {
  const base = {
    module: 'visual_direction',
    expected_rules: ['AP-A-001', 'AP-C-001'],
    versions: { quality_system_version: 'q1', rule_set_version: 'r1', adapter_version: 'a1', evaluator_version: 'e1', orchestrator_version: 'o1' },
    validation_result: { anti_patterns: [
      finding('AP-A-001', true, 'S4'),
      finding('AP-B-001', true, 'S2'),
      finding('AP-C-001', false, 'S3'),
      finding('AP-D-001', false, 'S1'),
      { ...finding('AP-E-001', false, 'S3'), rule_type: 'semantic', evaluated: false }
    ] }
  };
  const report = buildAccuracyReport({ goldenEvaluations: [{ ...base, sample_id: 'sample-1' }], minimumSamples: 1 });
  assert.deepEqual({ tp: report.true_positive, fp: report.false_positive, fn: report.false_negative, tn: report.true_negative }, { tp: 1, fp: 1, fn: 1, tn: 1 });
  assert.equal(report.precision, 0.5);
  assert.equal(report.recall, 0.5);
  assert.equal(report.false_positive_rate, 0.5);
  assert.equal(report.semantic_hybrid_not_evaluated, 1);
  assert.equal(report.by_rule['AP-A-001'].true_positive, 1);
  assert.equal(report.by_module.visual_direction.evaluated, 4);
  assert.equal(report.by_severity.S4.true_positive, 1);
  assert.deepEqual(report.version_distribution.rule_set_version, { r1: 1 });
  assert.equal(report.statistical_stability, 'provisional');

  const unstable = buildAccuracyReport({ goldenEvaluations: [{ ...base, sample_id: 'sample-1' }] });
  assert.equal(unstable.statistical_stability, 'unstable');
  assert.ok(unstable.warnings.length > 0);
});

test('AP-GEN-005 detects every deterministic loss-of-control subtype with evidence and repair', async (t) => {
  const cases = [
    ['missing status', { suggested_assets: [{ assetId: 'A', executable: false }] }],
    ['proposed executable', { suggested_assets: [{ assetId: 'A', status: 'proposed', executable: true, evidence_ids: ['E'] }] }],
    ['restricted executable reference', { suggested_assets: [{ assetId: 'A', status: 'restricted' }], directions: [{ id: 'D', executable_asset_ids: ['A'] }] }],
    ['unrelated new asset', { suggested_assets: [{ assetId: 'A', status: 'derived' }] }],
    ['abnormal count', { suggested_assets: Array.from({ length: 13 }, (_, index) => ({ assetId: `A${index}`, status: 'existing' })) }],
    ['future identity reference', { suggested_assets: [{ assetId: 'A', status: 'derived', execution_scope: 'future_identity_design', evidence_ids: ['E'] }], directions: [{ id: 'D', executable_asset_ids: ['A'] }] }]
  ];
  for (const [name, output] of cases) {
    await t.test(name, async () => {
      const before = structuredClone(output);
      const result = await createShadowModeValidator().validate({ module: 'visual_direction', output });
      assert.deepEqual(output, before);
      const finding = result.anti_patterns.find((item) => item.anti_pattern_id === 'AP-GEN-005');
      assert.equal(finding.detected, true);
      assert.equal(finding.rule_type, 'hybrid');
      assert.ok(finding.evidence.length > 0);
      assert.ok(finding.repair.length > 0);
    });
  }
});

test('Golden Dataset contains 30 unique fixtures and reaches the deterministic accuracy gates', async () => {
  const dataset = JSON.parse(await fs.readFile(goldenFile, 'utf8'));
  assert.ok(dataset.fixtures.length >= 30);
  assert.equal(new Set(dataset.fixtures.map((fixture) => fixture.id)).size, dataset.fixtures.length);
  const evaluations = [];
  for (const sample of dataset.fixtures) {
    const evaluator = createFixtureSemanticEvaluator(sample.semantic_results);
    const adapt = sample.adapter === 'report' ? adaptReportQualityContext : adaptVisualDirectionQualityContext;
    const context = adapt({ source: sample.source, brandSource: sample.brand_source || sample.source, projectId: sample.project_id, runId: sample.run_id, evaluatorVersion: evaluator.version, generatedAt: now });
    const validationResult = await createShadowModeValidator({ evaluator }).validate(context);
    evaluations.push({ sample_id: sample.id, module: context.module, expected_rules: sample.human_expected_rules, validation_result: validationResult, versions: context.metadata });
  }
  const report = buildAccuracyReport({ goldenEvaluations: evaluations });
  assert.equal(report.precision, 1);
  assert.equal(report.recall, 1);
  assert.equal(report.statistical_stability, 'provisional');
  for (const ruleId of ['AP-BRAND-002', 'AP-BRAND-003', 'AP-BRAND-004', 'AP-REP-003']) assert.equal(report.by_rule[ruleId].recall, 1);
});

function directionCheckpoint(projectId, runId) {
  return {
    checkpoint: { version: 'v1', protocolVersion: 'visual-translation-v1', projectId, analysisRunId: runId, stageId: '04-three-creative-directions' },
    output: { directions: [{ directionId: 'D01', name: '方向一' }] }
  };
}

function reportCheckpoint(projectId, runId) {
  return {
    checkpoint: { version: 'v1', protocolVersion: 'visual-translation-v1', projectId, analysisRunId: runId, stageId: '10-local-report-compiler' },
    output: '# 匿名报告'
  };
}

async function writeFixture(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sequenceClock() {
  const values = [now, later, later];
  return () => values.shift() || later;
}

function finding(id, detected, severity) {
  return { anti_pattern_id: id, detected, exception_applied: false, severity, rule_type: 'deterministic', evaluated: true };
}
