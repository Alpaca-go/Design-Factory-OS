import { VALIDATION_STAGES } from './constants.js';
import { createAntiPatternValidator } from './anti-pattern-validator.js';
import { createHardFailValidator } from './hard-fail-validator.js';
import { createSchemaValidator } from './schema-validator.js';
import { createPhase2Registry } from './rules/phase-2-registry.js';

export function createShadowModeValidator({ evaluator, validateOutput = () => true, registry = createPhase2Registry({ evaluator }) } = {}) {
  const schemaValidator = createSchemaValidator(validateOutput);
  const hardFailValidator = createHardFailValidator([]);
  const antiPatternValidator = createAntiPatternValidator(registry);

  return Object.freeze({
    mode: 'shadow',
    async validate({ module, output, metadata = {}, brand_context = {}, source_context = {} }) {
      if (typeof module !== 'string' || !module.trim()) throw new TypeError('module is required');
      const context = {
        module: module.trim(),
        output: structuredClone(output),
        metadata: structuredClone(metadata),
        brand_context: structuredClone(brand_context),
        source_context: structuredClone(source_context)
      };
      const stageResults = [];
      const schemaValidation = await schemaValidator.validate(context);
      stageResults.push(completed(VALIDATION_STAGES.SCHEMA));
      if (!schemaValidation.valid) {
        stageResults.push(skipped(VALIDATION_STAGES.HARD_FAIL, 'schema_validation_failed'));
        stageResults.push(skipped(VALIDATION_STAGES.ANTI_PATTERN, 'schema_validation_failed'));
        stageResults.push(skipped(VALIDATION_STAGES.MQS, 'shadow_mode_no_mqs_scoring'));
        stageResults.push(completed(VALIDATION_STAGES.STATUS));
        return shadowResult(context.module, 'reject', schemaValidation, [], [], emptyPenaltySummary(), stageResults);
      }

      const directHardFails = await hardFailValidator.validate(context);
      stageResults.push(completed(VALIDATION_STAGES.HARD_FAIL));
      const antiPatternResult = await antiPatternValidator.validate(context);
      stageResults.push(completed(VALIDATION_STAGES.ANTI_PATTERN));
      stageResults.push(skipped(VALIDATION_STAGES.MQS, 'shadow_mode_no_mqs_scoring'));

      const active = antiPatternResult.results.filter((finding) => finding.detected && !finding.exception_applied);
      const critical = active.filter((finding) => finding.severity === 'S4');
      const hardFails = [
        ...directHardFails.hardFails,
        ...critical.map((finding) => ({
          id: finding.anti_pattern_id,
          message: finding.evidence[0],
          ...(finding.location?.path ? { location: finding.location.path } : {})
        }))
      ];
      const status = hardFails.length > 0
        ? 'reject'
        : (active.some((finding) => finding.severity === 'S2' || finding.severity === 'S3') ? 'repair' : 'pass');
      stageResults.push(completed(VALIDATION_STAGES.STATUS));
      return shadowResult(
        context.module,
        status,
        schemaValidation,
        hardFails,
        antiPatternResult.results,
        antiPatternResult.penaltySummary,
        stageResults
      );
    }
  });
}

function shadowResult(module, status, schemaValidation, hardFails, antiPatterns, penaltySummary, stageResults) {
  return {
    mode: 'shadow',
    module,
    status,
    schema_validation: schemaValidation,
    hard_fails: hardFails,
    anti_patterns: antiPatterns,
    penalty_summary: penaltySummary,
    mqs_score: null,
    stage_results: stageResults
  };
}

function completed(stage) {
  return { stage, status: 'completed' };
}

function skipped(stage, reason) {
  return { stage, status: 'skipped', reason };
}

function emptyPenaltySummary() {
  return { total: 0, uncapped_total: 0, cap: 40, cap_applied: false };
}
