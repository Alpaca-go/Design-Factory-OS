import { VALIDATION_STAGES } from './constants.js';
import { assertValidatorForStage } from './validator-contract.js';

export function createQualityValidator({ schemaValidator, hardFailValidator, antiPatternValidator, mqsValidator }) {
  const validators = Object.freeze({
    schema: assertValidatorForStage(schemaValidator, VALIDATION_STAGES.SCHEMA),
    hardFail: assertValidatorForStage(hardFailValidator, VALIDATION_STAGES.HARD_FAIL),
    antiPattern: assertValidatorForStage(antiPatternValidator, VALIDATION_STAGES.ANTI_PATTERN),
    mqs: assertValidatorForStage(mqsValidator, VALIDATION_STAGES.MQS)
  });

  return Object.freeze({
    async validate({ module, output, metadata = {} }) {
      if (typeof module !== 'string' || !module.trim()) throw new TypeError('module is required');
      const context = { module: module.trim(), output, metadata };
      const stageResults = [];

      const schemaValidation = await validators.schema.validate(context);
      stageResults.push(completed(VALIDATION_STAGES.SCHEMA));
      if (!schemaValidation.valid) {
        stageResults.push(skipped(VALIDATION_STAGES.HARD_FAIL), skipped(VALIDATION_STAGES.ANTI_PATTERN), skipped(VALIDATION_STAGES.MQS));
        stageResults.push(completed(VALIDATION_STAGES.STATUS));
        return {
          module: context.module,
          status: 'reject',
          schema_validation: schemaValidation,
          hard_fails: [],
          anti_patterns: [],
          penalty_summary: { total: 0, uncapped_total: 0, cap: 40, cap_applied: false },
          mqs_score: null,
          stage_results: stageResults
        };
      }

      const hardFailResult = await validators.hardFail.validate(context);
      stageResults.push(completed(VALIDATION_STAGES.HARD_FAIL));

      const antiPatternResult = await validators.antiPattern.validate({ ...context, hardFails: hardFailResult.hardFails });
      stageResults.push(completed(VALIDATION_STAGES.ANTI_PATTERN));

      const activeAntiPatterns = antiPatternResult.results.filter((result) => result.detected && !result.exception_applied);
      const criticalAntiPatterns = activeAntiPatterns.filter((result) => result.severity === 'S4');
      const combinedHardFails = [
        ...hardFailResult.hardFails,
        ...criticalAntiPatterns.map((finding) => ({
          id: finding.anti_pattern_id,
          message: finding.evidence[0] || `${finding.anti_pattern_id} critical anti-pattern detected`,
          ...(finding.location?.path ? { location: finding.location.path } : {})
        }))
      ];
      const mqsResult = await validators.mqs.validate({
        ...context,
        hardFails: combinedHardFails,
        antiPatterns: antiPatternResult.results
      });
      stageResults.push(completed(VALIDATION_STAGES.MQS));

      const status = resolveStatus({
        hardFails: combinedHardFails,
        activeAntiPatterns,
        mqsResult
      });
      stageResults.push(completed(VALIDATION_STAGES.STATUS));

      return {
        module: context.module,
        status,
        schema_validation: schemaValidation,
        hard_fails: combinedHardFails,
        anti_patterns: antiPatternResult.results,
        penalty_summary: antiPatternResult.penaltySummary,
        mqs_score: {
          module: context.module,
          score: mqsResult.score,
          level: mqsResult.level,
          status,
          minimum_level_met: mqsResult.minimumLevelMet,
          core_dimensions_met: mqsResult.coreDimensionsMet,
          dimension_scores: mqsResult.dimensionScores,
          hard_fails: combinedHardFails.map((finding) => finding.id),
          violations: activeAntiPatterns.map((finding) => finding.anti_pattern_id),
          repair_actions: unique([
            ...mqsResult.repairActions,
            ...activeAntiPatterns.flatMap((finding) => finding.repair)
          ])
        },
        stage_results: stageResults
      };
    }
  });
}

export function resolveStatus({ hardFails, activeAntiPatterns, mqsResult }) {
  if (hardFails.length > 0 || activeAntiPatterns.some((finding) => finding.severity === 'S4') || !mqsResult.coreDimensionsMet) return 'reject';
  if (!mqsResult.minimumLevelMet || activeAntiPatterns.some((finding) => finding.severity === 'S2' || finding.severity === 'S3')) return 'repair';
  return 'pass';
}

function completed(stage) {
  return { stage, status: 'completed' };
}

function skipped(stage) {
  return { stage, status: 'skipped', reason: 'schema_validation_failed' };
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}
