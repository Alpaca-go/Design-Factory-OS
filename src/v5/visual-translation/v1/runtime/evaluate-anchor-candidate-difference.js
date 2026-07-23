import { ANCHOR_DIFFERENCE_DIMENSIONS, validateAnchorCandidateDifferenceMatrix } from '../schemas/anchor-candidate-difference-v1.js';

export async function evaluateAnchorCandidateDifferenceMatrix({ candidates, evaluator, context }) {
  if (!evaluator?.evaluateDifference) {
    return validateAnchorCandidateDifferenceMatrix({ status: 'not_evaluated', evaluator_version: evaluator?.version || 'not_evaluated' }, candidates);
  }
  const pairs = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const first = candidates[left];
      const second = candidates[right];
      const raw = await evaluator.evaluateDifference(Object.freeze({
        kind: 'anchor_candidate_difference',
        candidate_ids: [first.anchor_id, second.anchor_id],
        candidates: structuredClone([first, second]),
        dimensions: [...ANCHOR_DIFFERENCE_DIMENSIONS],
        context: structuredClone(context)
      }));
      pairs.push({ ...structuredClone(raw), candidate_ids: [first.anchor_id, second.anchor_id] });
    }
  }
  const provisional = {
    status: pairs.every((pair) => Object.values(pair.dimension_scores || {}).reduce((sum, score) => sum + score, 0) >= 7) ? 'pass' : 'repair',
    pairs,
    evaluator_version: evaluator.version
  };
  return validateAnchorCandidateDifferenceMatrix(provisional, candidates);
}
