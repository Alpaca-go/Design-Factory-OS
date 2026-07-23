import { MQS_LEVELS, VALIDATION_STAGES } from './constants.js';
import { defineValidator } from './validator-contract.js';

export function createMqsValidator(scoreOutput) {
  if (typeof scoreOutput !== 'function') throw new TypeError('scoreOutput must be a function');

  return defineValidator({
    name: 'mqs-validator',
    stage: VALIDATION_STAGES.MQS,
    async validate(context) {
      const score = await scoreOutput(context.output, context);
      if (!score || !Number.isFinite(score.score) || score.score < 0 || score.score > 100) throw new TypeError('MQS score must be between 0 and 100');
      if (!MQS_LEVELS.includes(score.level)) throw new TypeError(`Invalid MQS level: ${score.level}`);
      if (typeof score.minimumLevelMet !== 'boolean' || typeof score.coreDimensionsMet !== 'boolean') {
        throw new TypeError('MQS scorer must return minimumLevelMet and coreDimensionsMet');
      }
      return {
        score: score.score,
        level: score.level,
        minimumLevelMet: score.minimumLevelMet,
        coreDimensionsMet: score.coreDimensionsMet,
        dimensionScores: { ...(score.dimensionScores || {}) },
        repairActions: Array.isArray(score.repairActions) ? score.repairActions : []
      };
    }
  });
}
