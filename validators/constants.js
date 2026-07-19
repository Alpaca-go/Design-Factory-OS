export const VALIDATION_STATUSES = Object.freeze(['pass', 'repair', 'reject']);

export const VALIDATION_STAGES = Object.freeze({
  SCHEMA: 'schema_validation',
  HARD_FAIL: 'hard_fail_detection',
  ANTI_PATTERN: 'anti_pattern_detection',
  MQS: 'mqs_scoring',
  STATUS: 'status_resolution'
});

export const VALIDATION_ORDER = Object.freeze([
  VALIDATION_STAGES.SCHEMA,
  VALIDATION_STAGES.HARD_FAIL,
  VALIDATION_STAGES.ANTI_PATTERN,
  VALIDATION_STAGES.MQS,
  VALIDATION_STAGES.STATUS
]);

export const ANTI_PATTERN_SEVERITIES = Object.freeze(['S1', 'S2', 'S3', 'S4']);
export const ANTI_PATTERN_RULE_TYPES = Object.freeze(['deterministic', 'semantic', 'hybrid']);
export const MQS_LEVELS = Object.freeze(['L0', 'L1', 'L2', 'L3', 'L4', 'M']);
