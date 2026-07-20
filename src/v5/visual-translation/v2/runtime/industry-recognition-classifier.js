// Industry Recognition Classification (doc section 8).
//
// Extends the single industry_recognition_layer into six object families. Each
// direction must populate at least 2 categories; the three directions together
// must cover the first 5 (regulatory, supply_chain, product_material,
// institution_service, consumer_value). The medical-aesthetics industry may not
// be represented solely by compliance documents and corporate processes.

import { collectDirectionText } from './direction-text-util.js';
import { INDUSTRY_RECOGNITION_CATEGORIES, countKeywordHits } from './evaluator-keywords.js';

export const INDUSTRY_RECOGNITION_CLASSIFIER_VERSION = 'industry-recognition-classifier-v1';

const CATEGORY_KEYS = Object.keys(INDUSTRY_RECOGNITION_CATEGORIES);
const REQUIRED_SET_CATEGORIES = ['regulatory_objects', 'supply_chain_objects', 'product_material_objects', 'institution_service_objects', 'consumer_value_objects'];

export function classifyIndustryRecognition(direction) {
  const explicit = direction.industry_recognition_classification;
  const text = collectDirectionText(direction);
  const classification = {};
  for (const cat of CATEGORY_KEYS) {
    if (explicit && Array.isArray(explicit[cat]) && explicit[cat].length > 0) {
      classification[cat] = explicit[cat];
    } else {
      classification[cat] = countKeywordHits(text, INDUSTRY_RECOGNITION_CATEGORIES[cat]) > 0 ? ['inferred'] : [];
    }
  }
  return classification;
}

export function evaluateIndustryRecognitionCoverage(directions = []) {
  const perDirection = directions.map((direction) => {
    const classification = classifyIndustryRecognition(direction);
    const covered = CATEGORY_KEYS.filter((cat) => classification[cat].length > 0).length;
    return {
      direction_id: direction.direction_id,
      classification,
      covered_category_count: covered,
      meets_minimum: covered >= 2
    };
  });

  const setCoverage = {};
  for (const cat of REQUIRED_SET_CATEGORIES) {
    setCoverage[cat] = perDirection.some((item) => item.classification[cat].length > 0);
  }
  const allRequiredCovered = REQUIRED_SET_CATEGORIES.every((cat) => setCoverage[cat]);
  const anyUndercover = perDirection.some((item) => !item.meets_minimum);

  const blockingReasons = [];
  if (anyUndercover) blockingReasons.push('direction_below_minimum_categories');
  if (!allRequiredCovered) blockingReasons.push('set_missing_required_category');

  return {
    evaluator_version: INDUSTRY_RECOGNITION_CLASSIFIER_VERSION,
    per_direction: perDirection,
    set_coverage: setCoverage,
    all_required_categories_covered: allRequiredCovered,
    rewrite_required: blockingReasons.length > 0,
    blocking_reasons: blockingReasons
  };
}
