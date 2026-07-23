import { VALIDATION_STAGES } from './constants.js';
import { defineValidator } from './validator-contract.js';

export function createHardFailValidator(rules = []) {
  const normalizedRules = rules.map(normalizeRule);
  return defineValidator({
    name: 'hard-fail-validator',
    stage: VALIDATION_STAGES.HARD_FAIL,
    async validate(context) {
      const findings = await Promise.all(normalizedRules.map(async (rule) => {
        const result = await rule.detect(context);
        if (!result) return null;
        if (result === true) return { id: rule.id, message: rule.message };
        return {
          id: rule.id,
          message: result.message || rule.message,
          ...(result.location ? { location: result.location } : {})
        };
      }));
      return { hardFails: findings.filter(Boolean) };
    }
  });
}

function normalizeRule(rule) {
  if (!rule || typeof rule.id !== 'string' || !rule.id || typeof rule.message !== 'string' || !rule.message || typeof rule.detect !== 'function') {
    throw new TypeError('Hard-fail rules require id, message, and detect');
  }
  return Object.freeze({ id: rule.id, message: rule.message, detect: rule.detect });
}
