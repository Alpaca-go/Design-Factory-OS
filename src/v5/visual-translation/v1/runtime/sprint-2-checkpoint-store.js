import fs from 'node:fs/promises';
import path from 'node:path';
import { valueHash } from '../../../shared/analysis/checkpoint-store.js';
import { objectValue, enumValue, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { VISUAL_TRANSLATION_SPRINT_2A } from '../protocol/sprint-2-stage-registry.js';
import { validateSprint2Input } from '../schemas/sprint-2-input-v1.js';
import { validateSprint2LanguageSystem } from '../schemas/sprint-2-language-system-v1.js';
import { deepFreeze, fail, validateHash, validateTimestamp } from '../schemas/sprint-2-schema-utils.js';

const FILE_NAME = 'sprint-2-checkpoint-v1.json';

export function buildSprint2Checkpoint({ input, languageSystem, createdAt = new Date().toISOString(), status = 'pending_anchor_confirmation' }) {
  const input_contract = validateSprint2Input(input);
  const validatedSystem = validateSprint2LanguageSystem(languageSystem, input_contract);
  const source_hash = valueHash(input_contract);
  const checkpoint = {
    protocol_version: VISUAL_TRANSLATION_SPRINT_2A.protocolVersion,
    schema_version: VISUAL_TRANSLATION_SPRINT_2A.schemaVersion,
    checkpoint_version: VISUAL_TRANSLATION_SPRINT_2A.checkpointVersion,
    stage_id: VISUAL_TRANSLATION_SPRINT_2A.checkpointStageId,
    project_id: input_contract.project_id,
    run_id: input_contract.run_id,
    document_set_hash: input_contract.document_set_hash,
    sprint_1_source_reference: {
      protocol_version: 'visual-translation-v1',
      stage_id: '05-direction-recommendation',
      project_id: input_contract.project_id,
      run_id: input_contract.run_id,
      document_set_hash: input_contract.document_set_hash,
      selected_direction_id: input_contract.selected_direction_id,
      source_hash
    },
    input_contract,
    selected_direction: structuredClone(input_contract.selected_direction),
    ...validatedSystem,
    source_hash,
    created_at: validateTimestamp(createdAt, 'sprint2Checkpoint.created_at'),
    status: enumValue(status, VISUAL_TRANSLATION_SPRINT_2A.checkpointStatus, 'sprint2Checkpoint.status')
  };
  checkpoint.output_hash = valueHash(languagePayload(checkpoint));
  return deepFreeze(checkpoint);
}

export function validateSprint2Checkpoint(value) {
  const root = objectValue(value, 'sprint2Checkpoint');
  for (const [field, expected] of [
    ['protocol_version', VISUAL_TRANSLATION_SPRINT_2A.protocolVersion],
    ['schema_version', VISUAL_TRANSLATION_SPRINT_2A.schemaVersion],
    ['checkpoint_version', VISUAL_TRANSLATION_SPRINT_2A.checkpointVersion],
    ['stage_id', VISUAL_TRANSLATION_SPRINT_2A.checkpointStageId]
  ]) {
    if (stringValue(root[field], `sprint2Checkpoint.${field}`) !== expected) fail(`sprint2Checkpoint.${field} is incompatible`, `sprint2Checkpoint.${field}`);
  }
  const input_contract = validateSprint2Input(root.input_contract);
  const languageSystem = validateSprint2LanguageSystem(root, input_contract);
  if (root.project_id !== input_contract.project_id || root.run_id !== input_contract.run_id || root.document_set_hash !== input_contract.document_set_hash) {
    fail('Sprint 2 checkpoint locator must match its input contract', 'sprint2Checkpoint');
  }
  if (JSON.stringify(root.selected_direction) !== JSON.stringify(input_contract.selected_direction)) fail('Checkpoint selected_direction must match its input contract', 'sprint2Checkpoint.selected_direction');
  const source_hash = validateHash(root.source_hash, 'sprint2Checkpoint.source_hash');
  if (source_hash !== valueHash(input_contract)) fail('Sprint 2 checkpoint source_hash does not match its input contract', 'sprint2Checkpoint.source_hash');
  const sourceReference = objectValue(root.sprint_1_source_reference, 'sprint2Checkpoint.sprint_1_source_reference');
  for (const field of ['protocol_version', 'stage_id', 'project_id', 'run_id', 'document_set_hash', 'selected_direction_id', 'source_hash']) stringValue(sourceReference[field], `sprint2Checkpoint.sprint_1_source_reference.${field}`);
  if (sourceReference.project_id !== input_contract.project_id
    || sourceReference.run_id !== input_contract.run_id
    || sourceReference.document_set_hash !== input_contract.document_set_hash
    || sourceReference.selected_direction_id !== input_contract.selected_direction_id
    || sourceReference.source_hash !== source_hash) {
    fail('Sprint 1 source reference does not match the input contract', 'sprint2Checkpoint.sprint_1_source_reference');
  }
  const normalized = {
    protocol_version: VISUAL_TRANSLATION_SPRINT_2A.protocolVersion,
    schema_version: VISUAL_TRANSLATION_SPRINT_2A.schemaVersion,
    checkpoint_version: VISUAL_TRANSLATION_SPRINT_2A.checkpointVersion,
    stage_id: VISUAL_TRANSLATION_SPRINT_2A.checkpointStageId,
    project_id: input_contract.project_id,
    run_id: input_contract.run_id,
    document_set_hash: input_contract.document_set_hash,
    sprint_1_source_reference: structuredClone(sourceReference),
    input_contract,
    selected_direction: structuredClone(input_contract.selected_direction),
    ...languageSystem,
    source_hash,
    created_at: validateTimestamp(root.created_at, 'sprint2Checkpoint.created_at'),
    status: enumValue(root.status, VISUAL_TRANSLATION_SPRINT_2A.checkpointStatus, 'sprint2Checkpoint.status')
  };
  const output_hash = validateHash(root.output_hash, 'sprint2Checkpoint.output_hash');
  if (output_hash !== valueHash(languagePayload(normalized))) fail('Sprint 2 checkpoint output_hash does not match its language system', 'sprint2Checkpoint.output_hash');
  return deepFreeze({ ...normalized, output_hash });
}

export function createSprint2CheckpointStore({ rootDir }) {
  if (typeof rootDir !== 'string' || !rootDir.trim()) throw new TypeError('rootDir is required');
  const root = path.resolve(rootDir);
  return Object.freeze({
    async save(checkpoint) {
      const validated = validateSprint2Checkpoint(checkpoint);
      const file = checkpointPath(root, validated);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
      return { file, checkpoint: structuredClone(validated) };
    },
    async load({ project_id, run_id }) {
      const file = checkpointPath(root, { project_id, run_id });
      try {
        return validateSprint2Checkpoint(JSON.parse(await fs.readFile(file, 'utf8')));
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    }
  });
}

function languagePayload(value) {
  return {
    anchor_direction: value.anchor_direction,
    visual_dna: value.visual_dna,
    visual_grammar: value.visual_grammar,
    consistency_rules: value.consistency_rules,
    generation_boundary: value.generation_boundary
  };
}

function checkpointPath(root, locator) {
  const projectId = safeSegment(locator.project_id, 'project_id');
  const runId = safeSegment(locator.run_id, 'run_id');
  const target = path.resolve(root, projectId, runId, 'sprint-2', FILE_NAME);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Sprint 2 checkpoint path escapes rootDir');
  return target;
}

function safeSegment(value, field) {
  const segment = String(value || '').trim();
  if (!segment || segment === '.' || segment === '..' || /[\\/:*?"<>|\u0000-\u001f]/u.test(segment)) throw new TypeError(`Invalid ${field}`);
  return segment;
}
