import { valueHash } from '../../../shared/analysis/checkpoint-store.js';
import { validateAnchorConfirmationRecord } from '../schemas/anchor-confirmation-v1.js';
import { validateAnchorDirection } from '../schemas/anchor-direction-v1.js';
import { evidenceId } from '../schemas/sprint-2-schema-utils.js';
import { buildSprint2RuntimeCheckpoint, validateSprint2RuntimeCheckpoint } from './sprint-2-runtime-checkpoint-store.js';

export function applyAnchorConfirmationReview(checkpoint, review, { clock = () => new Date().toISOString() } = {}) {
  const current = validateSprint2RuntimeCheckpoint(checkpoint);
  const record = validateAnchorConfirmationRecord(review, {
    candidates: current.anchor_candidates,
    evaluations: current.anchor_evaluation_results
  });
  if (current.anchor_confirmation_record) {
    if (current.anchor_confirmation_record.selected_anchor_id !== record.selected_anchor_id) {
      throw new Error('Confirmed Anchor selection cannot be replaced by an idempotent review update');
    }
    if (valueHash(current.anchor_confirmation_record) === valueHash(record)) return current;
  }
  const evidenceIds = new Set(current.input_contract.evidence_index.map((item, index) => evidenceId(item, `sprint2Input.evidence_index[${index}]`)));
  const selected = current.anchor_candidates.find((candidate) => candidate.anchor_id === record.selected_anchor_id);
  const confirmedAnchor = validateAnchorDirection({ ...structuredClone(selected), status: 'confirmed' }, { evidenceIds });
  const state = structuredClone(current);
  state.anchor_confirmation_record = record;
  state.confirmed_anchor = confirmedAnchor;
  state.module_status.anchor_confirmation = {
    status: 'passed',
    attempts: Math.max(1, state.module_status.anchor_confirmation.attempts),
    last_error: null
  };
  state.status = 'running';
  state.failed_module = null;
  state.updated_at = new Date(clock()).toISOString();
  return buildSprint2RuntimeCheckpoint(state);
}
