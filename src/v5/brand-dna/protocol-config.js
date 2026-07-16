export const BRAND_DNA_PROTOCOL = Object.freeze({
  profile: 'deep',
  protocolVersion: 'brand-dna-v1.1',
  brandDnaSchemaVersion: 'brand-dna-schema-v1',
  reportSchemaVersion: 'brand-dna-report-v2',
  imageTaskSchemaVersion: 'gpt-image-task-v2',
  checkpointSchemaVersion: 'brand-dna-checkpoint-v1',
  repairProtocolVersion: 'structured-patch-v1',
  industryRuleVersion: 'default-v1',
  contentProtocolVersion: 'brand-dna-content-v1.2',
  promptVersion: 'brand-dna-prompts-v1.2'
});

export const BRAND_DNA_QUALITY_GATE = Object.freeze({
  minTotalScore: 85,
  minProjectIdentityAndBoundariesScore: 13,
  minEvidenceScore: 13,
  minStrategyScore: 13,
  minImageExecutionScore: 9,
  minCrossFieldTechnicalScore: 4,
  maxRepairAttempts: 1,
  requireNoHardFailures: true
});

export const REASONING_QUALITY_TIERS = Object.freeze([
  'benchmark',
  'qualified',
  'experimental',
  'unsupported'
]);
