export const BRAND_DNA_PROTOCOL = Object.freeze({
  profile: 'deep',
  protocolVersion: 'brand-dna-v1',
  brandDnaSchemaVersion: 'brand-dna-schema-v1',
  reportSchemaVersion: 'brand-dna-report-v1',
  imageTaskSchemaVersion: 'gpt-image-task-v1',
  industryRuleVersion: 'default-v1'
});

export const BRAND_DNA_QUALITY_GATE = Object.freeze({
  minTotalScore: 85,
  minEvidenceScore: 17,
  minStrategyScore: 17,
  minImageExecutionScore: 9,
  maxRepairAttempts: 1,
  requireNoHardFailures: true
});

export const REASONING_QUALITY_TIERS = Object.freeze([
  'benchmark',
  'qualified',
  'experimental',
  'unsupported'
]);
