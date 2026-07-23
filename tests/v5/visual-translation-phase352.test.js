import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVisualEvidenceMap } from '../../src/v5/visual-translation/v1/schemas/visual-evidence-map-v1.js';
import { validateVisualStrategySignalMap } from '../../src/v5/visual-translation/v1/schemas/visual-strategy-signal-map-v1.js';
import { validateVisualCreativeDirections } from '../../src/v5/visual-translation/v1/schemas/visual-creative-directions-v1.js';
import { buildDirectionDifferenceMatrix } from '../../src/v5/visual-translation/v1/schemas/direction-difference-matrix-v1.js';
import { createShadowModeValidator } from '../../validators/index.js';
import { corpus, directionsOutput, evidenceOutput, semanticDifferenceMatrix, signalOpportunityOutput } from './helpers/visual-translation-phase35-fixtures.js';

const chunkId = 'doc-1-chunk-001';
const prepared = {
  sourceDocuments: [{ sourceId: 'doc-1', rawText: corpus.mergedText }],
  chunks: [{ sourceId: 'doc-1', chunkId, text: corpus.mergedText }]
};

function evidenceWith(extraAsset) {
  const raw = evidenceOutput(chunkId);
  if (extraAsset) raw.visualEvidenceMap.suggestedAssets.push(extraAsset);
  return validateVisualEvidenceMap(raw, prepared);
}

function directionContext(evidenceMap = evidenceWith()) {
  return {
    evidenceMap,
    signalMap: validateVisualStrategySignalMap(signalOpportunityOutput().visualStrategySignalMap, evidenceMap)
  };
}

test('missing parent-brand VI makes endorsement assets restricted and non-executable', () => {
  const evidence = evidenceWith({
    assetId: 'SA003', name: 'Parent brand endorsement lockup', assetType: 'parent_child_logo_lockup', status: 'proposed',
    execution_scope: 'current_direction', requires_human_approval: false, restriction_reason: null,
    evidenceIds: ['VE001'], providedInSource: false, authorizedForGeneration: false, authorizationEvidenceIds: [], reason: 'Reserve an endorsement area'
  });
  const asset = evidence.suggestedAssets.find((item) => item.assetId === 'SA003');
  assert.equal(asset.status, 'restricted');
  assert.equal(asset.execution_scope, 'restricted');
  assert.equal(asset.executable, false);
  assert.equal(asset.requires_human_approval, true);
  assert.equal(asset.restriction_reason, 'missing_parent_brand_vi_or_authorization');
});

test('an unapproved new Logo remains future identity work and cannot execute now', () => {
  const evidence = evidenceWith({
    assetId: 'SA004', name: 'Brand Logo', assetType: 'brand_logo', status: 'proposed',
    execution_scope: 'current_direction', requires_human_approval: false, restriction_reason: null,
    evidenceIds: ['VE001'], providedInSource: false, authorizedForGeneration: false, authorizationEvidenceIds: [], reason: 'Potential future identity design'
  });
  const asset = evidence.suggestedAssets.find((item) => item.assetId === 'SA004');
  assert.equal(asset.status, 'proposed');
  assert.equal(asset.execution_scope, 'future_identity_design');
  assert.equal(asset.executable, false);
  assert.equal(asset.requires_human_approval, true);
  assert.ok(!evidence.executableSuggestedAssets.some((item) => item.assetId === 'SA004'));
});

test('B2B team, expert and ecosystem descriptions cannot map to consumer_auxiliary', () => {
  for (const people of ['Partner team supports the platform', 'Industry expert supports verification', 'Ecosystem participant supports coordination']) {
    const raw = directionsOutput();
    raw.visualCreativeDirections.directions[2].subjectPolicy = { ...raw.visualCreativeDirections.directions[2].subjectPolicy, people, peopleRole: 'consumer_auxiliary' };
    assert.throws(() => validateVisualCreativeDirections(raw, directionContext()), (error) => error.code === 'PEOPLE_POLICY_MAPPING_CONFLICT');
  }
});

test('Jiuzhou D03 uses ecosystem_participant consistently', () => {
  const raw = directionsOutput();
  raw.visualCreativeDirections.directions[2].subjectPolicy.people = 'Ecosystem participants support the industrial relationship';
  raw.visualCreativeDirections.directions[2].subjectPolicy.peopleRole = 'ecosystem_participant';
  const result = validateVisualCreativeDirections(raw, directionContext());
  assert.equal(result.directions[2].subjectPolicy.peopleRole, 'ecosystem_participant');
});

test('Difference Matrix requires shared_visual_traits for every pair', () => {
  const matrix = semanticDifferenceMatrix();
  delete matrix.pairs[0].shared_visual_traits;
  assert.throws(() => buildDirectionDifferenceMatrix([], matrix), (error) => error.code === 'FAILED_SCHEMA');
});

test('a dimension tied to a declared shared trait is deterministically capped at 1', () => {
  const matrix = semanticDifferenceMatrix();
  const pair = matrix.pairs.find((item) => item.direction_pair === 'D01/D03');
  const composition = pair.dimensions.find((item) => item.name === 'composition_logic');
  composition.score = 2; pair.total_score = 8; pair.status = 'needs_strengthening';
  const validated = buildDirectionDifferenceMatrix([], matrix).pairs.find((item) => item.direction_pair === 'D01/D03');
  assert.equal(validated.dimensions.find((item) => item.name === 'composition_logic').score, 1);
  assert.deepEqual(validated.score_adjustments, [{ dimension: 'composition_logic', from: 2, to: 1, reason: 'declared_shared_visual_trait' }]);
});

test('12/12 requires an explicit full-difference review flag', () => {
  const matrix = semanticDifferenceMatrix();
  const pair = matrix.pairs[0];
  pair.shared_visual_traits = [];
  pair.dimensions.forEach((dimension) => { dimension.score = 2; });
  pair.total_score = 12; pair.status = 'pass'; pair.full_difference_review_required = false;
  assert.throws(() => buildDirectionDifferenceMatrix([], matrix), (error) => error.code === 'FAILED_SCHEMA');
  pair.full_difference_review_required = true;
  const validated = buildDirectionDifferenceMatrix([], matrix);
  assert.equal(validated.pairs[0].full_difference_review_required, true);
  assert.equal(validated.pairs[0].review_result, null);
});

test('three 12/12 pairs trigger AP-DIR-008 at S3', async () => {
  const matrix = semanticDifferenceMatrix();
  matrix.pairs.forEach((pair) => {
    pair.shared_visual_traits = [];
    pair.dimensions.forEach((dimension) => { dimension.score = 2; });
    pair.total_score = 12; pair.status = 'pass'; pair.full_difference_review_required = true; pair.review_result = null;
  });
  const source = { module: 'visual_direction', output: { difference_matrix: matrix } };
  const before = structuredClone(source);
  const result = await createShadowModeValidator().validate(source);
  const finding = result.anti_patterns.find((item) => item.anti_pattern_id === 'AP-DIR-008');
  assert.equal(finding.detected, true);
  assert.equal(finding.severity, 'S3');
  assert.equal(result.status, 'repair');
  assert.deepEqual(source, before);
});

test('Jiuzhou D01/D03 regression records shared traits and scores 7/12', () => {
  const matrix = buildDirectionDifferenceMatrix([], semanticDifferenceMatrix());
  const pair = matrix.pairs.find((item) => item.direction_pair === 'D01/D03');
  assert.deepEqual(pair.dimensions.map((item) => item.score), [2, 1, 1, 1, 1, 1]);
  assert.equal(pair.total_score, 7);
  assert.equal(pair.status, 'needs_strengthening');
  assert.ok(pair.shared_visual_traits.length >= 2);
});

test('Difference Matrix derives total, maximum and status from semantic dimension scores', () => {
  const matrix = semanticDifferenceMatrix();
  const rawPair = matrix.pairs[0];
  const expectedTotal = rawPair.dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  rawPair.total_score = 0;
  rawPair.max_score = 99;
  rawPair.status = 'needs_rewrite';
  const pair = buildDirectionDifferenceMatrix([], matrix).pairs[0];
  assert.equal(pair.total_score, expectedTotal);
  assert.equal(pair.max_score, 12);
  assert.equal(pair.status, expectedTotal > 8 ? 'pass' : expectedTotal > 5 ? 'needs_strengthening' : 'needs_rewrite');
});
