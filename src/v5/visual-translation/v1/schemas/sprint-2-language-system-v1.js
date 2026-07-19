import { objectValue } from '../../../shared/analysis/runtime-contracts.js';
import { validateAnchorDirection } from './anchor-direction-v1.js';
import { validateConsistencyRules } from './consistency-rules-v1.js';
import { validateGenerationBoundary } from './generation-boundary-v1.js';
import { validateVisualDna } from './visual-dna-v1.js';
import { validateVisualGrammar } from './visual-grammar-v1.js';
import { deepFreeze, evidenceId } from './sprint-2-schema-utils.js';

export function validateSprint2LanguageSystem(value, input) {
  const root = objectValue(value, 'sprint2LanguageSystem');
  const evidenceIds = new Set(input.evidence_index.map((item, index) => evidenceId(item, `sprint2Input.evidence_index[${index}]`)));
  const anchor_direction = validateAnchorDirection(root.anchor_direction, { evidenceIds });
  const anchorIds = new Set([
    anchor_direction.anchor_id,
    anchor_direction.primary_anchor.anchor_component_id,
    ...anchor_direction.supporting_anchors.map((item) => item.anchor_component_id)
  ]);
  const visual_dna = validateVisualDna(root.visual_dna, { evidenceIds, anchorIds });
  const dnaIds = new Set([...visual_dna.primary_dna, ...visual_dna.supporting_dna].map((item) => item.dna_id));
  const visual_grammar = validateVisualGrammar(root.visual_grammar, { anchorIds });
  const consistency_rules = validateConsistencyRules(root.consistency_rules, { anchorIds, dnaIds });
  const generation_boundary = validateGenerationBoundary(root.generation_boundary, {
    allowedAssets: input.allowed_assets,
    restrictedAssets: input.restricted_assets
  });
  return deepFreeze({ anchor_direction, visual_dna, visual_grammar, consistency_rules, generation_boundary });
}
