import { arrayValue } from '../../../shared/analysis/runtime-contracts.js';
import { SPRINT_2_RUNTIME_MODULES } from '../protocol/sprint-2-stage-registry.js';
import { validateAnchorConfirmationRecord } from '../schemas/anchor-confirmation-v1.js';
import { validateAnchorDirection } from '../schemas/anchor-direction-v1.js';
import { validateSprint2Input } from '../schemas/sprint-2-input-v1.js';
import { evidenceId, fail } from '../schemas/sprint-2-schema-utils.js';
import { validateVisualDna } from '../schemas/visual-dna-v1.js';
import { validateVisualGrammar, validateVisualGrammarStage } from '../schemas/visual-grammar-v1.js';
import { compileConsistencyRules } from './compile-consistency-rules.js';
import { compileGenerationBoundary } from './compile-generation-boundary.js';
import { evaluateAnchorCandidateDifferenceMatrix } from './evaluate-anchor-candidate-difference.js';
import { buildSprint2RuntimeCheckpoint, validateSprint2RuntimeCheckpoint } from './sprint-2-runtime-checkpoint-store.js';
import { evaluateSprint2AntiPatterns } from './sprint-2-semantic-evaluator.js';

const GRAMMAR_STAGES = Object.freeze({
  shape_composition_grammar: Object.freeze(['shape_grammar', 'composition_grammar']),
  material_lighting_grammar: Object.freeze(['material_grammar', 'lighting_grammar']),
  motion_information_grammar: Object.freeze(['motion_grammar', 'information_grammar'])
});

export async function runVisualLanguageConstruction({
  input,
  providerAdapter,
  evaluator,
  anchorConfirmationRecord,
  resumeCheckpoint,
  retryModules = [],
  onCheckpoint,
  clock = () => new Date().toISOString()
}) {
  assertRuntimeDependencies(providerAdapter, evaluator);
  const inputContract = validateSprint2Input(input);
  const state = resumeCheckpoint
    ? stateFromCheckpoint(validateSprint2RuntimeCheckpoint(resumeCheckpoint), inputContract, providerAdapter, evaluator)
    : initialState(inputContract, providerAdapter, evaluator, timestamp(clock()));
  const retrySet = validateRetryRequest(retryModules, state);
  const evidenceIds = new Set(inputContract.evidence_index.map((item, index) => evidenceId(item, `sprint2Input.evidence_index[${index}]`)));

  const publish = async () => {
    state.updated_at = timestamp(clock());
    const checkpoint = buildSprint2RuntimeCheckpoint(state);
    await onCheckpoint?.(checkpoint);
    return checkpoint;
  };

  const execute = async (module, action) => {
    const current = state.module_status[module];
    if (current.status === 'passed') return true;
    if (current.status === 'failed' && !retrySet.has(module)) return false;
    state.status = 'running';
    state.failed_module = null;
    current.status = 'running';
    current.attempts += 1;
    current.last_error = null;
    const startedAt = timestamp(clock());
    try {
      await action();
      current.status = 'passed';
      state.retry_history.push(history(module, current.attempts, startedAt, timestamp(clock()), 'passed', null));
      await publish();
      return true;
    } catch (error) {
      current.status = 'failed';
      current.last_error = error instanceof Error ? error.message : String(error);
      state.status = 'failed';
      state.failed_module = module;
      state.retry_history.push(history(module, current.attempts, startedAt, timestamp(clock()), 'failed', current.last_error));
      await publish();
      return false;
    }
  };

  if (!await execute('anchor_candidates', async () => {
    const rawCandidates = arrayValue(await providerAdapter.constructAnchorCandidates({ input: structuredClone(inputContract) }), 'anchorCandidates', { min: 2, max: 3 });
    const candidates = rawCandidates.map((candidate) => validateAnchorDirection(candidate, { evidenceIds, allowCandidateTypes: true }));
    if (new Set(candidates.map((candidate) => candidate.anchor_id)).size !== candidates.length) fail('Anchor Candidate IDs must be unique', 'anchorCandidates');
    let evaluations = [];
    for (const candidate of candidates) {
      evaluations.push(await evaluateSprint2AntiPatterns({ evaluator, module: 'anchor_direction', subjectId: candidate.anchor_id, output: candidate, context: inputContract }));
    }
    if (evaluations.some((evaluation) => evaluation.status === 'evaluated') && !evaluations.some((evaluation) => evaluation.passed)) {
      throw new Error('No Anchor Candidate passed semantic validation');
    }
    let calibratedCandidates = candidates;
    let differenceMatrix = await evaluateAnchorCandidateDifferenceMatrix({ candidates: calibratedCandidates, evaluator, context: inputContract });
    state.anchor_candidates = calibratedCandidates;
    state.anchor_evaluation_results = evaluations;
    state.anchor_candidate_difference_matrix = differenceMatrix;
    if (differenceMatrix.status === 'repair') {
      if (typeof providerAdapter.reconstructAnchorCandidate !== 'function') throw new Error('Homogeneous Anchor Candidates require reconstructAnchorCandidate()');
      for (const candidateId of differenceMatrix.retry_candidate_ids) {
        const replacement = validateAnchorDirection(await providerAdapter.reconstructAnchorCandidate({
          input: structuredClone(inputContract),
          candidate_to_replace: candidateId,
          preserved_candidates: structuredClone(calibratedCandidates.filter((candidate) => candidate.anchor_id !== candidateId)),
          failing_pairs: structuredClone(differenceMatrix.pairs.filter((pair) => pair.candidate_ids.includes(candidateId)))
        }), { evidenceIds, allowCandidateTypes: true });
        if (replacement.anchor_id !== candidateId) fail('Targeted Anchor reconstruction must preserve Candidate ID', 'anchorCandidate.anchor_id');
        const replacementEvaluation = await evaluateSprint2AntiPatterns({ evaluator, module: 'anchor_direction', subjectId: candidateId, output: replacement, context: inputContract });
        if (replacementEvaluation.status === 'evaluated' && !replacementEvaluation.passed) throw new Error(`Reconstructed Anchor Candidate failed semantic validation: ${candidateId}`);
        calibratedCandidates = calibratedCandidates.map((candidate) => candidate.anchor_id === candidateId ? replacement : candidate);
        evaluations = evaluations.map((evaluation) => evaluation.subject_id === candidateId ? replacementEvaluation : evaluation);
        state.candidate_retry_history.push({ candidate_id: candidateId, reason: 'candidate_difference_below_7', attempt: 1 });
        state.anchor_candidates = calibratedCandidates;
        state.anchor_evaluation_results = evaluations;
      }
      differenceMatrix = await evaluateAnchorCandidateDifferenceMatrix({ candidates: calibratedCandidates, evaluator, context: inputContract });
      state.anchor_candidate_difference_matrix = differenceMatrix;
      if (differenceMatrix.status === 'repair') throw new Error('Targeted Anchor Candidate reconstruction did not reach the 7/12 difference threshold');
    }
    state.anchor_candidates = calibratedCandidates;
    state.anchor_evaluation_results = evaluations;
    state.anchor_candidate_difference_matrix = differenceMatrix;
  })) return result(await publish());

  if (!state.anchor_confirmation_record) {
    if (!anchorConfirmationRecord) {
      state.status = 'awaiting_anchor_confirmation';
      state.failed_module = null;
      return result(await publish());
    }
    if (!await execute('anchor_confirmation', async () => {
      const record = validateAnchorConfirmationRecord(anchorConfirmationRecord, { candidates: state.anchor_candidates, evaluations: state.anchor_evaluation_results });
      const selected = state.anchor_candidates.find((candidate) => candidate.anchor_id === record.selected_anchor_id);
      const confirmedAnchor = validateAnchorDirection({ ...structuredClone(selected), status: 'confirmed' }, { evidenceIds });
      state.anchor_confirmation_record = record;
      state.confirmed_anchor = confirmedAnchor;
    })) return result(await publish());
  }

  const anchorIds = anchorIdSet(state.confirmed_anchor);
  if (!await execute('visual_dna', async () => {
    const primary_dna = await providerAdapter.constructPrimaryDna({ input: structuredClone(inputContract), confirmed_anchor: structuredClone(state.confirmed_anchor) });
    const supporting = await providerAdapter.constructSupportingDna({
      input: structuredClone(inputContract),
      confirmed_anchor: structuredClone(state.confirmed_anchor),
      primary_dna: structuredClone(primary_dna)
    });
    const visualDna = validateVisualDna({
      primary_dna,
      supporting_dna: supporting.supporting_dna,
      forbidden_mutations: supporting.forbidden_mutations
    }, { evidenceIds, anchorIds });
    const evaluation = await evaluateSprint2AntiPatterns({ evaluator, module: 'visual_dna', subjectId: 'visual_dna', output: visualDna, context: { input: inputContract, confirmed_anchor: state.confirmed_anchor } });
    state.semantic_evaluation_results.visual_dna = evaluation;
    if (!evaluation.passed) throw new Error('Visual DNA failed semantic anti-pattern validation');
    state.visual_dna = visualDna;
  })) return result(await publish());

  for (const [module, categories] of Object.entries(GRAMMAR_STAGES)) {
    if (!await execute(module, async () => {
      const inheritedGrammar = Object.fromEntries(
        Object.entries(state.visual_grammar).filter(([category]) => !categories.includes(category))
      );
      const raw = await providerAdapter.constructGrammarStage({
        stage: module,
        categories: [...categories],
        input: structuredClone(inputContract),
        confirmed_anchor: structuredClone(state.confirmed_anchor),
        visual_dna: structuredClone(state.visual_dna),
        inherited_grammar: structuredClone(inheritedGrammar)
      });
      const stageGrammar = validateVisualGrammarStage(raw, categories, { anchorIds });
      const candidateGrammar = { ...inheritedGrammar, ...stageGrammar };
      const evaluation = await evaluateSprint2AntiPatterns({
        evaluator,
        module: 'visual_grammar',
        subjectId: module,
        output: candidateGrammar,
        context: { input: inputContract, confirmed_anchor: state.confirmed_anchor, visual_dna: state.visual_dna }
      });
      state.semantic_evaluation_results[module] = evaluation;
      if (!evaluation.passed) throw new Error(`${module} failed semantic anti-pattern validation`);
      state.visual_grammar = module === 'motion_information_grammar'
        ? validateVisualGrammar(candidateGrammar, { anchorIds })
        : candidateGrammar;
    })) return result(await publish());
  }

  if (!await execute('consistency_rules', async () => {
    state.consistency_rules = compileConsistencyRules({ input: inputContract, anchor: state.confirmed_anchor, visualDna: state.visual_dna, visualGrammar: state.visual_grammar });
  })) return result(await publish());

  if (!await execute('generation_boundary', async () => {
    state.generation_boundary = compileGenerationBoundary({ input: inputContract, anchor: state.confirmed_anchor, visualDna: state.visual_dna, visualGrammar: state.visual_grammar });
  })) return result(await publish());

  state.status = 'completed';
  state.failed_module = null;
  return result(await publish());
}

function initialState(input, provider, evaluator, createdAt) {
  return {
    input_contract: input,
    anchor_candidates: [], anchor_evaluation_results: [], anchor_candidate_difference_matrix: null, candidate_retry_history: [],
    anchor_confirmation_record: null, confirmed_anchor: null,
    visual_dna: null, visual_grammar: {}, consistency_rules: null, generation_boundary: null,
    semantic_evaluation_results: {},
    module_status: Object.fromEntries(SPRINT_2_RUNTIME_MODULES.map((module) => [module, { status: 'pending', attempts: 0, last_error: null }])),
    retry_history: [], provider_adapter_version: provider.version, evaluator_version: evaluator?.version || 'not_evaluated',
    source_hash: undefined, created_at: createdAt, updated_at: createdAt, status: 'running', failed_module: null
  };
}

function stateFromCheckpoint(checkpoint, input, provider, evaluator) {
  if (checkpoint.source_hash !== buildSprint2RuntimeCheckpoint(initialState(input, provider, evaluator, checkpoint.created_at)).source_hash) throw new Error('Resume checkpoint does not match Sprint 2 Input Contract');
  if (checkpoint.provider_adapter_version !== provider.version || checkpoint.evaluator_version !== (evaluator?.version || 'not_evaluated')) throw new Error('Resume checkpoint Provider Adapter or Evaluator version changed');
  return structuredClone(checkpoint);
}

function validateRetryRequest(modules, state) {
  const values = new Set(modules);
  for (const module of values) {
    if (!SPRINT_2_RUNTIME_MODULES.includes(module)) throw new TypeError(`Unknown Sprint 2 retry module: ${module}`);
    if (state.module_status[module].status !== 'failed') throw new Error(`Only a failed module can be retried: ${module}`);
    if (module === 'anchor_candidates' && state.anchor_confirmation_record) throw new Error('Confirmed Anchor prevents Anchor Candidate regeneration');
  }
  return values;
}

function assertRuntimeDependencies(provider, evaluator) {
  if (!provider?.version || typeof provider.constructAnchorCandidates !== 'function') throw new TypeError('A Provider-neutral Visual Language Adapter is required');
  if (evaluator && (!evaluator.version || typeof evaluator.evaluate !== 'function')) throw new TypeError('Injected Sprint 2 Semantic Evaluator is invalid');
}

function anchorIdSet(anchor) {
  return new Set([anchor.anchor_id, anchor.primary_anchor.anchor_component_id, ...anchor.supporting_anchors.map((item) => item.anchor_component_id)]);
}

function history(module, attempt, started_at, completed_at, status, error) {
  return { module, attempt, started_at, completed_at, status, error };
}

function timestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new TypeError('clock must return a valid timestamp');
  return parsed.toISOString();
}

function result(checkpoint) {
  return Object.freeze({ status: checkpoint.status, failed_module: checkpoint.failed_module, checkpoint });
}
