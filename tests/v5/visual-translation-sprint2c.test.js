import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  SPRINT_2_SEMANTIC_RULE_IDS,
  appendSprint2Report,
  applyAnchorConfirmationReview,
  buildSprint2QualitySummary,
  createFixtureSprint2SemanticEvaluator,
  createFixtureVisualLanguageProviderAdapter,
  createSprint2RuntimeCheckpointStore,
  evaluateAnchorCandidateDifferenceMatrix,
  runSprint2QualityCli,
  runVisualLanguageConstruction
} from '../../src/v5/visual-translation/v1/index.js';
import { evaluateSprint2GoldenDataset } from '../../metrics/sprint-2-quality-accuracy.js';
import { SPRINT_2_GOLDEN_DATASET } from '../../examples/visual-translation/sprint-2-quality/golden-dataset-v1.js';
import { SPRINT_2_REAL_PROJECT_IMPORT_FIXTURES } from '../../examples/visual-translation/sprint-2-quality/real-project-import-fixtures-v1.js';
import { sprint2InputFixture, sprint2LanguageSystemFixture } from './helpers/visual-translation-sprint2a-fixture.js';

test('Sprint 2 Golden Dataset contains at least 30 distinct, contract-complete Fixtures', () => {
  assert.ok(SPRINT_2_GOLDEN_DATASET.length >= 30);
  assert.equal(new Set(SPRINT_2_GOLDEN_DATASET.map((fixture) => fixture.fixture_id)).size, SPRINT_2_GOLDEN_DATASET.length);
  for (const fixture of SPRINT_2_GOLDEN_DATASET) {
    assert.ok(fixture.input && fixture.human_notes);
    assert.ok(Array.isArray(fixture.expected_anti_patterns));
    assert.ok(Array.isArray(fixture.expected_repair_actions));
    assert.equal(typeof fixture.semantic_evaluator_skip_allowed, 'boolean');
  }
});

test('real-project Fixture Import Contract covers six required desensitized project types', () => {
  assert.deepEqual(new Set(SPRINT_2_REAL_PROJECT_IMPORT_FIXTURES.map((fixture) => fixture.project_type)), new Set([
    'b2b', 'consumer_goods', 'cultural_brand', 'packaging', 'ip', 'technology_service'
  ]));
  assert.ok(SPRINT_2_REAL_PROJECT_IMPORT_FIXTURES.every((fixture) => fixture.source_kind === 'desensitized_fixture'));
});

test('Anchor Candidate Difference Matrix calculates six dimensions and the 7/12 threshold', async () => {
  const candidates = anchorCandidates().slice(0, 2);
  const evaluator = createFixtureSprint2SemanticEvaluator({}, { differenceResults: { default: differenceResult([2, 1, 1, 1, 1, 1]) } });
  const matrix = await evaluateAnchorCandidateDifferenceMatrix({ candidates, evaluator, context: sprint2InputFixture() });
  assert.equal(matrix.pairs[0].total_score, 7);
  assert.equal(matrix.pairs[0].status, 'pass');
  assert.equal(Object.keys(matrix.pairs[0].dimension_scores).length, 6);
  assert.equal(matrix.status, 'pass');
});

test('homogeneous Anchor Candidates trigger only targeted Candidate reconstruction', async () => {
  let reconstructed = false;
  const candidates = anchorCandidates();
  const replacement = structuredClone(candidates[1]);
  replacement.name = '重构后的分布式验证节奏';
  replacement.core_visual_proposition = '多个独立验证单元以差异化节奏聚合，并在跨媒介中保持阶段可读。';
  const provider = providerFixture({
    candidates,
    reconstructAnchorCandidate() {
      reconstructed = true;
      return replacement;
    }
  });
  const evaluator = createFixtureSprint2SemanticEvaluator({}, {
    differenceResults: {
      default(request) {
        const targetPair = request.candidate_ids.includes('ANCHOR-01') && request.candidate_ids.includes('ANCHOR-02');
        return differenceResult(targetPair && !reconstructed ? [1, 1, 1, 1, 1, 1] : [2, 2, 1, 1, 1, 1]);
      }
    }
  });
  const result = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: provider, evaluator });
  assert.equal(result.status, 'awaiting_anchor_confirmation');
  assert.equal(provider.getCalls().filter((call) => call.method === 'constructAnchorCandidates').length, 1);
  assert.equal(provider.getCalls().filter((call) => call.method === 'reconstructAnchorCandidate').length, 1);
  assert.equal(result.checkpoint.candidate_retry_history[0].candidate_id, 'ANCHOR-02');
  assert.equal(result.checkpoint.anchor_candidate_difference_matrix.status, 'pass');
});

test('Human Anchor Review saves, restores, validates Candidate IDs, and updates idempotently', async () => {
  const provider = providerFixture();
  const awaiting = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: provider, evaluator: cleanEvaluator() });
  const reviewed = applyAnchorConfirmationReview(awaiting.checkpoint, richConfirmation(), { clock: () => '2026-07-19T14:00:00.000Z' });
  const repeated = applyAnchorConfirmationReview(reviewed, richConfirmation(), { clock: () => '2026-07-19T15:00:00.000Z' });
  assert.deepEqual(repeated, reviewed);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sprint2c-review-'));
  const store = createSprint2RuntimeCheckpointStore({ rootDir: root });
  await store.save(reviewed);
  assert.deepEqual(await store.load({ project_id: 'project-s2', run_id: 'run-s2' }), reviewed);
  assert.equal(reviewed.anchor_confirmation_record.reviewer_confidence, 0.92);
  assert.deepEqual(reviewed.anchor_confirmation_record.rejected_anchor_reasons['ANCHOR-02'], ['与方向机制差异不足']);
});

test('failed or not-evaluated Anchor Candidate cannot be confirmed', async () => {
  const failedEvaluator = createFixtureSprint2SemanticEvaluator({
    'anchor_direction:ANCHOR-01:AP-ANC-001': semanticHit('候选为口号', '重写为视觉机制')
  });
  const failed = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: providerFixture(), evaluator: failedEvaluator });
  assert.throws(() => applyAnchorConfirmationReview(failed.checkpoint, richConfirmation()), /failed semantic validation/u);

  const skipped = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: providerFixture() });
  assert.equal(skipped.checkpoint.anchor_evaluation_results[0].status, 'not_evaluated');
  assert.throws(() => applyAnchorConfirmationReview(skipped.checkpoint, richConfirmation()), /failed semantic validation/u);
});

test('CLI dry-run reports a plan without reading Provider fixtures or writing output', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sprint2c-cli-dry-'));
  const output = path.join(root, 'not-created.json');
  const result = await runSprint2QualityCli(['build-anchor', '--input', 'missing.json', '--checkpoint', output, '--fixture-provider', 'missing-provider.json', '--dry-run']);
  assert.equal(result.status, 'dry_run');
  await assert.rejects(() => fs.stat(output), { code: 'ENOENT' });
});

test('CLI confirm and continue resume the existing Checkpoint without rebuilding Candidates', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sprint2c-cli-resume-'));
  const checkpointFile = path.join(root, 'checkpoint.json');
  const reviewFile = path.join(root, 'review.json');
  const provider = providerFixture();
  const evaluator = cleanEvaluator();
  const awaiting = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: provider, evaluator });
  await fs.writeFile(checkpointFile, `${JSON.stringify(awaiting.checkpoint)}\n`, 'utf8');
  await fs.writeFile(reviewFile, `${JSON.stringify(richConfirmation())}\n`, 'utf8');
  await runSprint2QualityCli(['confirm-anchor', '--checkpoint', checkpointFile, '--input', reviewFile, '--anchor', 'ANCHOR-01'], { clock: () => '2026-07-19T14:00:00.000Z' });
  const continued = await runSprint2QualityCli(['continue', '--checkpoint', checkpointFile, '--resume', '--no-report'], { providerAdapter: provider, evaluator });
  assert.equal(continued.status, 'completed');
  assert.equal(provider.getCalls().filter((call) => call.method === 'constructAnchorCandidates').length, 1);
});

test('CLI retry reruns only the named failed module', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sprint2c-cli-retry-'));
  const checkpointFile = path.join(root, 'checkpoint.json');
  let attempts = 0;
  const provider = providerFixture({
    grammarFactory(input, language) {
      if (input.stage === 'material_lighting_grammar' && ++attempts === 1) throw new Error('material fixture failure');
      return grammarResult(input, language);
    }
  });
  const evaluator = cleanEvaluator();
  const failed = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: provider, evaluator, anchorConfirmationRecord: richConfirmation() });
  await fs.writeFile(checkpointFile, `${JSON.stringify(failed.checkpoint)}\n`, 'utf8');
  const retried = await runSprint2QualityCli(['retry', '--checkpoint', checkpointFile, '--module', 'material_lighting_grammar'], { providerAdapter: provider, evaluator });
  assert.equal(retried.status, 'completed');
  assert.equal(provider.getCalls().filter((call) => call.method === 'constructGrammarStage' && call.input.stage === 'shape_composition_grammar').length, 1);
  assert.equal(provider.getCalls().filter((call) => call.method === 'constructGrammarStage' && call.input.stage === 'material_lighting_grammar').length, 2);
});

test('Quality Summary reports Candidate, DNA, Grammar, assets, retries, and overall status', async () => {
  const completed = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: providerFixture(), evaluator: cleanEvaluator(), anchorConfirmationRecord: richConfirmation() });
  const summary = buildSprint2QualitySummary(completed.checkpoint);
  assert.equal(summary.anchor_candidate_count, 3);
  assert.equal(summary.valid_anchor_candidate_count, 3);
  assert.equal(summary.candidate_difference_status, 'pass');
  assert.equal(summary.confirmed_anchor_status, 'confirmed');
  assert.equal(summary.visual_dna_count, 3);
  assert.equal(summary.grammar_stage_status.motion_information_grammar, 'passed');
  assert.equal(summary.restricted_asset_exclusion_status, 'pass');
  assert.equal(summary.overall_status, 'pass');
});

test('Golden Dataset Fixture Evaluator reaches self-consistency accuracy without claiming real-project stability', async () => {
  const resultMap = Object.fromEntries(Object.values(SPRINT_2_SEMANTIC_RULE_IDS).flat().map((ruleId) => [ruleId, (request) => {
    if (!request.context.fixture.expected_anti_patterns.includes(ruleId)) return false;
    return semanticHit(`Fixture evidence for ${ruleId}`, `Fixture repair for ${ruleId}`);
  }]));
  const accuracy = await evaluateSprint2GoldenDataset({ fixtures: SPRINT_2_GOLDEN_DATASET, evaluator: createFixtureSprint2SemanticEvaluator(resultMap) });
  assert.equal(accuracy.precision, 1);
  assert.equal(accuracy.recall, 1);
  assert.equal(accuracy.fixture_consistency_only, true);
  assert.equal(accuracy.statistically_stable, false);
});

test('restricted assets remain excluded and Sprint 2 report preserves Sprint 1 prefix', async () => {
  const completed = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: providerFixture(), evaluator: cleanEvaluator(), anchorConfirmationRecord: richConfirmation() });
  assert.ok(!completed.checkpoint.generation_boundary.executable_assets.includes('ASSET-R1'));
  assert.ok(completed.checkpoint.generation_boundary.non_executable_assets.includes('ASSET-R1'));
  const sprint1 = '# Existing Sprint 1\n\nImmutable bytes.\n';
  const report = appendSprint2Report(sprint1, completed.checkpoint);
  assert.equal(report.slice(0, sprint1.length), sprint1);
});

test('Sprint 2C source contains no real Provider, network, image generation, or Prompt Compiler call', async () => {
  const files = [
    '../../src/v5/visual-translation/v1/runtime/evaluate-anchor-candidate-difference.js',
    '../../src/v5/visual-translation/v1/runtime/build-sprint-2-quality-summary.js',
    '../../src/v5/visual-translation/v1/cli/run-sprint-2-quality-cli.js',
    '../../scripts/sprint-2-quality.mjs'
  ].map((file) => path.resolve(import.meta.dirname, file));
  const source = (await Promise.all(files.map((file) => fs.readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(source, /\b(?:fetch|generateImage|imagePlanner|promptCompiler)\s*\(/u);
  assert.doesNotMatch(source, /openai|dashscope|anthropic/iu);
});

function providerFixture(options = {}) {
  const language = sprint2LanguageSystemFixture();
  const candidates = options.candidates || anchorCandidates();
  return createFixtureVisualLanguageProviderAdapter({
    constructAnchorCandidates: candidates,
    constructPrimaryDna: language.visual_dna.primary_dna,
    constructSupportingDna: { supporting_dna: language.visual_dna.supporting_dna, forbidden_mutations: language.visual_dna.forbidden_mutations },
    constructGrammarStage(input) {
      return options.grammarFactory ? options.grammarFactory(input, language) : grammarResult(input, language);
    },
    ...(options.reconstructAnchorCandidate ? { reconstructAnchorCandidate: options.reconstructAnchorCandidate } : {})
  });
}

function anchorCandidates() {
  const base = sprint2LanguageSystemFixture().anchor_direction;
  return ['relationship_system', 'transformation_logic', 'spatial_logic'].map((anchor_type, index) => {
    const candidate = structuredClone(base);
    candidate.anchor_id = `ANCHOR-0${index + 1}`;
    candidate.name = `差异候选 ${index + 1}`;
    candidate.anchor_type = anchor_type;
    candidate.primary_anchor.anchor_component_id = `ANCHOR-0${index + 1}-P1`;
    candidate.supporting_anchors.forEach((item, itemIndex) => { item.anchor_component_id = `ANCHOR-0${index + 1}-S${itemIndex + 1}`; });
    candidate.status = 'draft';
    return candidate;
  });
}

function grammarResult(input, language) {
  return Object.fromEntries(input.categories.map((category) => [category, language.visual_grammar[category]]));
}

function richConfirmation() {
  return {
    selection_id: 'ANCHOR-SEL-QUALITY-001', selector_type: 'human', selected_anchor_id: 'ANCHOR-01', status: 'confirmed',
    confirmed_at: '2026-07-19T13:00:00.000Z', selection_reasons: ['最稳定继承 Selected Direction', '排除边界最清晰'],
    rejected_anchor_reasons: { 'ANCHOR-02': ['与方向机制差异不足'], 'ANCHOR-03': ['跨媒介行为不够明确'] },
    reviewer_confidence: 0.92, review_notes: '人工比较三个候选后确认', notes: 'Sprint 2C review'
  };
}

function cleanEvaluator() {
  return createFixtureSprint2SemanticEvaluator({});
}

function semanticHit(evidence, repair) {
  return { detected: true, confidence: 0.95, evidence: [evidence], repair_actions: [repair] };
}

function differenceResult(scores) {
  const dimensions = ['core_visual_proposition', 'primary_mechanism', 'controlled_visual_dimensions', 'inclusion_boundary', 'exclusion_boundary', 'cross_media_behavior'];
  return {
    shared_anchor_traits: ['均继承 Selected Direction 的可验证关系'],
    dimension_scores: Object.fromEntries(dimensions.map((dimension, index) => [dimension, scores[index]])),
    reasons: Object.fromEntries(dimensions.map((dimension, index) => [dimension, `人工 Fixture 理由 ${index + 1}`]))
  };
}
