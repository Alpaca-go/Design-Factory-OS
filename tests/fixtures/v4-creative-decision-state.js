import { finalizeCreativeDecisionState } from '../../src/creative-decision-state.js';

const AT = '2026-07-15T08:00:00.000Z';
const EVIDENCE = 'evidence.asset.logo';
const RATIONALE = 'rationale.identity';

function text(statement, displayOrder, extra = {}) {
  return { ...extra, statement, status: 'approved', evidenceRefs: [EVIDENCE], displayOrder };
}

function dna() {
  return Object.fromEntries([
    'logo', 'color', 'typography', 'composition', 'whitespace',
    'photography', 'materials', 'packaging', 'craft'
  ].map((id, index) => [id, {
    directive: `${id} approved directive`, elementRefs: ['brand.logo'], evidenceRefs: [EVIDENCE],
    status: 'approved', displayOrder: index + 1
  }]));
}

export function createV4CompilerState(overrides = {}) {
  const input = {
    meta: {
      decisionId: overrides.decisionId || 'decision-compiler-test',
      projectId: 'project-compiler-test', projectVersion: '4.0-test', status: 'approved',
      createdAt: AT, approvedAt: AT
    },
    provenance: {
      inputDigests: {
        assetManifest: 'digest-assets', projectContract: 'digest-contract', projectConfig: 'digest-config',
        brandUnderstanding: 'digest-brand', industryBenchmark: 'digest-benchmark'
      },
      reasoningRuns: {
        brandUnderstanding: { runId: 'run-brand', provider: 'test', model: 'test-model', completedAt: AT },
        industryBenchmark: { runId: 'run-benchmark', provider: 'test', model: 'test-model', completedAt: AT },
        creativeDecision: { runId: 'run-decision', provider: 'test', model: 'test-model', completedAt: AT }
      },
      reasoningContractDigest: 'digest-reasoning-contract',
      sourceTimestamps: [{ sourceId: 'source-logo', observedAt: AT }],
      evidenceIndex: [{
        evidenceId: EVIDENCE, sourceType: 'asset', sourceId: 'source-logo', locator: 'input/logo.svg',
        summary: 'EVIDENCE_SECRET', observedAt: AT, sourceDigest: 'digest-logo', confidentiality: 'project-private',
        extensions: {
          'provider.trace-data': {
            version: '1.0.0', owner: 'test', generatedBy: 'fixture', required: false,
            retentionPolicy: 'project-lifetime', marker: 'EXTENSION_SECRET'
          }
        }
      }],
      dataPolicyRef: 'policy.project-private'
    },
    brand: {
      context: { industry: 'tea', category: 'premium tea', projectType: 'identity evolution' },
      originalIntent: text('Preserve calm recognition.', 1),
      identity: text('Recognized by the approved wordmark.', 2),
      positioning: text('Contemporary premium tea.', 3),
      personality: {
        statement: 'Calm, precise, tactile.', desired: ['calm', 'precise'], avoid: ['noisy'], evidenceRefs: [EVIDENCE]
      },
      currentVisualAssessment: {
        summary: 'COMPETITOR_SECRET SHOULD_NOT_APPEAR_BRIEF', maturity: 'established',
        strengths: ['recognizable'], weaknesses: ['flat'], outdatedAreas: ['lighting'], evidenceRefs: [EVIDENCE]
      },
      elements: [
        { elementId: 'brand.logo', name: 'Wordmark', kind: 'logo', definition: 'Approved geometry', verificationStatus: 'verified', evidenceRefs: [EVIDENCE] },
        { elementId: 'brand.material', name: 'Material', kind: 'material', definition: 'Surface system', verificationStatus: 'verified', evidenceRefs: [EVIDENCE] },
        { elementId: 'brand.composition', name: 'Composition', kind: 'composition', definition: 'Campaign composition', verificationStatus: 'verified', evidenceRefs: [EVIDENCE] }
      ],
      approvedBrandDNA: { status: 'approved', dimensions: dna() },
      extensions: {}
    },
    strategy: {
      creativeFreedom: {
        recommendation: {
          freedom: 60, mode: 'Creative Evolution', confidence: 'High',
          why: ['FULL_WHY_SECRET'], briefWhy: ['Short approved reason.']
        },
        factors: [{
          factorId: 'factor-dna', factorType: 'brand-dna', conclusion: 'Identity is stable.',
          evidenceRefs: [EVIDENCE], displayOrder: 1
        }],
        humanOverride: { type: 'auto' },
        effective: { freedom: 60, mode: 'Creative Evolution', source: 'ai' }
      },
      creativeVision: { statement: 'Contemporary depth with calm recognition.', direction: 'Tactile restraint.' },
      thesis: 'Protect recognition while upgrading execution.',
      actions: [
        {
          actionId: 'action.lock-logo', actionType: 'locked', domain: 'identity', elementRefs: ['brand.logo'],
          directive: 'Keep wordmark geometry unchanged.', transformationDepth: 'none',
          rationaleRefs: [RATIONALE], evidenceRefs: [EVIDENCE], displayOrder: 1
        },
        {
          actionId: 'action.evolve-material', actionType: 'evolve', domain: 'materials', elementRefs: ['brand.material'],
          directive: 'Upgrade materials and lighting.', transformationDepth: 'expression-only', identityGuardRefs: ['brand.logo'],
          rationaleRefs: [RATIONALE], evidenceRefs: [EVIDENCE], displayOrder: 2
        },
        {
          actionId: 'action.flex-composition', actionType: 'flexible', domain: 'composition', elementRefs: ['brand.composition'],
          directive: 'Redesign campaign composition.', transformationDepth: 'full redesign',
          rationaleRefs: [RATIONALE], evidenceRefs: [EVIDENCE], displayOrder: 3
        }
      ],
      indexes: {
        lockedActionIds: ['action.lock-logo'], evolveActionIds: ['action.evolve-material'],
        flexibleActionIds: ['action.flex-composition']
      },
      creativePrinciples: [text('Recognition precedes novelty.', 1, { principleId: 'principle.recognition' })],
      photographyDirection: {
        lighting: 'Directional soft light', framing: 'Editorial close crop', depth: 'Layered shallow depth',
        materials: 'Tactile natural surfaces', atmosphere: 'Quiet confidence'
      },
      designGoal: 'Create a contemporary campaign without changing brand recognition.',
      extensions: {}
    },
    constraints: {
      elementPolicies: [
        {
          policyId: 'policy.lock-logo', elementRef: 'brand.logo', classification: 'locked',
          directive: 'Do not alter wordmark geometry.', reasonRef: RATIONALE, evidenceRefs: [EVIDENCE], displayOrder: 1
        },
        {
          policyId: 'policy.evolve-material', elementRef: 'brand.material', classification: 'evolve',
          directive: 'Upgrade execution while protecting identity.', identityGuardRefs: ['policy.lock-logo'],
          reasonRef: RATIONALE, evidenceRefs: [EVIDENCE], displayOrder: 2
        },
        {
          policyId: 'policy.flex-composition', elementRef: 'brand.composition', classification: 'flexible',
          directive: 'Composition may be redesigned.', reasonRef: RATIONALE, evidenceRefs: [EVIDENCE], displayOrder: 3
        }
      ],
      forbiddenDirections: [{
        ruleId: 'rule.no-logo-change', statement: 'Never alter the wordmark geometry.', appliesToRefs: ['brand.logo'],
        rationaleRef: RATIONALE, evidenceRefs: [EVIDENCE], displayOrder: 1
      }],
      unresolved: [], conflicts: [], extensions: {}
    },
    creativeBrief: {},
    decisionRecord: {
      statement: 'Keep identity, evolve execution, allow composition redesign.',
      rationale: [{ rationaleId: RATIONALE, statement: 'RATIONALE_SECRET', evidenceRefs: [EVIDENCE], displayOrder: 1 }],
      tradeoffs: [{ tradeoffId: 'tradeoff-1', statement: 'Accept less novelty in the wordmark.', evidenceRefs: [EVIDENCE], displayOrder: 1 }],
      rejectedDirections: [{ directionId: 'rejected-1', statement: 'Reject wordmark redesign.', evidenceRefs: [EVIDENCE], displayOrder: 1 }],
      overrideAudit: { summary: 'No human override.' }, extensions: {}
    },
    governance: {
      approvals: {
        brandDNA: { status: 'approved', approvedBy: 'owner', approvedAt: AT },
        creativeDecision: { status: 'approved', approvedBy: 'owner', approvedAt: AT }
      },
      blockers: [], warnings: [], extensions: {}
    },
    extensions: {}
  };
  return finalizeCreativeDecisionState(input);
}
