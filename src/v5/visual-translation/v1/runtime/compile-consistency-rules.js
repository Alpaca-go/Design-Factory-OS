import { validateConsistencyRules } from '../schemas/consistency-rules-v1.js';

export function compileConsistencyRules({ input, anchor, visualDna, visualGrammar }) {
  const primaryDna = visualDna.primary_dna;
  const allDna = [...primaryDna, ...visualDna.supporting_dna];
  let sequence = 0;
  const rule = (statement, observable, method, mapping, lockedAssetImpact = 'none') => ({
    rule_id: `S2-CR-${String(++sequence).padStart(3, '0')}`,
    statement,
    observable_condition: observable,
    validation_method: method,
    maps_to: [mapping],
    locked_asset_impact: lockedAssetImpact
  });
  const anchorMap = { type: 'anchor', id: anchor.anchor_id };
  const primaryMap = { type: 'dna', id: primaryDna[0].dna_id };
  const firstGrammar = visualGrammar.shape_grammar;
  const result = {
    must_preserve: [
      rule(`Preserve ${anchor.name} as the governing visual relationship`, anchor.inclusion_boundary[0].observable_condition, 'Compare the output with the confirmed Anchor inclusion boundary', anchorMap, 'preserve'),
      ...primaryDna.flatMap((dna) => dna.fixed_properties.slice(0, 1).map((property) => rule(property, dna.validation_conditions[0], 'Evaluate the DNA validation condition', { type: 'dna', id: dna.dna_id }, 'preserve')))
    ],
    may_vary: allDna.slice(0, 2).map((dna) => rule(dna.flexible_properties[0], dna.variation_range.limits[0], 'Check variation against the declared DNA range', { type: 'dna', id: dna.dna_id })),
    must_not_change: [
      rule(visualDna.forbidden_mutations[0], visualDna.forbidden_mutations[0], 'Reject outputs containing the forbidden mutation', primaryMap, 'preserve')
    ],
    cross_media_rules: [
      rule('Preserve Anchor relationships when media, scale, or aspect ratio changes', anchor.inclusion_boundary[0].observable_condition, 'Compare Anchor structure across media variants', anchorMap)
    ],
    asset_usage_rules: [
      rule('Use only assets declared executable by the Generation Boundary', `Allowed asset count: ${input.allowed_assets.length}; restricted asset count: ${input.restricted_assets.length}`, 'Compare every used asset ID with the boundary lists', primaryMap, 'preserve')
    ],
    audience_boundary_rules: [
      rule('Preserve the selected Direction audience and business-model boundary', 'Subjects, products, environments, and touchpoints remain compatible with the immutable Sprint 2 Brand Context', 'Compare subjects, products, environments, and touchpoints with Brand Context', anchorMap, 'preserve')
    ],
    template_avoidance_rules: [
      rule(anchor.exclusion_boundary[0].rule, anchor.exclusion_boundary[0].observable_condition, 'Apply Anchor exclusion and Grammar avoid checks', anchorMap)
    ]
  };
  if (!firstGrammar.allowed.length) throw new Error('Visual Grammar cannot compile empty consistency rules');
  const anchorIds = new Set([anchor.anchor_id, anchor.primary_anchor.anchor_component_id, ...anchor.supporting_anchors.map((item) => item.anchor_component_id)]);
  const dnaIds = new Set(allDna.map((item) => item.dna_id));
  return validateConsistencyRules(result, { anchorIds, dnaIds });
}
