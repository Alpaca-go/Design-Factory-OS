export const BRAND_DNA_V3 = Object.freeze({
  protocolVersion: 'brand-dna-v3-deep-compact',
  coreReportVersion: 'brand-dna-core-report-v3',
  fullReportVersion: 'brand-dna-full-report-v3',
  checkpointVersion: 'brand-dna-v3-checkpoint-1',
  pipelineBudgetMs: 20 * 60 * 1000
});

export const V3_STAGES = Object.freeze([
  ['00-document-preparation', 0],
  ['01-evidence-map', 1],
  ['02-brand-creative-decision', 2],
  ['03-core-quality-gate', 3],
  ['04-core-report', 4],
  ['05-visual-system-task-plan', 5],
  ['06-image-prompt-compiler', 6],
  ['07-final-audit', 7],
  ['08-final-report', 8]
]);

export const STAGE_SEQUENCE = Object.freeze(Object.fromEntries(V3_STAGES));
