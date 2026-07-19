import { defineSemanticEvaluator } from './semantic-evaluator.js';

export function createFixtureSemanticEvaluator(resultsByRule = {}, { version = 'fixture-evaluator-v1' } = {}) {
  const fixtures = structuredClone(resultsByRule);
  const evaluator = defineSemanticEvaluator(({ ruleId }) => {
    const result = fixtures[ruleId];
    return result === undefined ? false : structuredClone(result);
  });
  return Object.freeze({ ...evaluator, version });
}
