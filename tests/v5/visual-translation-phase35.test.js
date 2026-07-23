import test from 'node:test';
import assert from 'node:assert/strict';
import { runVisualTranslationV1 } from '../../src/v5/visual-translation/v1/index.js';
import { validateVisualCreativeDirections } from '../../src/v5/visual-translation/v1/schemas/visual-creative-directions-v1.js';
import { buildDirectionRecommendation, buildDirectionScoreCard, validateDirectionScoreScale } from '../../src/v5/visual-translation/v1/schemas/direction-recommendation-v1.js';
import { buildDirectionDifferenceMatrix } from '../../src/v5/visual-translation/v1/schemas/direction-difference-matrix-v1.js';
import { audienceBoundary, corpus, directionsOutput, evidenceOutput, mockReasoner, signalOpportunityOutput } from './helpers/visual-translation-phase35-fixtures.js';

async function validResult() {
  const mock = mockReasoner();
  return runVisualTranslationV1({ projectId: 'phase35', corpus, reasoner: mock.reasoner, provider: 'mock', modelId: 'mock' });
}

test('B2B audience boundary propagates unchanged through all outputs and recommendation', async () => {
  const result = await validResult();
  assert.deepEqual(result.evidenceMap.audienceBoundary, audienceBoundary);
  assert.deepEqual(result.signalMap.audienceBoundary, audienceBoundary);
  assert.deepEqual(result.opportunityMap.audienceBoundary, audienceBoundary);
  assert.deepEqual(result.directions.audienceBoundary, audienceBoundary);
  assert.deepEqual(result.recommendation.audienceBoundary, audienceBoundary);
  assert.ok(result.directions.directions.every((direction) => direction.suitableApplications.every((item) => item.audience !== 'consumer' || item.role === 'auxiliary')));
});

test('B2B projects reject consumer-core subjects and touchpoints', async () => {
  const result = await validResult();
  const output = directionsOutput();
  output.visualCreativeDirections.directions[0].subjectPolicy.people = 'Terminal consumers appear as the core subject';
  output.visualCreativeDirections.directions[0].subjectPolicy.peopleRole = 'consumer_core';
  output.visualCreativeDirections.directions[0].suitableApplications.push({ name: 'Consumer social seeding poster', audience: 'consumer', role: 'core' });
  assert.throws(() => validateVisualCreativeDirections(output, { evidenceMap: result.evidenceMap, signalMap: result.signalMap }), (error) => error.code === 'B2B_BOUNDARY_VIOLATION');
});

test('Suggested Assets are status-bearing and restricted assets never enter executable assets', async () => {
  const result = await validResult();
  assert.ok(result.evidenceMap.suggestedAssets.every((asset) => ['existing', 'derived', 'proposed', 'restricted'].includes(asset.status)));
  const qr = result.evidenceMap.suggestedAssets.find((asset) => asset.assetType === 'scannable_qr');
  assert.equal(qr.status, 'restricted');
  assert.equal(qr.executable, false);
  assert.ok(!result.evidenceMap.executableSuggestedAssets.some((asset) => asset.assetId === qr.assetId));
});

test('a restricted asset ID cannot be referenced by an executable direction', async () => {
  const result = await validResult();
  const output = directionsOutput();
  output.visualCreativeDirections.directions[0].executableAssetIds.push('SA002');
  assert.throws(() => validateVisualCreativeDirections(output, { evidenceMap: result.evidenceMap, signalMap: result.signalMap }), (error) => error.code === 'RESTRICTED_ASSET_EXECUTION');
});

test('direction scoring uses one 0–100 scale, explained penalties and a zero floor', () => {
  const risk_breakdown = { template_risk_penalty: 9, audience_risk_penalty: 0, evidence_risk_penalty: 5, asset_risk_penalty: 0, anti_pattern_penalty: 4, risk_penalty_total: 18, penalty_reasons: ['template_risk:high', 'evidence_basis:inference', 'anti_pattern_penalty:4'] };
  const scoreCard = buildDirectionScoreCard({ brandFit: 5, inspirationValue: 5, distinctiveness: 5, scalability: 5, evidence_confidence: 0.65, categoryClicheRisk: 'high', risk_breakdown });
  assert.equal(scoreCard.base_score, 5);
  assert.equal(scoreCard.confidence_adjusted_score, 3.3);
  assert.equal(scoreCard.risk_penalty, 18);
  assert.equal(scoreCard.final_score, 0);
  assert.deepEqual(scoreCard.penalty_reasons, risk_breakdown.penalty_reasons);
  assert.throws(() => validateDirectionScoreScale([{ brandFit: 0.9, inspirationValue: 0.8, distinctiveness: 0.7 }]), (error) => error.code === 'SCORE_SCALE_INVALID');
  assert.throws(() => validateDirectionScoreScale([{ brandFit: 90, inspirationValue: 0.8, distinctiveness: 80 }]), (error) => error.code === 'SCORE_SCALE_INVALID');
});

test('recommendation returns raw score, same-scale risk penalty, final score and reasons', async () => {
  const result = await validResult();
  const recommendation = buildDirectionRecommendation(result.directions.directions, result.signalMap, result.evidenceMap.audienceBoundary);
  for (const item of recommendation.comparison) {
    assert.ok(item.base_score >= 0 && item.base_score <= 100);
    assert.ok(item.confidence_adjusted_score <= item.base_score);
    assert.ok(item.risk_penalty >= 0 && item.risk_penalty <= 100);
    assert.ok(item.final_score >= 0 && item.final_score <= 100);
    if (item.risk_penalty > 0) assert.ok(item.penalty_reasons.length > 0);
  }
  assert.equal(recommendation.selectionMethod, 'quality_score_with_audience_template_and_evidence_gates');
});

test('Direction Difference Matrix requires at least four of six distinct dimensions', async () => {
  const result = await validResult();
  assert.equal(result.directions.differenceMatrix.passes, true);
  assert.ok(result.directions.differenceMatrix.pairs.every((pair) => pair.total_score >= 6));
  assert.ok(result.directions.differenceMatrix.pairs.every((pair) => Array.isArray(pair.shared_visual_traits)));
  const clone = structuredClone(result.directions.directions);
  const raw = structuredClone(result.directions.differenceMatrix);
  raw.pairs[0].dimensions.forEach((dimension, index) => { dimension.score = index < 3 ? 0 : 1; dimension.reason = `The pair remains semantically close in ${dimension.name}`; });
  raw.pairs[0].total_score = 3;
  raw.pairs[0].status = 'needs_rewrite';
  const matrix = buildDirectionDifferenceMatrix(clone, raw);
  assert.equal(matrix.passes, false);
  assert.ok(matrix.repairDirectionIds.includes('D02'));
});

test('industry-only mechanism reasons cannot enter final directions', async () => {
  const result = await validResult();
  const output = directionsOutput();
  output.visualCreativeDirections.directions[0].distinctiveMechanism = 'Generic technology-blue glowing particles';
  output.visualCreativeDirections.directions[0].mechanismAssessment = {
    brandSpecificReason: 'The industry generally looks technological', reasonBasis: 'industry_only', industryTemplateRisk: 'low', replacementMechanism: 'Use evidence-linked handoff states'
  };
  assert.throws(() => validateVisualCreativeDirections(output, { evidenceMap: result.evidenceMap, signalMap: result.signalMap }), (error) => error.code === 'INDUSTRY_TEMPLATE_RISK');
});

test('a similar direction triggers one targeted rewrite without rerunning upstream stages', async () => {
  let directionAttempt = 0;
  const calls = [];
  const reasoner = async (messages) => {
    const content = messages.map((message) => message.content).join('\n');
    const stage = content.match(/PROTOCOL_STAGE=([^\n]+)/)?.[1];
    calls.push({ stage, content });
    const chunkId = content.match(/"chunkId":"([^"]+)"/)?.[1];
    if (stage === '01-visual-evidence') return { provider: 'mock', model: 'mock', text: JSON.stringify(evidenceOutput(chunkId)) };
    if (stage === '02-visual-signal-opportunity') return { provider: 'mock', model: 'mock', text: JSON.stringify(signalOpportunityOutput()) };
    directionAttempt += 1;
    const output = directionsOutput();
    if (directionAttempt === 1) {
      const pair = output.visualCreativeDirections.differenceMatrix.pairs[0];
      pair.dimensions.forEach((dimension, index) => { dimension.score = index < 3 ? 0 : 1; dimension.reason = `Both directions remain semantically close in ${dimension.name}`; });
      pair.total_score = 3;
      pair.status = 'needs_rewrite';
    }
    return { provider: 'mock', model: 'mock', text: JSON.stringify(output) };
  };
  const result = await runVisualTranslationV1({ projectId: 'targeted-rewrite', corpus, reasoner, provider: 'mock', modelId: 'mock' });
  assert.equal(directionAttempt, 2);
  assert.deepEqual(calls.map((call) => call.stage), ['01-visual-evidence', '02-visual-signal-opportunity', '04-three-creative-directions', '04-three-creative-directions']);
  assert.match(calls.at(-1).content, /Only rewrite these similar or invalid directions: D02/);
  assert.equal(result.directions.differenceMatrix.passes, true);
});
