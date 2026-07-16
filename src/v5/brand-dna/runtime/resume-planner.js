export const BRAND_DNA_RESUME_MODES = Object.freeze([
  'continue',
  'rerun-current',
  'restart-all'
]);

export function normalizeResumeMode(value) {
  return BRAND_DNA_RESUME_MODES.includes(value) ? value : 'continue';
}

export function shouldReuseCheckpoint(resumeMode) {
  return normalizeResumeMode(resumeMode) !== 'restart-all';
}
