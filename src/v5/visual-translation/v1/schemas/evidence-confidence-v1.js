import { enumValue, numberValue } from '../../../shared/analysis/runtime-contracts.js';

export const EVIDENCE_CONFIDENCE_BY_REASON = Object.freeze({
  direct_evidence: 1,
  derived_evidence: 0.85,
  inference: 0.65
});

export function validateEvidenceConfidence(value, path) {
  const reason_basis = enumValue(value?.reason_basis, Object.keys(EVIDENCE_CONFIDENCE_BY_REASON), `${path}.reason_basis`);
  const evidence_confidence = numberValue(value?.evidence_confidence, `${path}.evidence_confidence`, { min: 0, max: 1 });
  const expected = EVIDENCE_CONFIDENCE_BY_REASON[reason_basis];
  if (Math.abs(evidence_confidence - expected) > 0.000001) {
    throw Object.assign(new Error(`${path}.evidence_confidence must be ${expected} for ${reason_basis}`), { code: 'FAILED_SCHEMA', path: `${path}.evidence_confidence` });
  }
  return Object.freeze({ reason_basis, evidence_confidence });
}
