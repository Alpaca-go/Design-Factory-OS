import { arrayValue, enumValue, numberValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { deepFreeze, fail } from './sprint-2-schema-utils.js';

export const ANCHOR_DIFFERENCE_DIMENSIONS = Object.freeze([
  'core_visual_proposition',
  'primary_mechanism',
  'controlled_visual_dimensions',
  'inclusion_boundary',
  'exclusion_boundary',
  'cross_media_behavior'
]);

export const ANCHOR_DIFFERENCE_MINIMUM = 7;

export function validateAnchorCandidateDifferencePair(value, candidateIds) {
  const root = objectValue(value, 'anchorCandidateDifferencePair');
  const pair = stringArray(root.candidate_ids, 'anchorCandidateDifferencePair.candidate_ids', { min: 2, max: 2 });
  if (new Set(pair).size !== 2) fail('Anchor Difference Pair requires two distinct Candidate IDs', 'anchorCandidateDifferencePair.candidate_ids');
  for (const id of pair) if (!candidateIds.has(id)) fail(`Anchor Difference Pair references unknown Candidate: ${id}`, 'anchorCandidateDifferencePair.candidate_ids');
  const rawScores = objectValue(root.dimension_scores, 'anchorCandidateDifferencePair.dimension_scores');
  const rawReasons = objectValue(root.reasons, 'anchorCandidateDifferencePair.reasons');
  const dimension_scores = {};
  const reasons = {};
  for (const dimension of ANCHOR_DIFFERENCE_DIMENSIONS) {
    const score = numberValue(rawScores[dimension], `anchorCandidateDifferencePair.dimension_scores.${dimension}`, { min: 0, max: 2 });
    if (!Number.isInteger(score)) fail('Anchor Difference scores must be integers 0, 1, or 2', `anchorCandidateDifferencePair.dimension_scores.${dimension}`);
    dimension_scores[dimension] = score;
    reasons[dimension] = stringValue(rawReasons[dimension], `anchorCandidateDifferencePair.reasons.${dimension}`);
  }
  const total_score = Object.values(dimension_scores).reduce((sum, score) => sum + score, 0);
  if (root.total_score !== undefined && root.total_score !== total_score) fail('Anchor Difference total_score does not match dimension scores', 'anchorCandidateDifferencePair.total_score');
  const status = total_score >= ANCHOR_DIFFERENCE_MINIMUM ? 'pass' : 'repair';
  if (root.status !== undefined && root.status !== status) fail('Anchor Difference status does not match total_score', 'anchorCandidateDifferencePair.status');
  return deepFreeze({
    candidate_ids: pair,
    shared_anchor_traits: stringArray(root.shared_anchor_traits, 'anchorCandidateDifferencePair.shared_anchor_traits'),
    dimension_scores,
    reasons,
    total_score,
    status
  });
}

export function validateAnchorCandidateDifferenceMatrix(value, candidates) {
  const root = objectValue(value, 'anchorCandidateDifferenceMatrix');
  const candidateIds = new Set(candidates.map((candidate) => candidate.anchor_id));
  const status = enumValue(root.status, ['pass', 'repair', 'not_evaluated'], 'anchorCandidateDifferenceMatrix.status');
  if (status === 'not_evaluated') {
    return deepFreeze({
      minimum_total_score: ANCHOR_DIFFERENCE_MINIMUM,
      status,
      pairs: [],
      retry_candidate_ids: [],
      evaluator_version: stringValue(root.evaluator_version, 'anchorCandidateDifferenceMatrix.evaluator_version')
    });
  }
  const pairs = arrayValue(root.pairs, 'anchorCandidateDifferenceMatrix.pairs', { min: 1 })
    .map((pair) => validateAnchorCandidateDifferencePair(pair, candidateIds));
  const expectedPairCount = candidates.length * (candidates.length - 1) / 2;
  if (pairs.length !== expectedPairCount) fail('Anchor Difference Matrix must contain every Candidate pair', 'anchorCandidateDifferenceMatrix.pairs');
  const uniquePairs = new Set(pairs.map((pair) => [...pair.candidate_ids].sort().join('::')));
  if (uniquePairs.size !== pairs.length) fail('Anchor Difference Matrix contains duplicate Candidate pairs', 'anchorCandidateDifferenceMatrix.pairs');
  const derivedStatus = pairs.every((pair) => pair.status === 'pass') ? 'pass' : 'repair';
  if (status !== derivedStatus) fail('Anchor Difference Matrix status does not match Pair statuses', 'anchorCandidateDifferenceMatrix.status');
  const retryCandidateIds = [...new Set(pairs.filter((pair) => pair.status === 'repair').map((pair) => pair.candidate_ids[1]))];
  return deepFreeze({
    minimum_total_score: ANCHOR_DIFFERENCE_MINIMUM,
    status,
    pairs,
    retry_candidate_ids: retryCandidateIds,
    evaluator_version: stringValue(root.evaluator_version, 'anchorCandidateDifferenceMatrix.evaluator_version')
  });
}
