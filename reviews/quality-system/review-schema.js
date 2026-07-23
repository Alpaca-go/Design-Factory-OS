const JUDGEMENTS = new Set(['true_positive', 'false_positive', 'false_negative', 'uncertain']);
const REVIEWER_TYPES = new Set(['human', 'qa', 'domain_expert', 'fixture']);

export function validateReviewImportRow(row) {
  const errors = [];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { valid: false, errors: ['row must be an object'] };
  for (const field of ['project_id', 'run_id', 'module', 'anti_pattern_id', 'notes', 'reviewed_at', 'reviewer_type']) {
    if (typeof row[field] !== 'string' || !row[field].trim()) errors.push(`${field} must be a non-empty string`);
  }
  if (!/^AP-[A-Z]+-[0-9]{3}$/.test(row.anti_pattern_id || '')) errors.push('anti_pattern_id has an invalid format');
  if (typeof row.system_detected !== 'boolean') errors.push('system_detected must be boolean');
  if (!JUDGEMENTS.has(row.human_judgement)) errors.push('human_judgement is invalid');
  if (!REVIEWER_TYPES.has(row.reviewer_type)) errors.push('reviewer_type is invalid');
  if (typeof row.reviewed_at === 'string' && Number.isNaN(new Date(row.reviewed_at).valueOf())) errors.push('reviewed_at must be a valid timestamp');
  if (row.human_judgement === 'false_negative' && row.system_detected === true) errors.push('false_negative requires system_detected=false');
  if (['true_positive', 'false_positive'].includes(row.human_judgement) && row.system_detected === false) errors.push(`${row.human_judgement} requires system_detected=true`);
  return { valid: errors.length === 0, errors };
}
