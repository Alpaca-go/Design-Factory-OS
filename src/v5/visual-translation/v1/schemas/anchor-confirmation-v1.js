import { enumValue, numberValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { deepFreeze, fail, validateTimestamp } from './sprint-2-schema-utils.js';

export function validateAnchorConfirmationRecord(value, { candidates = [], evaluations = [] } = {}) {
  const root = objectValue(value, 'anchorConfirmationRecord');
  const selected_anchor_id = stringValue(root.selected_anchor_id, 'anchorConfirmationRecord.selected_anchor_id');
  const candidate = candidates.find((item) => item.anchor_id === selected_anchor_id);
  if (!candidate) fail('Anchor confirmation references an unknown Candidate', 'anchorConfirmationRecord.selected_anchor_id');
  const evaluation = evaluations.find((item) => item.subject_id === selected_anchor_id);
  if (!evaluation?.passed) fail('Anchor confirmation cannot select a Candidate that failed semantic validation', 'anchorConfirmationRecord.selected_anchor_id');
  const rejectedRaw = root.rejected_anchor_reasons === undefined ? {} : objectValue(root.rejected_anchor_reasons, 'anchorConfirmationRecord.rejected_anchor_reasons');
  const rejected_anchor_reasons = {};
  for (const [anchorId, reasons] of Object.entries(rejectedRaw)) {
    if (!candidates.some((item) => item.anchor_id === anchorId)) fail(`Rejected Anchor reason references unknown Candidate: ${anchorId}`, 'anchorConfirmationRecord.rejected_anchor_reasons');
    if (anchorId === selected_anchor_id) fail('Selected Anchor cannot also have a rejected reason', `anchorConfirmationRecord.rejected_anchor_reasons.${anchorId}`);
    rejected_anchor_reasons[anchorId] = stringArray(reasons, `anchorConfirmationRecord.rejected_anchor_reasons.${anchorId}`, { min: 1 });
  }
  return deepFreeze({
    selection_id: stringValue(root.selection_id, 'anchorConfirmationRecord.selection_id'),
    selector_type: enumValue(root.selector_type, ['human'], 'anchorConfirmationRecord.selector_type'),
    selected_anchor_id,
    status: enumValue(root.status, ['confirmed'], 'anchorConfirmationRecord.status'),
    confirmed_at: validateTimestamp(root.confirmed_at, 'anchorConfirmationRecord.confirmed_at'),
    selection_reasons: stringArray(root.selection_reasons || [], 'anchorConfirmationRecord.selection_reasons'),
    rejected_anchor_reasons,
    reviewer_confidence: numberValue(root.reviewer_confidence ?? 0.5, 'anchorConfirmationRecord.reviewer_confidence', { min: 0, max: 1 }),
    review_notes: typeof root.review_notes === 'string' ? root.review_notes : '',
    notes: typeof root.notes === 'string' ? root.notes : ''
  });
}
