import fs from 'node:fs/promises';
import path from 'node:path';
import { valueHash } from '../../../shared/analysis/checkpoint-store.js';
import { enumValue, objectValue, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { SPRINT_2_RUNTIME_MODULES, VISUAL_TRANSLATION_SPRINT_2A } from '../protocol/sprint-2-stage-registry.js';
import { validateAnchorCandidateDifferenceMatrix } from '../schemas/anchor-candidate-difference-v1.js';
import { validateAnchorConfirmationRecord } from '../schemas/anchor-confirmation-v1.js';
import { validateAnchorDirection } from '../schemas/anchor-direction-v1.js';
import { validateConsistencyRules } from '../schemas/consistency-rules-v1.js';
import { validateGenerationBoundary } from '../schemas/generation-boundary-v1.js';
import { validateSprint2Input } from '../schemas/sprint-2-input-v1.js';
import { deepFreeze, evidenceId, fail, validateHash, validateTimestamp } from '../schemas/sprint-2-schema-utils.js';
import { validateVisualDna } from '../schemas/visual-dna-v1.js';
import { GRAMMAR_CATEGORIES, validateVisualGrammar, validateVisualGrammarStage } from '../schemas/visual-grammar-v1.js';

const FILE_NAME = 'sprint-2-checkpoint-v2.json';
const MODULE_STATUSES = Object.freeze(['pending', 'running', 'passed', 'failed', 'blocked']);
const RUNTIME_STATUSES = Object.freeze(['running', 'awaiting_anchor_confirmation', 'failed', 'completed']);

export function buildSprint2RuntimeCheckpoint(state, { createdAt = state.created_at || new Date().toISOString() } = {}) {
  const normalized = normalizeState(state, createdAt);
  return deepFreeze({ ...normalized, output_hash: valueHash(runtimePayload(normalized)) });
}

export function validateSprint2RuntimeCheckpoint(value) {
  const root = objectValue(value, 'sprint2RuntimeCheckpoint');
  if (root.checkpoint_version !== VISUAL_TRANSLATION_SPRINT_2A.runtimeCheckpointVersion) fail('Sprint 2 Runtime checkpoint version is incompatible', 'sprint2RuntimeCheckpoint.checkpoint_version');
  const normalized = normalizeState(root, root.created_at);
  const output_hash = validateHash(root.output_hash, 'sprint2RuntimeCheckpoint.output_hash');
  if (output_hash !== valueHash(runtimePayload(normalized))) fail('Sprint 2 Runtime checkpoint output_hash is invalid', 'sprint2RuntimeCheckpoint.output_hash');
  return deepFreeze({ ...normalized, output_hash });
}

export function createSprint2RuntimeCheckpointStore({ rootDir }) {
  if (typeof rootDir !== 'string' || !rootDir.trim()) throw new TypeError('rootDir is required');
  const root = path.resolve(rootDir);
  return Object.freeze({
    async save(checkpoint) {
      const validated = validateSprint2RuntimeCheckpoint(checkpoint);
      const file = checkpointPath(root, validated.project_id, validated.run_id);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
      return { file, checkpoint: structuredClone(validated) };
    },
    async load({ project_id, run_id }) {
      const file = checkpointPath(root, project_id, run_id);
      try {
        return validateSprint2RuntimeCheckpoint(JSON.parse(await fs.readFile(file, 'utf8')));
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    }
  });
}

function normalizeState(state, createdAt) {
  const input_contract = validateSprint2Input(state.input_contract || state.input);
  const evidenceIds = new Set(input_contract.evidence_index.map((item, index) => evidenceId(item, `sprint2Input.evidence_index[${index}]`)));
  const anchor_candidates = (state.anchor_candidates || []).map((candidate) => validateAnchorDirection(candidate, { evidenceIds, allowCandidateTypes: true }));
  if (anchor_candidates.length && (anchor_candidates.length < 2 || anchor_candidates.length > 3)) fail('Sprint 2 Runtime requires 2–3 Anchor Candidates', 'sprint2RuntimeCheckpoint.anchor_candidates');
  if (new Set(anchor_candidates.map((item) => item.anchor_id)).size !== anchor_candidates.length) fail('Anchor Candidate IDs must be unique', 'sprint2RuntimeCheckpoint.anchor_candidates');
  const anchor_evaluation_results = normalizeEvaluations(state.anchor_evaluation_results || [], anchor_candidates);
  const anchor_candidate_difference_matrix = state.anchor_candidate_difference_matrix
    ? validateAnchorCandidateDifferenceMatrix(state.anchor_candidate_difference_matrix, anchor_candidates)
    : null;
  const candidate_retry_history = normalizeCandidateRetryHistory(state.candidate_retry_history || [], anchor_candidates);
  const anchor_confirmation_record = state.anchor_confirmation_record
    ? validateAnchorConfirmationRecord(state.anchor_confirmation_record, { candidates: anchor_candidates, evaluations: anchor_evaluation_results })
    : null;
  const confirmed_anchor = state.confirmed_anchor
    ? validateAnchorDirection(state.confirmed_anchor, { evidenceIds })
    : null;
  if (anchor_confirmation_record && confirmed_anchor?.anchor_id !== anchor_confirmation_record.selected_anchor_id) fail('Confirmed Anchor does not match Anchor Confirmation Record', 'sprint2RuntimeCheckpoint.confirmed_anchor');
  const anchorIds = confirmed_anchor ? new Set([confirmed_anchor.anchor_id, confirmed_anchor.primary_anchor.anchor_component_id, ...confirmed_anchor.supporting_anchors.map((item) => item.anchor_component_id)]) : new Set();
  const visual_dna = state.visual_dna ? validateVisualDna(state.visual_dna, { evidenceIds, anchorIds }) : null;
  const dnaIds = visual_dna ? new Set([...visual_dna.primary_dna, ...visual_dna.supporting_dna].map((item) => item.dna_id)) : new Set();
  const visual_grammar = normalizeGrammar(state.visual_grammar || {}, anchorIds);
  const consistency_rules = state.consistency_rules ? validateConsistencyRules(state.consistency_rules, { anchorIds, dnaIds }) : null;
  const generation_boundary = state.generation_boundary ? validateGenerationBoundary(state.generation_boundary, { allowedAssets: input_contract.allowed_assets, restrictedAssets: input_contract.restricted_assets }) : null;
  const module_status = normalizeModuleStatus(state.module_status);
  const retry_history = normalizeRetryHistory(state.retry_history || []);
  const status = enumValue(state.status, RUNTIME_STATUSES, 'sprint2RuntimeCheckpoint.status');
  const failed_module = state.failed_module || null;
  validateRuntimeState({
    anchor_candidates, anchor_evaluation_results, anchor_candidate_difference_matrix, anchor_confirmation_record, confirmed_anchor,
    visual_dna, visual_grammar, consistency_rules, generation_boundary, module_status, status, failed_module
  });
  const source_hash = validateHash(state.source_hash || valueHash(input_contract), 'sprint2RuntimeCheckpoint.source_hash');
  if (source_hash !== valueHash(input_contract)) fail('Sprint 2 Runtime source_hash does not match Input Contract', 'sprint2RuntimeCheckpoint.source_hash');
  return {
    protocol_version: VISUAL_TRANSLATION_SPRINT_2A.protocolVersion,
    runtime_version: VISUAL_TRANSLATION_SPRINT_2A.runtimeVersion,
    schema_version: VISUAL_TRANSLATION_SPRINT_2A.schemaVersion,
    checkpoint_version: VISUAL_TRANSLATION_SPRINT_2A.runtimeCheckpointVersion,
    stage_id: VISUAL_TRANSLATION_SPRINT_2A.checkpointStageId,
    project_id: input_contract.project_id,
    run_id: input_contract.run_id,
    document_set_hash: input_contract.document_set_hash,
    sprint_1_source_reference: state.sprint_1_source_reference || sourceReference(input_contract, source_hash),
    input_contract,
    selected_direction: structuredClone(input_contract.selected_direction),
    anchor_candidates,
    anchor_evaluation_results,
    anchor_candidate_difference_matrix,
    candidate_retry_history,
    anchor_confirmation_record,
    confirmed_anchor,
    visual_dna,
    visual_grammar,
    consistency_rules,
    generation_boundary,
    semantic_evaluation_results: structuredClone(state.semantic_evaluation_results || {}),
    module_status,
    retry_history,
    provider_adapter_version: stringValue(state.provider_adapter_version, 'sprint2RuntimeCheckpoint.provider_adapter_version'),
    evaluator_version: stringValue(state.evaluator_version, 'sprint2RuntimeCheckpoint.evaluator_version'),
    source_hash,
    created_at: validateTimestamp(createdAt, 'sprint2RuntimeCheckpoint.created_at'),
    updated_at: validateTimestamp(state.updated_at || createdAt, 'sprint2RuntimeCheckpoint.updated_at'),
    status,
    failed_module
  };
}

function normalizeEvaluations(values, candidates) {
  const normalized = values.map((evaluation, index) => {
    const item = objectValue(evaluation, `anchorEvaluationResults[${index}]`);
    const subject_id = stringValue(item.subject_id, `anchorEvaluationResults[${index}].subject_id`);
    if (!candidates.some((candidate) => candidate.anchor_id === subject_id)) fail('Anchor evaluation references an unknown Candidate', `anchorEvaluationResults[${index}].subject_id`);
    const validPassed = typeof item.passed === 'boolean' || (item.passed === null && item.status === 'not_evaluated');
    if (!validPassed || !Array.isArray(item.findings)) fail('Anchor evaluation result is invalid', `anchorEvaluationResults[${index}]`);
    return structuredClone(item);
  });
  if (normalized.length !== candidates.length) fail('Every Anchor Candidate requires exactly one evaluation result', 'sprint2RuntimeCheckpoint.anchor_evaluation_results');
  if (new Set(normalized.map((item) => item.subject_id)).size !== normalized.length) fail('Anchor evaluation subjects must be unique', 'sprint2RuntimeCheckpoint.anchor_evaluation_results');
  return normalized;
}

function validateRuntimeState(value) {
  const hasConfirmation = Boolean(value.anchor_confirmation_record);
  if (hasConfirmation !== Boolean(value.confirmed_anchor)) fail('Anchor Confirmation Record and Confirmed Anchor must be saved together', 'sprint2RuntimeCheckpoint.anchor_confirmation_record');
  if (value.visual_dna && !value.confirmed_anchor) fail('Visual DNA requires a Confirmed Anchor', 'sprint2RuntimeCheckpoint.visual_dna');
  if (Object.keys(value.visual_grammar).length && !value.visual_dna) fail('Visual Grammar requires validated Visual DNA', 'sprint2RuntimeCheckpoint.visual_grammar');
  if ((value.consistency_rules || value.generation_boundary) && Object.keys(value.visual_grammar).length !== GRAMMAR_CATEGORIES.length) {
    fail('Consistency Rules and Generation Boundary require complete Visual Grammar', 'sprint2RuntimeCheckpoint.visual_grammar');
  }

  const requiredOutputs = {
    anchor_candidates: value.anchor_candidates.length >= 2
      && value.anchor_evaluation_results.length === value.anchor_candidates.length
      && Boolean(value.anchor_candidate_difference_matrix),
    anchor_confirmation: hasConfirmation,
    visual_dna: Boolean(value.visual_dna),
    shape_composition_grammar: ['shape_grammar', 'composition_grammar'].every((key) => value.visual_grammar[key]),
    material_lighting_grammar: ['material_grammar', 'lighting_grammar'].every((key) => value.visual_grammar[key]),
    motion_information_grammar: ['motion_grammar', 'information_grammar'].every((key) => value.visual_grammar[key]),
    consistency_rules: Boolean(value.consistency_rules),
    generation_boundary: Boolean(value.generation_boundary)
  };
  for (const module of SPRINT_2_RUNTIME_MODULES) {
    if (value.module_status[module].status === 'passed' && !requiredOutputs[module]) fail(`Passed module is missing its validated output: ${module}`, `sprint2RuntimeCheckpoint.module_status.${module}`);
  }
  if (value.status === 'completed' && SPRINT_2_RUNTIME_MODULES.some((module) => value.module_status[module].status !== 'passed')) {
    fail('Completed Sprint 2 Runtime requires every module to pass', 'sprint2RuntimeCheckpoint.status');
  }
  if (value.status === 'awaiting_anchor_confirmation' && (value.module_status.anchor_candidates.status !== 'passed' || hasConfirmation)) {
    fail('Awaiting Anchor confirmation requires evaluated Candidates and no existing confirmation', 'sprint2RuntimeCheckpoint.status');
  }
  if (value.status === 'failed') {
    if (!SPRINT_2_RUNTIME_MODULES.includes(value.failed_module) || value.module_status[value.failed_module].status !== 'failed') {
      fail('Failed Sprint 2 Runtime must identify its failed module', 'sprint2RuntimeCheckpoint.failed_module');
    }
  } else if (value.failed_module !== null) {
    fail('failed_module is only allowed when Runtime status is failed', 'sprint2RuntimeCheckpoint.failed_module');
  }
}

function normalizeCandidateRetryHistory(values, candidates) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.anchor_id));
  return values.map((entry, index) => {
    const item = objectValue(entry, `candidate_retry_history[${index}]`);
    const candidate_id = stringValue(item.candidate_id, `candidate_retry_history[${index}].candidate_id`);
    if (!candidateIds.has(candidate_id)) fail('Candidate retry references an unknown Anchor Candidate', `candidate_retry_history[${index}].candidate_id`);
    return {
      candidate_id,
      reason: stringValue(item.reason, `candidate_retry_history[${index}].reason`),
      attempt: Number.isInteger(item.attempt) && item.attempt > 0 ? item.attempt : 1
    };
  });
}

function normalizeGrammar(value, anchorIds) {
  const keys = Object.keys(value);
  if (!keys.length) return {};
  const unknown = keys.filter((key) => !GRAMMAR_CATEGORIES.includes(key));
  if (unknown.length) fail(`Visual Grammar contains unknown categories: ${unknown.join(', ')}`, 'sprint2RuntimeCheckpoint.visual_grammar');
  if (keys.length === GRAMMAR_CATEGORIES.length) return validateVisualGrammar(value, { anchorIds });
  return validateVisualGrammarStage(value, keys, { anchorIds });
}

function normalizeModuleStatus(value) {
  const root = objectValue(value, 'sprint2RuntimeCheckpoint.module_status');
  return Object.fromEntries(SPRINT_2_RUNTIME_MODULES.map((module) => {
    const item = objectValue(root[module], `module_status.${module}`);
    return [module, {
      status: enumValue(item.status, MODULE_STATUSES, `module_status.${module}.status`),
      attempts: Number.isInteger(item.attempts) && item.attempts >= 0 ? item.attempts : 0,
      last_error: item.last_error === null || item.last_error === undefined ? null : stringValue(item.last_error, `module_status.${module}.last_error`)
    }];
  }));
}

function normalizeRetryHistory(values) {
  return values.map((entry, index) => {
    const item = objectValue(entry, `retry_history[${index}]`);
    return {
      module: enumValue(item.module, SPRINT_2_RUNTIME_MODULES, `retry_history[${index}].module`),
      attempt: Number.isInteger(item.attempt) && item.attempt > 0 ? item.attempt : 1,
      started_at: validateTimestamp(item.started_at, `retry_history[${index}].started_at`),
      completed_at: validateTimestamp(item.completed_at, `retry_history[${index}].completed_at`),
      status: enumValue(item.status, ['passed', 'failed'], `retry_history[${index}].status`),
      error: item.error === null || item.error === undefined ? null : stringValue(item.error, `retry_history[${index}].error`)
    };
  });
}

function sourceReference(input, sourceHash) {
  return {
    protocol_version: 'visual-translation-v1', stage_id: '05-direction-recommendation',
    project_id: input.project_id, run_id: input.run_id, document_set_hash: input.document_set_hash,
    selected_direction_id: input.selected_direction_id, source_hash: sourceHash
  };
}

function runtimePayload(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['output_hash'].includes(key)));
}

function checkpointPath(root, projectId, runId) {
  const target = path.resolve(root, safeSegment(projectId), safeSegment(runId), 'sprint-2', FILE_NAME);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Sprint 2 Runtime checkpoint path escapes rootDir');
  return target;
}

function safeSegment(value) {
  const segment = String(value || '').trim();
  if (!segment || /[\\/:*?"<>|\u0000-\u001f]/u.test(segment) || segment === '.' || segment === '..') throw new TypeError('Invalid Sprint 2 checkpoint locator');
  return segment;
}
