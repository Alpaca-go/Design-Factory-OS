import { arrayValue, enumValue, numberValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { VISUAL_TRANSLATION_SPRINT_2A } from '../protocol/sprint-2-stage-registry.js';
import {
  assertKnownReferences,
  deepFreeze,
  evidenceId,
  fail,
  validateAssetList,
  validateHash,
  validateTimestamp
} from './sprint-2-schema-utils.js';

export function validateSprint2Input(value) {
  const root = objectValue(value, 'sprint2Input');
  const project_id = stringValue(root.project_id, 'sprint2Input.project_id');
  const run_id = stringValue(root.run_id, 'sprint2Input.run_id');
  const document_set_hash = validateHash(root.document_set_hash, 'sprint2Input.document_set_hash');
  const selected_direction_id = stringValue(root.selected_direction_id, 'sprint2Input.selected_direction_id');
  const selected_direction = structuredClone(objectValue(root.selected_direction, 'sprint2Input.selected_direction'));
  const actualDirectionId = stringValue(selected_direction.directionId || selected_direction.direction_id || selected_direction.id, 'sprint2Input.selected_direction.id');
  if (actualDirectionId !== selected_direction_id) fail('selected_direction_id must match selected_direction', 'sprint2Input.selected_direction_id');

  const brand_context = structuredClone(objectValue(root.brand_context, 'sprint2Input.brand_context'));
  const locked_assets = stringArray(root.locked_assets, 'sprint2Input.locked_assets');
  const allowed = validateAssetList(root.allowed_assets, 'sprint2Input.allowed_assets');
  const restricted = validateAssetList(root.restricted_assets, 'sprint2Input.restricted_assets');
  const overlappingAssets = [...allowed.ids].filter((id) => restricted.ids.has(id));
  if (overlappingAssets.length) fail(`allowed_assets and restricted_assets overlap: ${overlappingAssets.join(', ')}`, 'sprint2Input.allowed_assets');

  const visual_signals = arrayValue(root.visual_signals, 'sprint2Input.visual_signals', { min: 1 }).map((item, index) => structuredClone(objectValue(item, `sprint2Input.visual_signals[${index}]`)));
  const evidence_index = arrayValue(root.evidence_index, 'sprint2Input.evidence_index', { min: 1 }).map((item, index) => structuredClone(objectValue(item, `sprint2Input.evidence_index[${index}]`)));
  const evidenceIds = evidence_index.map((item, index) => evidenceId(item, `sprint2Input.evidence_index[${index}]`));
  if (new Set(evidenceIds).size !== evidenceIds.length) fail('evidence_index contains duplicate Evidence IDs', 'sprint2Input.evidence_index');
  const selectedEvidenceIds = selected_direction.evidence_ids || selected_direction.evidenceIds || [];
  assertKnownReferences(stringArray(selectedEvidenceIds, 'sprint2Input.selected_direction.evidence_ids', { min: 1 }), new Set(evidenceIds), 'sprint2Input.selected_direction.evidence_ids', 'Evidence ID');

  const direction_risks = stringArray(root.direction_risks, 'sprint2Input.direction_risks');
  const score = objectValue(root.direction_score, 'sprint2Input.direction_score');
  const raw_score = numberValue(score.raw_score ?? score.base_score, 'sprint2Input.direction_score.raw_score', { min: 0, max: 100 });
  const confidence_adjusted_score = numberValue(score.confidence_adjusted_score ?? raw_score, 'sprint2Input.direction_score.confidence_adjusted_score', { min: 0, max: 100 });
  const risk_penalty = numberValue(score.risk_penalty, 'sprint2Input.direction_score.risk_penalty', { min: 0, max: 100 });
  const final_score = numberValue(score.final_score, 'sprint2Input.direction_score.final_score', { min: 0, max: 100 });
  const expectedFinal = Math.max(0, confidence_adjusted_score - risk_penalty);
  if (Math.abs(final_score - expectedFinal) > 0.11) fail('direction_score.final_score must equal max(0, confidence_adjusted_score - risk_penalty)', 'sprint2Input.direction_score.final_score');
  const penalty_reasons = stringArray(score.penalty_reasons || [], 'sprint2Input.direction_score.penalty_reasons');
  if (risk_penalty > 0 && penalty_reasons.length === 0) fail('A non-zero direction risk penalty requires penalty_reasons', 'sprint2Input.direction_score.penalty_reasons');

  const selection = objectValue(root.human_selection_record, 'sprint2Input.human_selection_record');
  const human_selection_record = {
    selection_id: stringValue(selection.selection_id, 'sprint2Input.human_selection_record.selection_id'),
    selected_direction_id: stringValue(selection.selected_direction_id, 'sprint2Input.human_selection_record.selected_direction_id'),
    selected_by: stringValue(selection.selected_by, 'sprint2Input.human_selection_record.selected_by'),
    selector_type: enumValue(selection.selector_type, ['human'], 'sprint2Input.human_selection_record.selector_type'),
    status: enumValue(selection.status, ['confirmed'], 'sprint2Input.human_selection_record.status'),
    selected_at: validateTimestamp(selection.selected_at, 'sprint2Input.human_selection_record.selected_at'),
    notes: typeof selection.notes === 'string' ? selection.notes : ''
  };
  if (human_selection_record.selected_direction_id !== selected_direction_id) fail('human_selection_record must confirm selected_direction_id', 'sprint2Input.human_selection_record.selected_direction_id');

  return deepFreeze({
    contract_version: VISUAL_TRANSLATION_SPRINT_2A.inputContractVersion,
    project_id,
    run_id,
    document_set_hash,
    selected_direction_id,
    selected_direction,
    brand_context,
    locked_assets,
    allowed_assets: allowed.values,
    restricted_assets: restricted.values,
    visual_signals,
    evidence_index,
    direction_risks,
    direction_score: { raw_score, confidence_adjusted_score, risk_penalty, final_score, penalty_reasons },
    human_selection_record
  });
}
