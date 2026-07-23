import { VALIDATION_STAGES } from './constants.js';
import { defineValidator } from './validator-contract.js';
import { AntiPatternRegistry } from './anti-pattern-registry.js';

const MODULE_PENALTY_CAP = 40;

export function createAntiPatternValidator(registry) {
  if (!(registry instanceof AntiPatternRegistry)) throw new TypeError('registry must be an AntiPatternRegistry');

  return defineValidator({
    name: 'anti-pattern-validator',
    stage: VALIDATION_STAGES.ANTI_PATTERN,
    async validate(context) {
      const definitions = registry.list({ module: context.module });
      const normalizedResults = await Promise.all(definitions.map(async (definition) => normalizeResult(
        definition,
        await definition.detect(context),
        context.module
      )));
      const { results, penaltySummary } = applyModulePenaltyCap(normalizedResults);
      return { results, penaltySummary };
    }
  });
}

function normalizeResult(definition, rawResult, module) {
  const details = rawResult && typeof rawResult === 'object' ? rawResult : {};
  const severity = ['S1', 'S2', 'S3', 'S4'].includes(details.severity) ? details.severity : definition.severity;
  const basePenalty = Number.isFinite(details.basePenalty) && details.basePenalty >= 0 ? details.basePenalty : definition.basePenalty;
  const detected = rawResult === true || Boolean(rawResult && typeof rawResult === 'object' && rawResult.detected !== false);
  const evaluated = details.evaluated !== false;
  const exceptionApplied = detected && details.exceptionApplied === true;
  const occurrenceCount = detected ? normalizeOccurrenceCount(details) : 0;
  const evidence = detected && Array.isArray(details.evidence) ? details.evidence.filter(isNonEmptyString) : [];
  if (detected && evidence.length === 0) throw new TypeError(`${definition.id} detected without evidence`);
  const evaluationMode = evaluated
    ? (details.evaluationMode || (definition.ruleType === 'semantic' ? 'semantic' : 'deterministic'))
    : 'not_evaluated';
  if (!['deterministic', 'semantic', 'not_evaluated'].includes(evaluationMode)) throw new TypeError(`${definition.id} returned an invalid evaluationMode`);
  const uncappedPenalty = detected && !exceptionApplied && severity !== 'S4'
    ? repeatedPenalty(basePenalty, occurrenceCount)
    : 0;
  const repair = detected && Array.isArray(details.repair) && details.repair.some(isNonEmptyString)
    ? details.repair.filter(isNonEmptyString)
    : (detected ? definition.repair.filter(isNonEmptyString) : []);
  if (detected && repair.length === 0) throw new TypeError(`${definition.id} detected without a repair action`);
  const result = {
    anti_pattern_id: definition.id,
    detected,
    severity,
    rule_type: definition.ruleType,
    evaluated,
    evaluation_mode: evaluationMode,
    confidence: detected ? clamp(details.confidence ?? 1, 0, 1) : (evaluated ? 1 : 0),
    location: {
      module,
      ...(details.location?.section ? { section: details.location.section } : {}),
      ...(details.location?.path ? { path: details.location.path } : {})
    },
    evidence,
    exception_applied: exceptionApplied,
    occurrence_count: occurrenceCount,
    penalty: uncappedPenalty,
    repair
  };
  if (exceptionApplied) result.exception_reason = details.exceptionReason || definition.exceptions.join('; ') || 'Registered exception applied';
  return result;
}

function normalizeOccurrenceCount(details) {
  if (Array.isArray(details.occurrences)) return Math.max(1, details.occurrences.length);
  if (Number.isInteger(details.occurrenceCount) && details.occurrenceCount > 0) return details.occurrenceCount;
  return 1;
}

function repeatedPenalty(basePenalty, occurrenceCount) {
  if (occurrenceCount <= 0) return 0;
  if (occurrenceCount === 1) return basePenalty;
  return round(basePenalty + (basePenalty * 1.25) + (basePenalty * 1.5 * (occurrenceCount - 2)));
}

function applyModulePenaltyCap(results) {
  let remaining = MODULE_PENALTY_CAP;
  let uncappedTotal = 0;
  const cappedResults = results.map((result) => {
    uncappedTotal += result.penalty;
    const penalty = Math.min(result.penalty, remaining);
    remaining -= penalty;
    return { ...result, penalty: round(penalty) };
  });
  const total = round(MODULE_PENALTY_CAP - remaining);
  return {
    results: cappedResults,
    penaltySummary: {
      total,
      uncapped_total: round(uncappedTotal),
      cap: MODULE_PENALTY_CAP,
      cap_applied: uncappedTotal > MODULE_PENALTY_CAP
    }
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
