import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  finalizeCreativeDecisionState,
  validateCreativeDecisionState
} from '../src/creative-decision-state.js';
import {
  activateCreativeDecisionState,
  getCreativeDecisionStatePath,
  readCreativeDecisionState
} from '../src/creative-decision-state-store.js';

const NOW = '2026-07-15T08:00:00.000Z';
const EVIDENCE_ID = 'evidence.asset.logo';
const RATIONALE_ID = 'rationale.identity-evolution';

function decisionText(statement, displayOrder) {
  return { statement, status: 'approved', evidenceRefs: [EVIDENCE_ID], displayOrder };
}

function dnaDimensions() {
  return Object.fromEntries([
    'logo', 'color', 'typography', 'composition', 'whitespace',
    'photography', 'materials', 'packaging', 'craft'
  ].map((id, index) => [id, {
    directive: `${id} directive`,
    elementRefs: ['brand.logo'],
    evidenceRefs: [EVIDENCE_ID],
    status: 'approved',
    displayOrder: index + 1
  }]));
}

function validStateInput({ decisionId = 'decision-1', supersedesDecisionId } = {}) {
  return {
    meta: {
      decisionId,
      projectId: 'project-1',
      projectVersion: '4.0-test',
      status: 'approved',
      createdAt: NOW,
      approvedAt: NOW,
      ...(supersedesDecisionId ? { supersedesDecisionId } : {})
    },
    provenance: {
      inputDigests: {
        assetManifest: 'digest-assets',
        projectContract: 'digest-contract',
        projectConfig: 'digest-config',
        brandUnderstanding: 'digest-brand',
        industryBenchmark: 'digest-benchmark'
      },
      reasoningRuns: {
        brandUnderstanding: { runId: 'run-brand', provider: 'test', model: 'test-model', completedAt: NOW },
        industryBenchmark: { runId: 'run-benchmark', provider: 'test', model: 'test-model', completedAt: NOW },
        creativeDecision: { runId: 'run-decision', provider: 'test', model: 'test-model', completedAt: NOW }
      },
      reasoningContractDigest: 'digest-reasoning-contract',
      sourceTimestamps: [{ sourceId: 'asset-logo', observedAt: NOW }],
      dataPolicyRef: 'policy.project-private',
      evidenceIndex: [{
        evidenceId: EVIDENCE_ID,
        sourceType: 'asset',
        sourceId: 'asset-logo',
        locator: 'input/logo.svg',
        summary: 'Approved logo source',
        observedAt: NOW,
        sourceDigest: 'digest-logo',
        confidentiality: 'project-private'
      }]
    },
    brand: {
      context: { industry: 'beverage', category: 'tea', projectType: 'identity evolution' },
      originalIntent: decisionText('Preserve calm premium identity.', 1),
      identity: decisionText('The brand is recognized by its wordmark and calm restraint.', 2),
      positioning: decisionText('Contemporary premium tea.', 3),
      personality: {
        statement: 'Calm, precise, tactile.',
        desired: ['calm', 'precise'],
        avoid: ['noisy'],
        evidenceRefs: [EVIDENCE_ID]
      },
      currentVisualAssessment: {
        summary: 'Identity is sound; production expression can evolve.',
        maturity: 'established',
        strengths: ['recognizable wordmark'],
        weaknesses: ['flat material rendering'],
        outdatedAreas: ['lighting'],
        evidenceRefs: [EVIDENCE_ID]
      },
      elements: [
        {
          elementId: 'brand.logo', name: 'Wordmark', kind: 'logo',
          definition: 'Approved wordmark geometry', verificationStatus: 'verified', evidenceRefs: [EVIDENCE_ID]
        },
        {
          elementId: 'brand.material', name: 'Material expression', kind: 'material',
          definition: 'Surface and finish system', verificationStatus: 'verified', evidenceRefs: [EVIDENCE_ID]
        },
        {
          elementId: 'brand.composition', name: 'Composition', kind: 'composition',
          definition: 'Campaign composition system', verificationStatus: 'verified', evidenceRefs: [EVIDENCE_ID]
        }
      ],
      approvedBrandDNA: { status: 'approved', dimensions: dnaDimensions() },
      extensions: {}
    },
    decisionRecord: {
      statement: 'Keep identity, evolve execution, allow campaign composition redesign.',
      rationale: [{
        rationaleId: RATIONALE_ID,
        statement: 'The identity is established while execution quality has room to improve.',
        evidenceRefs: [EVIDENCE_ID],
        displayOrder: 1
      }],
      tradeoffs: [],
      rejectedDirections: [],
      overrideAudit: { summary: 'No human override.' },
      extensions: {}
    },
    strategy: {
      creativeFreedom: {
        recommendation: {
          freedom: 60,
          mode: 'Creative Evolution',
          confidence: 'High',
          why: ['Identity is established and execution can advance.'],
          briefWhy: ['Advance expression without changing identity.']
        },
        factors: [{
          factorId: 'factor-brand-dna',
          factorType: 'brand-dna',
          conclusion: 'Core identity is stable.',
          evidenceRefs: [EVIDENCE_ID],
          displayOrder: 1
        }],
        humanOverride: { type: 'auto' },
        effective: { freedom: 60, mode: 'Creative Evolution', source: 'ai' }
      },
      creativeVision: {
        statement: 'A calm identity expressed with contemporary depth.',
        direction: 'Tactile restraint'
      },
      thesis: 'Protect recognition while upgrading execution quality.',
      actions: [
        {
          actionId: 'action.lock-logo', actionType: 'locked', domain: 'identity',
          elementRefs: ['brand.logo'], directive: 'Keep wordmark geometry unchanged.',
          transformationDepth: 'none', rationaleRefs: [RATIONALE_ID], evidenceRefs: [EVIDENCE_ID], displayOrder: 1
        },
        {
          actionId: 'action.evolve-material', actionType: 'evolve', domain: 'materials',
          elementRefs: ['brand.material'], directive: 'Upgrade material, lighting and craft expression.',
          transformationDepth: 'expression-only', identityGuardRefs: ['brand.logo'],
          rationaleRefs: [RATIONALE_ID], evidenceRefs: [EVIDENCE_ID], displayOrder: 2
        },
        {
          actionId: 'action.flex-composition', actionType: 'flexible', domain: 'composition',
          elementRefs: ['brand.composition'], directive: 'Redesign campaign composition freely.',
          transformationDepth: 'full redesign', rationaleRefs: [RATIONALE_ID], evidenceRefs: [EVIDENCE_ID], displayOrder: 3
        }
      ],
      creativePrinciples: [{
        principleId: 'principle.recognition-first',
        ...decisionText('Recognition precedes novelty.', 1)
      }],
      photographyDirection: {
        lighting: 'Directional soft light', framing: 'Editorial close crop', depth: 'Layered shallow depth',
        materials: 'Tactile natural surfaces', atmosphere: 'Quiet confidence'
      },
      designGoal: 'Create a contemporary campaign without changing brand recognition.',
      indexes: {
        lockedActionIds: ['action.lock-logo'],
        evolveActionIds: ['action.evolve-material'],
        flexibleActionIds: ['action.flex-composition']
      },
      extensions: {}
    },
    constraints: {
      elementPolicies: [
        {
          policyId: 'policy.lock-logo', elementRef: 'brand.logo', classification: 'locked',
          directive: 'Do not alter wordmark geometry.', reasonRef: RATIONALE_ID,
          evidenceRefs: [EVIDENCE_ID], displayOrder: 1
        },
        {
          policyId: 'policy.evolve-material', elementRef: 'brand.material', classification: 'evolve',
          directive: 'Upgrade execution while preserving the locked wordmark.', identityGuardRefs: ['policy.lock-logo'],
          reasonRef: RATIONALE_ID, evidenceRefs: [EVIDENCE_ID], displayOrder: 2
        },
        {
          policyId: 'policy.flex-composition', elementRef: 'brand.composition', classification: 'flexible',
          directive: 'Composition may be redesigned.', reasonRef: RATIONALE_ID,
          evidenceRefs: [EVIDENCE_ID], displayOrder: 3
        }
      ],
      forbiddenDirections: [{
        ruleId: 'rule.no-logo-change', statement: 'Never alter the wordmark geometry.',
        appliesToRefs: ['brand.logo'], rationaleRef: RATIONALE_ID,
        evidenceRefs: [EVIDENCE_ID], displayOrder: 1
      }],
      unresolved: [],
      conflicts: [],
      extensions: {}
    },
    governance: {
      approvals: {
        brandDNA: { status: 'approved', approvedBy: 'architecture-review', approvedAt: NOW },
        creativeDecision: { status: 'approved', approvedBy: 'architecture-review', approvedAt: NOW }
      },
      blockers: [],
      warnings: [],
      extensions: {}
    },
    extensions: {}
  };
}

function buildValidState(options) {
  return finalizeCreativeDecisionState(validStateInput(options));
}

test('finalized three-state Creative Decision State is release-ready and digest-valid', () => {
  const state = buildValidState();
  const result = validateCreativeDecisionState(state, { requireApproved: true });

  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.releaseReady, true);
  assert.equal(state.governance.readiness, 'release-ready');
  assert.deepEqual(state.strategy.indexes, {
    lockedActionIds: ['action.lock-logo'],
    evolveActionIds: ['action.evolve-material'],
    flexibleActionIds: ['action.flex-composition']
  });
});

test('preserve is rejected and Strategy/Constraint classifications must match', () => {
  const preserve = validStateInput();
  preserve.strategy.actions[1].actionType = 'preserve';
  preserve.constraints.elementPolicies[1].classification = 'preserve';
  const preserveResult = validateCreativeDecisionState(finalizeCreativeDecisionState(preserve));
  assert.equal(preserveResult.valid, false);
  assert.ok(preserveResult.errors.some((item) => item.code === 'invalid_enum'));

  const mismatch = validStateInput();
  mismatch.strategy.actions[1].actionType = 'flexible';
  mismatch.strategy.actions[1].identityGuardRefs = [];
  const mismatchResult = validateCreativeDecisionState(finalizeCreativeDecisionState(mismatch));
  assert.equal(mismatchResult.valid, false);
  assert.ok(mismatchResult.errors.some((item) => item.code === 'classification_mismatch'));
});

test('evolve requires a resolvable locked identity guard', () => {
  const input = validStateInput();
  input.strategy.actions[1].identityGuardRefs = ['brand.material'];
  const result = validateCreativeDecisionState(finalizeCreativeDecisionState(input));

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.code === 'unknown_identity_guard'));
});

test('digest detects any mutation of an approved State', () => {
  const state = buildValidState();
  state.strategy.thesis = 'Mutated after approval';
  const result = validateCreativeDecisionState(state);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.code === 'state_digest_mismatch'));
});

test('approved State fails closed on unresolved blockers and pending DNA', () => {
  const input = validStateInput();
  input.constraints.unresolved.push({
    unresolvedId: 'unresolved-legal-copy',
    question: 'Which legal copy is final?',
    affectedRefs: ['brand.logo'],
    isBlocking: true,
    owner: 'brand-owner',
    requiredBefore: 'brief-release',
    evidenceRefs: [EVIDENCE_ID]
  });
  input.brand.approvedBrandDNA.dimensions.logo.status = 'pending';
  const state = finalizeCreativeDecisionState(input);
  const result = validateCreativeDecisionState(state, { requireApproved: true });

  assert.equal(state.governance.readiness, 'not-ready');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.code === 'constraint_blocker'));
  assert.ok(result.errors.some((item) => item.code === 'dna_dimension_not_approved'));
});

test('extensions require namespaced, attributable metadata and remain digest-covered', () => {
  const validInput = validStateInput();
  validInput.strategy.extensions = {
    'provider.trace-data': {
      version: '1.0.0',
      owner: 'test-provider',
      generatedBy: 'test-run',
      required: false,
      retentionPolicy: 'project-lifetime',
      traceId: 'trace-1'
    }
  };
  assert.equal(validateCreativeDecisionState(finalizeCreativeDecisionState(validInput)).valid, true);

  const invalidInput = validStateInput();
  invalidInput.extensions = { trace: { version: '1.0.0' } };
  const result = validateCreativeDecisionState(finalizeCreativeDecisionState(invalidInput));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.code === 'extension_key_not_namespaced'));
  assert.ok(result.errors.some((item) => item.code === 'extension_source_required'));
});

test('store keeps one immutable active State and requires an explicit replacement chain', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-state-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));

  const first = buildValidState();
  const activated = await activateCreativeDecisionState(projectRoot, first);
  assert.equal(activated.changed, true);
  const activeFirst = await readCreativeDecisionState(projectRoot);
  assert.equal(activeFirst.meta.decisionId, 'decision-1');
  assert.equal(Object.isFrozen(activeFirst), true);
  assert.equal(Object.isFrozen(activeFirst.strategy.actions), true);
  assert.throws(() => { activeFirst.strategy.thesis = 'Compiler mutation'; }, TypeError);

  const idempotent = await activateCreativeDecisionState(projectRoot, first);
  assert.equal(idempotent.changed, false);

  const mutated = structuredClone(first);
  mutated.strategy.thesis = 'A different approved decision with the same ID.';
  const refinalizedMutation = finalizeCreativeDecisionState(mutated);
  await assert.rejects(
    activateCreativeDecisionState(projectRoot, refinalizedMutation),
    (error) => error.code === 'APPROVED_STATE_IMMUTABLE'
  );

  const wrongChain = buildValidState({ decisionId: 'decision-2', supersedesDecisionId: 'another-decision' });
  await assert.rejects(
    activateCreativeDecisionState(projectRoot, wrongChain),
    (error) => error.code === 'SUPERSEDES_MISMATCH'
  );

  const second = buildValidState({ decisionId: 'decision-2', supersedesDecisionId: 'decision-1' });
  const replaced = await activateCreativeDecisionState(projectRoot, second);
  assert.equal(replaced.changed, true);
  assert.equal(replaced.previousDecisionId, 'decision-1');
  assert.equal((await readCreativeDecisionState(projectRoot)).meta.decisionId, 'decision-2');

  const stateDirectory = path.dirname(getCreativeDecisionStatePath(projectRoot));
  assert.deepEqual(await fs.readdir(stateDirectory), ['creative-decision.json']);
});
