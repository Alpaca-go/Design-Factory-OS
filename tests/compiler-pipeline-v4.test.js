import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  canonicalStringify,
  finalizeCreativeDecisionState
} from '../src/creative-decision-state.js';
import {
  activateCreativeDecisionState
} from '../src/creative-decision-state-store.js';
import {
  compileCreativeFreedom
} from '../src/compilers/creative-freedom-compiler.js';
import {
  compileCreativeStrategy
} from '../src/compilers/creative-strategy-compiler.js';
import {
  compileDesignConstraints
} from '../src/compilers/design-constraints-compiler.js';
import {
  compileCreativeBriefV4
} from '../src/compilers/creative-brief-compiler.js';
import {
  compileDesignDecisionsV4
} from '../src/compilers/design-decisions-compiler.js';
import {
  COMPILER_STAGE_ORDER,
  compileActiveCreativeDecision,
  compileCreativeDecisionState
} from '../src/compiler-pipeline.js';
import { createV4CompilerState } from './fixtures/v4-creative-decision-state.js';

const EXPECTED_FREEDOM_PATHS = [
  'meta.schemaVersion',
  'meta.decisionId',
  'meta.status',
  'meta.stateDigest',
  'strategy.creativeFreedom.recommendation.freedom',
  'strategy.creativeFreedom.recommendation.mode',
  'strategy.creativeFreedom.recommendation.confidence',
  'strategy.creativeFreedom.recommendation.briefWhy',
  'strategy.creativeFreedom.humanOverride',
  'strategy.creativeFreedom.effective',
  'governance.readiness',
  'governance.blockers'
];

test('Compiler Pipeline preserves identity and follows the approved stage order', () => {
  const state = createV4CompilerState();
  const before = canonicalStringify(state);
  const result = compileCreativeDecisionState(state);

  assert.deepEqual(result.stageOrder, COMPILER_STAGE_ORDER);
  for (const key of COMPILER_STAGE_ORDER) {
    assert.equal(result[key].decisionId, state.meta.decisionId);
    assert.equal(result[key].stateDigest, state.meta.stateDigest);
    assert.ok(result[key].sourcePaths.length > 0);
    assert.equal(result[key].sourcePaths.some((item) => item.includes('extensions')), false);
  }
  assert.equal(canonicalStringify(state), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.creativeStrategy.actions), true);
  assert.throws(() => { result.creativeStrategy.thesis = 'mutation'; }, TypeError);
});

test('Freedom Compiler selects approved recommendation and effective values without recalculation', () => {
  const state = createV4CompilerState();
  const view = compileCreativeFreedom(state);

  assert.deepEqual(view.sourcePaths, EXPECTED_FREEDOM_PATHS);
  assert.deepEqual(view.recommendation, {
    freedom: 60,
    mode: 'Creative Evolution',
    confidence: 'High',
    briefWhy: ['Short approved reason.']
  });
  assert.deepEqual(view.effective, { freedom: 60, mode: 'Creative Evolution', source: 'ai' });
  assert.equal('audit' in view, false);

  const audit = compileCreativeFreedom(state, { audit: true });
  assert.deepEqual(audit.audit.why, ['FULL_WHY_SECRET']);
  assert.equal(audit.audit.evidenceIndex[0].summary, 'EVIDENCE_SECRET');
});

test('Freedom Compiler copies Human Override Effective values without mode or percentage mapping', () => {
  const namedInput = createV4CompilerState();
  namedInput.strategy.creativeFreedom.humanOverride = {
    type: 'named-mode', mode: 'Reimagine', providedBy: 'owner', providedAt: '2026-07-15T09:00:00.000Z',
    sourceRef: 'evidence.asset.logo'
  };
  namedInput.strategy.creativeFreedom.effective = { freedom: null, mode: 'Reimagine', source: 'human-mode' };
  namedInput.decisionRecord.overrideAudit.summary = 'Owner selected Reimagine.';
  const named = compileCreativeFreedom(finalizeCreativeDecisionState(namedInput));
  assert.deepEqual(named.effective, { freedom: null, mode: 'Reimagine', source: 'human-mode' });

  const percentageInput = createV4CompilerState();
  percentageInput.strategy.creativeFreedom.humanOverride = {
    type: 'percentage', percentage: 73, providedBy: 'owner', providedAt: '2026-07-15T09:00:00.000Z',
    sourceRef: 'evidence.asset.logo'
  };
  percentageInput.strategy.creativeFreedom.effective = { freedom: 73, mode: 'Custom', source: 'human-percentage' };
  percentageInput.decisionRecord.overrideAudit.summary = 'Owner selected 73 percent.';
  const percentage = compileCreativeFreedom(finalizeCreativeDecisionState(percentageInput));
  assert.deepEqual(percentage.effective, { freedom: 73, mode: 'Custom', source: 'human-percentage' });
});

test('Strategy Compiler only groups existing Actions and preserves directives and depth', () => {
  const state = createV4CompilerState();
  const view = compileCreativeStrategy(state);

  assert.deepEqual(Object.fromEntries(Object.entries(view.groups).map(([key, value]) => [key, value.length])), {
    locked: 1, evolve: 1, flexible: 1
  });
  assert.deepEqual(view.actions.map((item) => item.actionId), [
    'action.lock-logo', 'action.evolve-material', 'action.flex-composition'
  ]);
  assert.equal(view.groups.evolve[0].directive, 'Upgrade materials and lighting.');
  assert.equal(view.groups.evolve[0].transformationDepth, 'expression-only');
  assert.deepEqual(view.groups.evolve[0].identityGuardRefs, ['brand.logo']);
  assert.equal(view.groups.evolve[0].elements[0].name, 'Material');
  assert.equal('evidenceRefs' in view.groups.evolve[0], false);
  assert.equal('rationaleRefs' in view.groups.evolve[0], false);
  assert.equal('evidenceRefs' in view.groups.evolve[0].elements[0], false);
  assert.deepEqual(view.indexes, state.strategy.indexes);
});

test('Constraints Compiler preserves three-state Policies and only reports conflict status', () => {
  const state = createV4CompilerState();
  const view = compileDesignConstraints(state);

  assert.deepEqual(Object.fromEntries(Object.entries(view.groups).map(([key, value]) => [key, value.length])), {
    locked: 1, evolve: 1, flexible: 1
  });
  assert.deepEqual(view.groups.evolve[0].identityGuardRefs, ['policy.lock-logo']);
  assert.equal(view.groups.flexible[0].directive, 'Composition may be redesigned.');
  assert.equal('reasonRef' in view.groups.flexible[0], false);
  assert.equal('evidenceRefs' in view.groups.flexible[0], false);
  assert.deepEqual(view.conflictStatus, { total: 0, open: 0, blockers: 0, openBlockers: 0 });
  assert.equal(view.forbiddenDirections[0].statement, 'Never alter the wordmark geometry.');
});

test('Brief Compiler emits fixed ten sections, preserves three-state labels and excludes audit material', () => {
  const state = createV4CompilerState();
  const result = compileCreativeBriefV4(state);
  const brief = result.creativeBrief;
  const runtime = result.runtimeGptBrief;

  assert.deepEqual(brief.sectionOrder, [
    'creative-vision', 'creative-strategy', 'design-constraints', 'brand-personality',
    'approved-brand-dna', 'creative-principles', 'must-keep', 'can-explore',
    'photography-direction', 'design-goal'
  ]);
  assert.equal(brief.sections.length, 10);
  assert.deepEqual(brief.sections.find((item) => item.id === 'must-keep').content.map((item) => item.classification), ['locked']);
  assert.deepEqual(brief.sections.find((item) => item.id === 'can-explore').content.map((item) => item.classification), ['evolve', 'flexible']);
  for (let index = 1; index <= 10; index += 1) assert.match(brief.markdown, new RegExp(`## ${index}\\.`));
  assert.match(brief.markdown, /Short approved reason\./);
  for (const secret of ['FULL_WHY_SECRET', 'RATIONALE_SECRET', 'EVIDENCE_SECRET', 'COMPETITOR_SECRET', 'EXTENSION_SECRET']) {
    assert.doesNotMatch(brief.markdown, new RegExp(secret));
    assert.doesNotMatch(runtime.content, new RegExp(secret));
  }
  assert.ok(brief.characterCount <= brief.maximumCharacters);
  assert.ok(runtime.characterCount <= runtime.maximumCharacters);
  assert.equal(runtime.persistence, 'forbidden');
  assert.equal(result.sourcePaths.some((item) => item.startsWith('provenance.')), false);
  assert.equal(result.sourcePaths.some((item) => item.startsWith('decisionRecord.')), false);
  assert.equal(result.sourcePaths.some((item) => item === 'brand.currentVisualAssessment'), false);
});

test('Decisions Compiler exposes approved audit content but never Extension data', () => {
  const state = createV4CompilerState();
  const result = compileDesignDecisionsV4(state);
  const serialized = JSON.stringify(result);

  assert.equal(result.designDecisions.decisionRecord.rationale[0].statement, 'RATIONALE_SECRET');
  assert.deepEqual(result.designDecisions.creativeFreedom.audit.why, ['FULL_WHY_SECRET']);
  assert.equal(result.designDecisions.provenance.evidenceIndex[0].summary, 'EVIDENCE_SECRET');
  assert.equal(result.designDecisions.governance.approvals.creativeDecision.status, 'approved');
  assert.match(result.markdown, /RATIONALE_SECRET/);
  assert.doesNotMatch(serialized, /EXTENSION_SECRET/);
  assert.doesNotMatch(serialized, /COMPETITOR_SECRET/);
});

test('all public Compilers accept State as their only business input and are deterministic without network', () => {
  const state = createV4CompilerState();
  const compilers = [
    compileCreativeFreedom,
    compileCreativeStrategy,
    compileDesignConstraints,
    compileCreativeBriefV4,
    compileDesignDecisionsV4
  ];
  for (const compiler of compilers) assert.equal(compiler.length, 1);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network access forbidden'); };
  try {
    assert.equal(
      canonicalStringify(compileCreativeDecisionState(state)),
      canonicalStringify(compileCreativeDecisionState(state))
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Compiler Pipeline fails closed on missing or mutated State fields', () => {
  const mutated = createV4CompilerState();
  mutated.strategy.thesis = 'Unapproved mutation';
  assert.throws(
    () => compileCreativeDecisionState(mutated),
    (error) => error.code === 'INVALID_CREATIVE_DECISION_STATE'
  );

  const missing = createV4CompilerState();
  delete missing.strategy.designGoal;
  const invalid = finalizeCreativeDecisionState(missing);
  assert.throws(
    () => compileCreativeBriefV4(invalid),
    (error) => error.code === 'INVALID_CREATIVE_DECISION_STATE'
  );
});

test('Active State compilation is read-only and creates no output or runtime Brief file', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-compiler-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const state = createV4CompilerState();
  await activateCreativeDecisionState(projectRoot, state);

  const result = await compileActiveCreativeDecision(projectRoot);
  assert.equal(result.decisionId, state.meta.decisionId);
  assert.deepEqual(await fs.readdir(projectRoot), ['.masterpiece-os']);
  assert.deepEqual(await fs.readdir(path.join(projectRoot, '.masterpiece-os', 'state')), ['creative-decision.json']);
});

test('Sprint 2 Compiler source has no network, model SDK or external dependency imports', async () => {
  const compilerDirectory = new URL('../src/compilers/', import.meta.url);
  const files = (await fs.readdir(compilerDirectory)).filter((name) => name.endsWith('.js'));
  files.push('../compiler-pipeline.js');
  for (const name of files) {
    const url = name.startsWith('..') ? new URL(name, compilerDirectory) : new URL(name, compilerDirectory);
    const source = await fs.readFile(url, 'utf8');
    assert.doesNotMatch(source, /from\s+['"](?:node:)?https?['"]/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /\b(?:openai|anthropic|gemini|axios)\b/i);
  }
});
