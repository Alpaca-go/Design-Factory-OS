// Business Model Coverage Gate (doc section 4).
//
// Every direction must cover at least 3 of the 4 core B2B2C dimensions, and the
// three directions together must cover all 4. If all directions only orbit
// compliance / warehousing / documents / batches / temperature / qualification
// the output is flagged business_model_undercoverage and must be rewritten.

import { collectDirectionText } from './direction-text-util.js';
import { BUSINESS_MODEL_DIMENSIONS, countKeywordHits } from './evaluator-keywords.js';

export const BUSINESS_MODEL_COVERAGE_EVALUATOR_VERSION = 'business-model-coverage-evaluator-v1';

const REQUIRED_DIMENSIONS = Object.keys(BUSINESS_MODEL_DIMENSIONS); // upstream, platform, institution, consumer

function dimensionCoverage(direction) {
  const text = collectDirectionText(direction);
  const coverage = {};
  for (const [dim, keywords] of Object.entries(BUSINESS_MODEL_DIMENSIONS)) {
    coverage[dim] = countKeywordHits(text, keywords) > 0;
  }
  return coverage;
}

export function evaluateBusinessModelCoverage(directions = []) {
  const perDirection = directions.map((direction) => {
    const coverage = dimensionCoverage(direction);
    const covered = REQUIRED_DIMENSIONS.filter((dim) => coverage[dim]).length;
    return {
      direction_id: direction.direction_id,
      b2b_coverage: coverage.upstream,
      platform_role_coverage: coverage.platform,
      industry_ecosystem_coverage: coverage.institution,
      downstream_value_coverage: countKeywordHits(collectDirectionText(direction), ['下游', '终端', '渠道', '分销', '门店']) > 0,
      consumer_value_coverage: coverage.consumer,
      brand_value_coverage: countKeywordHits(collectDirectionText(direction), ['品牌', '主张', '价值', '辨识', '美学']) > 0,
      covered_dimension_count: covered,
      meets_minimum: covered >= 3
    };
  });

  const setCoverage = {};
  for (const dim of REQUIRED_DIMENSIONS) {
    setCoverage[dim] = perDirection.some((item) => item[`${dimToKey(dim)}`]);
  }
  const allFourCovered = REQUIRED_DIMENSIONS.every((dim) => setCoverage[dim]);

  // Undercoverage: every direction only talks compliance/supply-chain/document.
  const onlyCompliance = perDirection.every((item) => !item.meets_minimum);
  const businessModelUndercoverage = onlyCompliance || !allFourCovered;

  const blockingReasons = [];
  if (onlyCompliance) blockingReasons.push('all_directions_undercover');
  if (!allFourCovered) blockingReasons.push('set_missing_required_dimension');

  return {
    evaluator_version: BUSINESS_MODEL_COVERAGE_EVALUATOR_VERSION,
    per_direction: perDirection,
    set_coverage: setCoverage,
    all_four_dimensions_covered: allFourCovered,
    business_model_undercoverage: businessModelUndercoverage,
    blocking_reasons: blockingReasons
  };
}

function dimToKey(dim) {
  if (dim === 'upstream') return 'b2b_coverage';
  if (dim === 'platform') return 'platform_role_coverage';
  if (dim === 'institution') return 'industry_ecosystem_coverage';
  if (dim === 'consumer') return 'consumer_value_coverage';
  return dim;
}
