import { arrayValue, enumValue, numberValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { containsChinese } from './report-language-v1.js';

export const DIFFERENCE_DIMENSIONS = Object.freeze([
  'core_metaphor', 'graphic_mechanism', 'composition_logic',
  'material_family', 'emotional_role', 'spatial_behavior'
]);

function expectedStatus(total) {
  if (total <= 5) return 'needs_rewrite';
  if (total <= 8) return 'needs_strengthening';
  return 'pass';
}

function sharedTraitDimensions(traits) {
  const dimensions = new Set();
  for (const trait of traits) {
    const text = trait.normalize('NFKC').toLowerCase();
    if (/(?:grid|网格|栅格|same composition|相同构图|同构图)/u.test(text)) dimensions.add('composition_logic');
    if (/(?:transparent|translucent|透明|半透明|layer|叠层)/u.test(text)) dimensions.add('graphic_mechanism');
    if (/(?:stable|trustworthy|confidence|稳定|可信|信任)/u.test(text)) dimensions.add('emotional_role');
    if (/(?:depth|shallow 3d|空间深度|浅层三维|纵深)/u.test(text)) dimensions.add('spatial_behavior');
    if (/(?:material|材质|engineering material|工程材料|overlap|重叠)/u.test(text)) dimensions.add('material_family');
  }
  return dimensions;
}

export function buildDirectionDifferenceMatrix(directions, rawMatrix, { evaluator, reportLanguage = 'en-US' } = {}) {
  const evaluated = evaluator ? evaluator.evaluate({ directions: structuredClone(directions), dimensions: [...DIFFERENCE_DIMENSIONS] }) : rawMatrix;
  const root = objectValue(evaluated, 'visualCreativeDirections.differenceMatrix');
  const expectedPairs = new Set(['D01/D02', 'D01/D03', 'D02/D03']);
  const pairs = arrayValue(root.pairs || root, 'visualCreativeDirections.differenceMatrix.pairs', { min: 3, max: 3 }).map((rawPair, pairIndex) => {
    const path = `visualCreativeDirections.differenceMatrix.pairs[${pairIndex}]`;
    const pair = objectValue(rawPair, path);
    const direction_pair = stringValue(pair.direction_pair, `${path}.direction_pair`);
    if (!expectedPairs.has(direction_pair)) throw Object.assign(new Error(`${path}.direction_pair is invalid`), { code: 'FAILED_SCHEMA', path: `${path}.direction_pair` });
    expectedPairs.delete(direction_pair);
    const shared_visual_traits = stringArray(pair.shared_visual_traits, `${path}.shared_visual_traits`, { itemMaxLength: 180 });
    const seen = new Set();
    const raw_dimensions = arrayValue(pair.dimensions, `${path}.dimensions`, { min: 6, max: 6 }).map((rawDimension, dimensionIndex) => {
      const dimensionPath = `${path}.dimensions[${dimensionIndex}]`;
      const dimension = objectValue(rawDimension, dimensionPath);
      const name = enumValue(dimension.name, DIFFERENCE_DIMENSIONS, `${dimensionPath}.name`);
      if (seen.has(name)) throw Object.assign(new Error(`${dimensionPath}.name is duplicated`), { code: 'FAILED_SCHEMA', path: `${dimensionPath}.name` });
      seen.add(name);
      const reason = stringValue(dimension.reason, `${dimensionPath}.reason`, { maxLength: 300 });
      if (reportLanguage === 'zh-CN' && !containsChinese(reason)) throw Object.assign(new Error(`${dimensionPath}.reason must explain the semantic difference in Chinese`), { code: 'REPORT_LANGUAGE_POLLUTION', path: `${dimensionPath}.reason` });
      return { name, score: numberValue(dimension.score, `${dimensionPath}.score`, { min: 0, max: 2 }), reason };
    });
    if (raw_dimensions.some((item) => !Number.isInteger(item.score))) throw Object.assign(new Error(`${path}.dimensions scores must be 0, 1 or 2`), { code: 'FAILED_SCHEMA', path: `${path}.dimensions` });
    const constrainedDimensions = sharedTraitDimensions(shared_visual_traits);
    const score_adjustments = raw_dimensions
      .filter((item) => constrainedDimensions.has(item.name) && item.score === 2)
      .map((item) => ({ dimension: item.name, from: 2, to: 1, reason: 'declared_shared_visual_trait' }));
    const dimensions = raw_dimensions.map((item) => constrainedDimensions.has(item.name) && item.score === 2 ? { ...item, score: 1 } : item);
    const total_score = dimensions.reduce((sum, item) => sum + item.score, 0);
    const status = expectedStatus(total_score);
    if (shared_visual_traits.length >= 2 && total_score === 12) throw Object.assign(new Error(`${path} cannot score 12/12 with two or more significant shared visual traits`), {
      code: 'DIFFERENCE_MATRIX_SHARED_TRAIT_CONFLICT', path, repairDirectionIds: [direction_pair.split('/')[1]]
    });
    if (typeof pair.full_difference_review_required !== 'boolean') throw Object.assign(new Error(`${path}.full_difference_review_required must be boolean`), { code: 'FAILED_SCHEMA', path: `${path}.full_difference_review_required` });
    const full_difference_review_required = pair.full_difference_review_required;
    if (total_score === 12 && !full_difference_review_required) throw Object.assign(new Error(`${path} scored 12/12 and must require a full-difference review`), { code: 'FAILED_SCHEMA', path });
    const review_result = pair.review_result === null || pair.review_result === undefined
      ? null
      : stringValue(pair.review_result, `${path}.review_result`, { maxLength: 300 });
    return Object.freeze({ direction_pair, shared_visual_traits, dimensions, score_adjustments, total_score, max_score: 12, status, full_difference_review_required, review_result });
  });
  if (expectedPairs.size) throw Object.assign(new Error('Difference Matrix is missing a direction pair'), { code: 'FAILED_SCHEMA' });
  const repairDirectionIds = [...new Set(pairs.filter((pair) => pair.status === 'needs_rewrite').map((pair) => pair.direction_pair.split('/')[1]))];
  return Object.freeze({
    evaluation_method: 'semantic_assessment',
    dimensions: [...DIFFERENCE_DIMENSIONS],
    pairs,
    full_difference_review_required: pairs.some((pair) => pair.full_difference_review_required),
    passes: repairDirectionIds.length === 0,
    repairDirectionIds
  });
}

export function createFixtureDifferenceEvaluator(matrixOrFactory) {
  return Object.freeze({
    version: 'fixture-difference-evaluator-v1',
    evaluate(input) {
      return structuredClone(typeof matrixOrFactory === 'function' ? matrixOrFactory(input) : matrixOrFactory);
    }
  });
}
