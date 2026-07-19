import { validateGenerationBoundary } from '../schemas/generation-boundary-v1.js';

export function compileGenerationBoundary({ input, anchor, visualDna, visualGrammar }) {
  const allowed = input.allowed_assets;
  const restricted = input.restricted_assets;
  const executable_assets = allowed.filter(isCurrentlyExecutable).map(idOf);
  const non_executable_assets = unique([
    ...restricted.map(idOf),
    ...allowed.filter((asset) => !isCurrentlyExecutable(asset)).map(idOf)
  ]);
  const grammarAvoid = Object.values(visualGrammar).flatMap((grammar) => grammar.avoid.map((item) => item.rule));
  const result = {
    mandatory_prompt_inputs: ['selected_direction', 'confirmed_anchor', 'visual_dna', 'visual_grammar', 'consistency_rules'],
    optional_prompt_inputs: input.direction_risks.length ? ['direction_risks'] : [],
    negative_constraints: unique([
      ...anchor.exclusion_boundary.map((item) => item.rule),
      ...visualDna.forbidden_mutations,
      ...grammarAvoid
    ]),
    human_only_decisions: ['anchor_confirmation', 'new_asset_authorization', 'locked_asset_change_authorization'],
    deferred_to_sprint3: ['image_plan', 'shot_definition', 'model_adapter_parameters', 'prompt_compilation', 'visual_qa'],
    executable_assets,
    non_executable_assets
  };
  return validateGenerationBoundary(result, { allowedAssets: allowed, restrictedAssets: restricted });
}

function isCurrentlyExecutable(asset) {
  if (typeof asset === 'string') return false;
  const status = asset.status;
  const scope = asset.execution_scope;
  return asset.executable !== false
    && ['existing', 'derived'].includes(status)
    && !['future_identity_design', 'future_asset_collection', 'restricted', 'unknown', 'unavailable'].includes(scope);
}

function idOf(asset) {
  return typeof asset === 'string' ? asset : asset.asset_id || asset.assetId || asset.id;
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}
