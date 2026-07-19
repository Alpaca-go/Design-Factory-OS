export function defineSemanticEvaluator(evaluate) {
  if (typeof evaluate !== 'function') throw new TypeError('Semantic evaluator must be a function');
  return Object.freeze({ evaluate });
}

export async function evaluateSemantically(evaluator, request) {
  if (!evaluator) return { detected: false, evaluated: false, evaluationMode: 'not_evaluated' };
  const evaluate = typeof evaluator === 'function' ? evaluator : evaluator.evaluate;
  if (typeof evaluate !== 'function') throw new TypeError('Semantic evaluator must expose evaluate(request)');
  const result = await evaluate(Object.freeze(request));
  if (result === false || result === null || result === undefined) {
    return { detected: false, evaluated: true, evaluationMode: 'semantic' };
  }
  if (result === true) throw new TypeError(`${request.ruleId} semantic evaluator must return structured evidence`);
  if (typeof result !== 'object' || Array.isArray(result)) throw new TypeError(`${request.ruleId} semantic evaluator returned an invalid result`);
  return { ...result, detected: result.detected !== false, evaluated: true, evaluationMode: 'semantic' };
}
