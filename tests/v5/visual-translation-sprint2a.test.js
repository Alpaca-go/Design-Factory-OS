import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendSprint2Report,
  buildSprint2Checkpoint,
  createSprint2CheckpointStore,
  validateSprint2Input,
  validateSprint2LanguageSystem
} from '../../src/v5/visual-translation/v1/index.js';
import { sprint2InputFixture, sprint2LanguageSystemFixture } from './helpers/visual-translation-sprint2a-fixture.js';

test('Sprint 2 input rejects missing selected direction or human selection record', () => {
  const missingDirection = sprint2InputFixture();
  delete missingDirection.selected_direction;
  assert.throws(() => validateSprint2Input(missingDirection), /selected_direction/u);

  const missingHumanSelection = sprint2InputFixture();
  delete missingHumanSelection.human_selection_record;
  assert.throws(() => validateSprint2Input(missingHumanSelection), /human_selection_record/u);
});

test('Anchor Direction allows exactly one Primary Anchor and at most two Supporting Anchors', () => {
  const input = validateSprint2Input(sprint2InputFixture());
  const tooManyPrimary = sprint2LanguageSystemFixture();
  tooManyPrimary.anchor_direction.primary_anchor = [
    structuredClone(tooManyPrimary.anchor_direction.primary_anchor),
    structuredClone(tooManyPrimary.anchor_direction.primary_anchor)
  ];
  assert.throws(() => validateSprint2LanguageSystem(tooManyPrimary, input), /exactly one/u);

  const tooManySupporting = sprint2LanguageSystemFixture();
  tooManySupporting.anchor_direction.supporting_anchors.push(
    { anchor_component_id: 'ANCHOR-S2', name: '辅助二', mechanism: '辅助机制二', visual_role: '辅助角色二' },
    { anchor_component_id: 'ANCHOR-S3', name: '辅助三', mechanism: '辅助机制三', visual_role: '辅助角色三' }
  );
  assert.throws(() => validateSprint2LanguageSystem(tooManySupporting, input), /最多允许 2 项/u);
});

test('inference Anchor requires reduced evidence confidence', () => {
  const input = validateSprint2Input(sprint2InputFixture());
  const system = sprint2LanguageSystemFixture();
  system.anchor_direction.reason_basis = 'inference';
  system.anchor_direction.evidence_confidence = 1;
  assert.throws(() => validateSprint2LanguageSystem(system, input), /must be 0.65/u);
  system.anchor_direction.evidence_confidence = 0.65;
  assert.doesNotThrow(() => validateSprint2LanguageSystem(system, input));
});

test('Anchor type rejects marketing slogans and single physical objects', () => {
  const input = validateSprint2Input(sprint2InputFixture());
  for (const anchorType of ['marketing_slogan', 'single_object']) {
    const system = sprint2LanguageSystemFixture();
    system.anchor_direction.anchor_type = anchorType;
    assert.throws(() => validateSprint2LanguageSystem(system, input), /anchor_type/u);
  }
});

test('Visual DNA rejects more than five units and Logo plus Color only DNA', () => {
  const input = validateSprint2Input(sprint2InputFixture());
  const tooMany = sprint2LanguageSystemFixture();
  tooMany.visual_dna.primary_dna.push(
    { ...structuredClone(tooMany.visual_dna.primary_dna[0]), dna_id: 'DNA-04' },
    { ...structuredClone(tooMany.visual_dna.primary_dna[0]), dna_id: 'DNA-05' }
  );
  assert.throws(() => validateSprint2LanguageSystem(tooMany, input), /最多允许 2 项/u);

  const logoColor = sprint2LanguageSystemFixture();
  logoColor.visual_dna.primary_dna[0].visual_form.category = 'logo';
  logoColor.visual_dna.supporting_dna[0].visual_form.category = 'color';
  logoColor.visual_dna.supporting_dna[1].visual_form.category = 'color';
  assert.throws(() => validateSprint2LanguageSystem(logoColor, input), /Logo and color/u);
});

test('every Grammar category requires Allowed, Preferred, and Avoid observable rules', () => {
  const input = validateSprint2Input(sprint2InputFixture());
  for (const field of ['allowed', 'preferred', 'avoid']) {
    const system = sprint2LanguageSystemFixture();
    delete system.visual_grammar.shape_grammar[field];
    assert.throws(() => validateSprint2LanguageSystem(system, input), new RegExp(field, 'u'));
  }
});

test('Consistency Rules must trace to a known Anchor or DNA', () => {
  const input = validateSprint2Input(sprint2InputFixture());
  const system = sprint2LanguageSystemFixture();
  system.consistency_rules.must_preserve[0].maps_to = [{ type: 'dna', id: 'DNA-UNKNOWN' }];
  assert.throws(() => validateSprint2LanguageSystem(system, input), /unknown dna ID/u);
});

test('restricted assets cannot enter Generation Boundary executable_assets', () => {
  const input = validateSprint2Input(sprint2InputFixture());
  const system = sprint2LanguageSystemFixture();
  system.generation_boundary.executable_assets.push('ASSET-R1');
  assert.throws(() => validateSprint2LanguageSystem(system, input), /cannot be executable/u);
});

test('Sprint 2 report append preserves the complete Sprint 1 report prefix', () => {
  const checkpoint = buildSprint2Checkpoint({ input: sprint2InputFixture(), languageSystem: sprint2LanguageSystemFixture(), createdAt: '2026-07-19T12:30:00.000Z' });
  const sprint1 = '# Sprint 1 Report\n\n## 1. Evidence\n\nOriginal Sprint 1 content.\n';
  const combined = appendSprint2Report(sprint1, checkpoint);
  assert.equal(combined.slice(0, sprint1.length), sprint1);
  for (const heading of ['## S2.1 Anchor Direction', '## S2.2 Visual DNA', '## S2.3 Visual Grammar', '## S2.4 Consistency Rules', '## S2.5 Generation Boundary']) assert.ok(combined.includes(heading));
  assert.equal((combined.match(/masterpiece-os:sprint-2-report-append:start/gu) || []).length, 1);
  assert.throws(() => appendSprint2Report(combined, checkpoint), /already exists/u);
});

test('Sprint 2 Checkpoint saves and restores independently without touching Sprint 1', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sprint-2a-checkpoint-'));
  const sprint1File = path.join(root, 'project-s2', 'run-s2', 'sprint-1-checkpoint.json');
  await fs.mkdir(path.dirname(sprint1File), { recursive: true });
  await fs.writeFile(sprint1File, '{"sprint":1}\n', 'utf8');
  const before = await fs.readFile(sprint1File, 'utf8');
  const checkpoint = buildSprint2Checkpoint({ input: sprint2InputFixture(), languageSystem: sprint2LanguageSystemFixture(), createdAt: '2026-07-19T12:30:00.000Z' });
  const store = createSprint2CheckpointStore({ rootDir: root });
  const saved = await store.save(checkpoint);
  const restored = await store.load({ project_id: 'project-s2', run_id: 'run-s2' });
  assert.deepEqual(restored, checkpoint);
  assert.equal(await fs.readFile(sprint1File, 'utf8'), before);
  assert.match(saved.file, /sprint-2[\\/]sprint-2-checkpoint-v1\.json$/u);
  assert.equal(restored.sprint_1_source_reference.selected_direction_id, 'D01');
  assert.match(restored.source_hash, /^[a-f0-9]{64}$/u);
});

test('Sprint 2A source boundary contains no Provider, image generation, or Prompt Compiler execution', async () => {
  const root = path.resolve(import.meta.dirname, '../../src/v5/visual-translation/v1');
  const files = [
    'protocol/sprint-2-stage-registry.js',
    'runtime/sprint-2-checkpoint-store.js',
    'report/append-sprint-2-report.js',
    'schemas/sprint-2-input-v1.js',
    'schemas/anchor-direction-v1.js',
    'schemas/visual-dna-v1.js',
    'schemas/visual-grammar-v1.js',
    'schemas/consistency-rules-v1.js',
    'schemas/generation-boundary-v1.js',
    'schemas/sprint-2-language-system-v1.js'
  ];
  const source = (await Promise.all(files.map((file) => fs.readFile(path.join(root, file), 'utf8')))).join('\n');
  assert.doesNotMatch(source, /\b(?:fetch|reasoner|generateImage|imagePlanner|promptCompiler)\s*\(/u);
  assert.doesNotMatch(source, /openai|dashscope|anthropic/iu);
});
