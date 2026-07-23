import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  SPRINT_2_ANTI_PATTERN_IDS,
  appendSprint2Report,
  createFixtureSprint2SemanticEvaluator,
  createFixtureVisualLanguageProviderAdapter,
  createSprint2RuntimeCheckpointStore,
  runVisualLanguageConstruction
} from '../../src/v5/visual-translation/v1/index.js';
import { sprint2InputFixture, sprint2LanguageSystemFixture } from './helpers/visual-translation-sprint2a-fixture.js';

test('Anchor Candidate Construction creates 2–3 evaluated candidates without auto-selection', async () => {
  const provider = providerFixture();
  const result = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: provider, evaluator: cleanEvaluator() });
  assert.equal(result.status, 'awaiting_anchor_confirmation');
  assert.equal(result.checkpoint.anchor_candidates.length, 3);
  assert.equal(result.checkpoint.anchor_evaluation_results.length, 3);
  assert.equal(result.checkpoint.anchor_confirmation_record, null);
  assert.equal(result.checkpoint.visual_dna, null);
  assert.equal(result.checkpoint.module_status.anchor_candidates.status, 'passed');
  assert.equal(result.checkpoint.module_status.anchor_confirmation.status, 'pending');
});

test('Anchor semantic evaluator identifies slogan and single-object candidates', async () => {
  const provider = providerFixture({ candidateTypes: ['relationship_system', 'marketing_slogan', 'single_object'] });
  const evaluator = createFixtureSprint2SemanticEvaluator({
    'anchor_direction:ANCHOR-02:AP-ANC-001': semanticHit('候选只是营销口号', '改写为可观察关系机制'),
    'anchor_direction:ANCHOR-03:AP-ANC-002': semanticHit('候选只是具体玻璃球物件', '提炼物件背后的关系和行为')
  });
  const result = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: provider, evaluator });
  const second = result.checkpoint.anchor_evaluation_results.find((item) => item.subject_id === 'ANCHOR-02');
  const third = result.checkpoint.anchor_evaluation_results.find((item) => item.subject_id === 'ANCHOR-03');
  assert.equal(second.findings.find((item) => item.anti_pattern_id === 'AP-ANC-001').detected, true);
  assert.equal(third.findings.find((item) => item.anti_pattern_id === 'AP-ANC-002').detected, true);
  assert.equal(result.checkpoint.anchor_evaluation_results.find((item) => item.subject_id === 'ANCHOR-01').passed, true);
});

test('multiple Primary Anchors fail Anchor Candidate module before confirmation', async () => {
  const candidates = anchorCandidates();
  candidates[0].primary_anchor = [candidates[0].primary_anchor, structuredClone(candidates[0].primary_anchor)];
  const provider = providerFixture({ candidates });
  const result = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: provider, evaluator: cleanEvaluator() });
  assert.equal(result.status, 'failed');
  assert.equal(result.failed_module, 'anchor_candidates');
  assert.match(result.checkpoint.module_status.anchor_candidates.last_error, /exactly one/u);
});

test('Visual DNA requires Anchor confirmation and is built Primary before Supporting', async () => {
  const provider = providerFixture();
  const awaiting = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: provider, evaluator: cleanEvaluator() });
  assert.equal(provider.getCalls().filter((call) => call.method.includes('Dna')).length, 0);
  const completed = await runVisualLanguageConstruction({
    input: sprint2InputFixture(), providerAdapter: provider, evaluator: cleanEvaluator(),
    resumeCheckpoint: awaiting.checkpoint, anchorConfirmationRecord: confirmation()
  });
  assert.equal(completed.status, 'completed');
  assert.deepEqual(provider.getCalls().filter((call) => call.method.includes('Dna')).map((call) => call.method), ['constructPrimaryDna', 'constructSupportingDna']);
  assert.ok(completed.checkpoint.visual_dna.primary_dna.length >= 1 && completed.checkpoint.visual_dna.primary_dna.length <= 2);
  assert.ok(completed.checkpoint.visual_dna.supporting_dna.length >= 2 && completed.checkpoint.visual_dna.supporting_dna.length <= 3);
});

test('Logo plus Color only DNA fails the Visual DNA module', async () => {
  const language = sprint2LanguageSystemFixture();
  language.visual_dna.primary_dna[0].visual_form.category = 'logo';
  language.visual_dna.supporting_dna.forEach((item) => { item.visual_form.category = 'color'; });
  const provider = providerFixture({ language });
  const result = await runVisualLanguageConstruction({
    input: sprint2InputFixture(), providerAdapter: provider, evaluator: cleanEvaluator(), anchorConfirmationRecord: confirmation()
  });
  assert.equal(result.failed_module, 'visual_dna');
  assert.match(result.checkpoint.module_status.visual_dna.last_error, /Logo and color/u);
});

test('Visual Grammar is constructed in three inherited stages', async () => {
  const provider = providerFixture();
  const result = await runVisualLanguageConstruction({
    input: sprint2InputFixture(), providerAdapter: provider, evaluator: cleanEvaluator(), anchorConfirmationRecord: confirmation()
  });
  assert.equal(result.status, 'completed');
  const grammarCalls = provider.getCalls().filter((call) => call.method === 'constructGrammarStage');
  assert.deepEqual(grammarCalls.map((call) => call.input.stage), [
    'shape_composition_grammar', 'material_lighting_grammar', 'motion_information_grammar'
  ]);
  assert.deepEqual(Object.keys(grammarCalls[0].input.inherited_grammar), []);
  assert.deepEqual(Object.keys(grammarCalls[1].input.inherited_grammar).sort(), ['composition_grammar', 'shape_grammar']);
  assert.equal(Object.keys(grammarCalls[2].input.inherited_grammar).length, 4);
});

test('later Grammar semantic conflict fails only its own module', async () => {
  const evaluator = createFixtureSprint2SemanticEvaluator({
    'visual_grammar:material_lighting_grammar:AP-GRA-003': semanticHit('材质与前序极简构图规则冲突', '收敛材质密度并继承前序构图逻辑')
  });
  const result = await runVisualLanguageConstruction({
    input: sprint2InputFixture(), providerAdapter: providerFixture(), evaluator, anchorConfirmationRecord: confirmation()
  });
  assert.equal(result.failed_module, 'material_lighting_grammar');
  assert.equal(result.checkpoint.module_status.shape_composition_grammar.status, 'passed');
  assert.equal(result.checkpoint.module_status.material_lighting_grammar.status, 'failed');
  assert.equal(result.checkpoint.module_status.motion_information_grammar.status, 'pending');
  assert.deepEqual(Object.keys(result.checkpoint.visual_grammar).sort(), ['composition_grammar', 'shape_grammar']);
});

test('Generation Boundary compiler excludes restricted, future identity, and unknown assets', async () => {
  const input = sprint2InputFixture();
  input.allowed_assets.push({ asset_id: 'ASSET-FUTURE', status: 'proposed', execution_scope: 'future_identity_design' });
  input.allowed_assets.push('ASSET-UNKNOWN');
  input.allowed_assets.push({ asset_id: 'ASSET-NO-STATUS' });
  const result = await runVisualLanguageConstruction({ input, providerAdapter: providerFixture(), evaluator: cleanEvaluator(), anchorConfirmationRecord: confirmation() });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.checkpoint.generation_boundary.executable_assets, ['ASSET-01']);
  assert.ok(result.checkpoint.generation_boundary.non_executable_assets.includes('ASSET-R1'));
  assert.ok(result.checkpoint.generation_boundary.non_executable_assets.includes('ASSET-FUTURE'));
  assert.ok(result.checkpoint.generation_boundary.non_executable_assets.includes('ASSET-UNKNOWN'));
  assert.ok(result.checkpoint.generation_boundary.non_executable_assets.includes('ASSET-NO-STATUS'));
});

test('failed Grammar module retries locally without regenerating confirmed Anchor or passed modules', async () => {
  let materialAttempts = 0;
  const provider = providerFixture({
    grammarFactory(input, language) {
      if (input.stage === 'material_lighting_grammar' && ++materialAttempts === 1) throw new Error('fixture material failure');
      return grammarResult(input, language);
    }
  });
  const first = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: provider, evaluator: cleanEvaluator(), anchorConfirmationRecord: confirmation() });
  assert.equal(first.failed_module, 'material_lighting_grammar');
  const confirmedBefore = structuredClone(first.checkpoint.confirmed_anchor);
  const second = await runVisualLanguageConstruction({
    input: sprint2InputFixture(), providerAdapter: provider, evaluator: cleanEvaluator(),
    resumeCheckpoint: first.checkpoint, retryModules: ['material_lighting_grammar']
  });
  assert.equal(second.status, 'completed');
  assert.deepEqual(second.checkpoint.confirmed_anchor, confirmedBefore);
  const methods = provider.getCalls().map((call) => call.method);
  assert.equal(methods.filter((method) => method === 'constructAnchorCandidates').length, 1);
  assert.equal(methods.filter((method) => method === 'constructPrimaryDna').length, 1);
  assert.equal(provider.getCalls().filter((call) => call.method === 'constructGrammarStage' && call.input.stage === 'shape_composition_grammar').length, 1);
  assert.equal(provider.getCalls().filter((call) => call.method === 'constructGrammarStage' && call.input.stage === 'material_lighting_grammar').length, 2);
  assert.equal(second.checkpoint.module_status.material_lighting_grammar.attempts, 2);
});

test('Sprint 2 Runtime Checkpoint saves, restores, and rejects a modified hash', async () => {
  const result = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: providerFixture(), evaluator: cleanEvaluator(), anchorConfirmationRecord: confirmation() });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sprint-2b-checkpoint-'));
  const store = createSprint2RuntimeCheckpointStore({ rootDir: root });
  await store.save(result.checkpoint);
  const restored = await store.load({ project_id: 'project-s2', run_id: 'run-s2' });
  assert.deepEqual(restored, result.checkpoint);
  const file = path.join(root, 'project-s2', 'run-s2', 'sprint-2', 'sprint-2-checkpoint-v2.json');
  const tampered = JSON.parse(await fs.readFile(file, 'utf8'));
  tampered.output_hash = '0'.repeat(64);
  await fs.writeFile(file, `${JSON.stringify(tampered)}\n`, 'utf8');
  await assert.rejects(() => store.load({ project_id: 'project-s2', run_id: 'run-s2' }), /output_hash/u);
});

test('Sprint 2 Runtime report appends S2.1–S2.5 without changing Sprint 1', async () => {
  const result = await runVisualLanguageConstruction({ input: sprint2InputFixture(), providerAdapter: providerFixture(), evaluator: cleanEvaluator(), anchorConfirmationRecord: confirmation() });
  const sprint1 = '# Sprint 1\n\nOriginal report bytes.\n';
  const report = appendSprint2Report(sprint1, result.checkpoint);
  assert.equal(report.slice(0, sprint1.length), sprint1);
  for (const heading of ['S2.1 Anchor Direction', 'S2.2 Visual DNA', 'S2.3 Visual Grammar', 'S2.4 Consistency Rules', 'S2.5 Generation Boundary']) assert.ok(report.includes(heading));
  assert.throws(() => appendSprint2Report(report, result.checkpoint), /already exists/u);
});

test('Sprint 2 semantic Anti-pattern registry exposes all required Anchor, DNA, and Grammar IDs', () => {
  assert.deepEqual(SPRINT_2_ANTI_PATTERN_IDS.anchor_direction, ['AP-ANC-001', 'AP-ANC-002', 'AP-ANC-003', 'AP-ANC-004', 'AP-ANC-005']);
  assert.deepEqual(SPRINT_2_ANTI_PATTERN_IDS.visual_dna, ['AP-DNA-001', 'AP-DNA-002', 'AP-DNA-003', 'AP-DNA-004', 'AP-DNA-005']);
  assert.deepEqual(SPRINT_2_ANTI_PATTERN_IDS.visual_grammar, ['AP-GRA-001', 'AP-GRA-002', 'AP-GRA-003', 'AP-GRA-004']);
});

test('Sprint 2B runtime contains no real Provider, network, image generation, or Prompt Compiler call', async () => {
  const runtimeRoot = path.resolve(import.meta.dirname, '../../src/v5/visual-translation/v1/runtime');
  const files = await fs.readdir(runtimeRoot);
  const sprint2Files = files.filter((file) => /visual-language|sprint-2|consistency|generation-boundary/u.test(file));
  const source = (await Promise.all(sprint2Files.map((file) => fs.readFile(path.join(runtimeRoot, file), 'utf8')))).join('\n');
  assert.doesNotMatch(source, /\b(?:fetch|generateImage|imagePlanner|promptCompiler)\s*\(/u);
  assert.doesNotMatch(source, /openai|dashscope|anthropic/iu);
});

function providerFixture(options = {}) {
  const language = options.language || sprint2LanguageSystemFixture();
  const candidates = options.candidates || anchorCandidates(options.candidateTypes);
  return createFixtureVisualLanguageProviderAdapter({
    constructAnchorCandidates: candidates,
    constructPrimaryDna: language.visual_dna.primary_dna,
    constructSupportingDna: {
      supporting_dna: language.visual_dna.supporting_dna,
      forbidden_mutations: language.visual_dna.forbidden_mutations
    },
    constructGrammarStage(input) {
      return options.grammarFactory ? options.grammarFactory(input, language) : grammarResult(input, language);
    }
  });
}

function anchorCandidates(types = ['relationship_system', 'transformation_logic', 'spatial_logic']) {
  const base = sprint2LanguageSystemFixture().anchor_direction;
  return types.map((anchorType, index) => {
    const candidate = structuredClone(base);
    candidate.anchor_id = `ANCHOR-0${index + 1}`;
    candidate.name = `候选 Anchor ${index + 1}`;
    candidate.anchor_type = anchorType;
    candidate.primary_anchor.anchor_component_id = `ANCHOR-0${index + 1}-P1`;
    candidate.supporting_anchors.forEach((item, supportIndex) => { item.anchor_component_id = `ANCHOR-0${index + 1}-S${supportIndex + 1}`; });
    candidate.status = 'draft';
    return candidate;
  });
}

function grammarResult(input, language) {
  return Object.fromEntries(input.categories.map((category) => [category, language.visual_grammar[category]]));
}

function confirmation() {
  return { selection_id: 'ANCHOR-SEL-001', selector_type: 'human', selected_anchor_id: 'ANCHOR-01', status: 'confirmed', confirmed_at: '2026-07-19T13:00:00.000Z', notes: '人工确认候选一' };
}

function cleanEvaluator() {
  return createFixtureSprint2SemanticEvaluator({});
}

function semanticHit(evidence, repair) {
  return { evidence: [evidence], repair: [repair], confidence: 1 };
}
