// Anti-concept-art constraint checker (doc section 5.9).
//
// Detects whether a v2 direction still drifts into the conceptual / real-estate
// / cinematic-concept-art language that the experiment is trying to eliminate.
// Pure, deterministic, offline. Returns the list of violated constraint ids so
// the Execution Readiness Evaluator can derive `concept_art_risk`.

import {
  ANTI_CONCEPT_ART_CONSTRAINT_IDS,
  COMPOSITION_TOUCHPOINTS
} from '../schemas/direction-contract-v2.js';

function collectSubjectText(direction) {
  const parts = [
    direction.strategic_idea,
    direction.layout_behavior?.subject_area,
    direction.photography_object_system?.subject_and_background,
    ...(direction.composition_templates || []).map((t) => `${t.subject_position} ${t.image_object_rule}`),
    ...(direction.execution_examples || []).map((e) => `${e.subject} ${e.industry_recognition_source}`)
  ];
  return parts.filter(Boolean).join(' ');
}

function collectVisualText(direction) {
  const parts = [
    direction.strategic_idea,
    direction.brand_evidence,
    JSON.stringify(direction.industry_recognition_layer || {}),
    JSON.stringify(direction.graphic_system || {}),
    JSON.stringify(direction.photography_object_system || {}),
    JSON.stringify(direction.material_and_light_support || {}),
    JSON.stringify(direction.information_system || {}),
    ...(direction.composition_templates || []).map((t) => `${t.subject_position} ${t.information_position} ${t.image_object_rule} ${(t.negative_constraints || []).join(' ')}`),
    ...(direction.execution_examples || []).map((e) => `${e.subject} ${e.visual_structure} ${e.information_position} ${e.anti_concept_art_note}`),
    ...(direction.execution_constraints || []),
    ...(direction.template_risks || [])
  ];
  return parts.filter(Boolean).join(' ');
}

function matchAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

// Each detector returns true when the corresponding constraint is VIOLATED.
const DETECTORS = [
  {
    constraint_id: 'no_giant_space_installation_as_primary',
    test: (subject, visual) => /巨型空间装置|巨型装置|空间装置作为主|以空间装置为主/.test(subject)
  },
  {
    constraint_id: 'no_architecture_pavilion_sculpture_realestate_as_subject',
    test: (subject) => /(建筑|展馆|雕塑|地产空间|展厅)作为视觉主体|(建筑|展馆|雕塑|地产空间|展厅)作为主|以建筑为视觉主体|以建筑作为视觉主体|建筑为视觉主体|以展馆为视觉主体|以雕塑为视觉主体/.test(subject)
  },
  {
    constraint_id: 'no_material_light_only_premium',
    test: (subject, visual) => /只依赖材质|仅靠光影|材质与光影形成高级感|以材质光影营造高级|仅靠材质光影|材质光影撑起高级感/.test(visual)
  },
  {
    constraint_id: 'no_abstract_without_industry_content',
    test: (subject, visual) => /纯抽象|只有抽象|仅有抽象|抽象物体而没有行业|抽象符号替代行业|以抽象表达替代行业/.test(visual)
  },
  {
    constraint_id: 'must_convert_to_flat_design',
    test: (subject, visual, direction) => {
      const hasFlat = (direction.composition_templates || []).some((template) => COMPOSITION_TOUCHPOINTS.includes(template.touchpoint));
      return !hasFlat;
    }
  },
  {
    constraint_id: 'no_distant_grand_space_replacing_info',
    test: (subject) => /远景宏大空间|宏大空间替代|远景.*空间.*取代信息|以远景空间替代品牌信息|宏大空间取代品牌/.test(subject)
  },
  {
    constraint_id: 'no_default_glass_stone_glowing',
    test: (subject, visual) => /玻璃曲面|曲面玻璃|石材与发光|发光结构|发光体作为|以石材与发光/.test(visual)
  },
  {
    constraint_id: 'no_cinematic_concept_art_only',
    test: (subject, visual) => /电影概念图|概念海报语言|只输出概念图|电影概念海报|电影感概念图语言/.test(visual)
  },
  {
    constraint_id: 'must_generate_poster_booklet_packaging_page_template',
    test: (subject, visual, direction) => {
      const hasNamed = (direction.composition_templates || []).some((template) => COMPOSITION_TOUCHPOINTS.includes(template.touchpoint));
      return !hasNamed;
    }
  }
];

export function checkAntiConceptArtConstraints(direction) {
  const subject = collectSubjectText(direction);
  const visual = collectVisualText(direction);
  const violations = [];
  for (const detector of DETECTORS) {
    if (detector.test(subject, visual, direction)) violations.push(detector.constraint_id);
  }
  const unknown = violations.filter((id) => !ANTI_CONCEPT_ART_CONSTRAINT_IDS.includes(id));
  if (unknown.length) throw new Error(`Anti-concept-art checker produced unknown constraint id: ${unknown.join(', ')}`);
  return { violations, subjectTextSample: subject.slice(0, 200), violationCount: violations.length };
}

export function detectRealEstateDriftFromText(subjectText) {
  const patterns = [
    /地产空间/,
    /展厅/,
    /展馆/,
    /建筑作为视觉主体/,
    /雕塑作为主/,
    /空间装置/,
    /宏大空间/,
    /远景宏大/
  ];
  const signals = patterns.filter((pattern) => pattern.test(subjectText)).map((pattern) => pattern.source);
  return [...new Set(signals)];
}

export function detectAbstractOnlyFromText(visualText) {
  const patterns = [/纯抽象/, /只有抽象物体/, /仅有抽象/, /抽象物体而没有行业内容/, /以抽象替代行业/];
  const signals = patterns.filter((pattern) => pattern.test(visualText)).map((pattern) => pattern.source);
  return [...new Set(signals)];
}

export function detectRealEstateDrift(direction) {
  return detectRealEstateDriftFromText(collectSubjectText(direction));
}

export function detectAbstractOnlyDependency(direction) {
  return detectAbstractOnlyFromText(collectVisualText(direction));
}
