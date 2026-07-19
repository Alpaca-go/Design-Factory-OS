import { objectValue, stringArray } from '../../../shared/analysis/runtime-contracts.js';
import { assetId, deepFreeze, fail } from './sprint-2-schema-utils.js';

export function validateGenerationBoundary(value, { allowedAssets = [], restrictedAssets = [] } = {}) {
  const root = objectValue(value, 'generationBoundary');
  const executable_assets = stringArray(root.executable_assets, 'generationBoundary.executable_assets');
  const non_executable_assets = stringArray(root.non_executable_assets, 'generationBoundary.non_executable_assets');
  const allowedIds = new Set(allowedAssets.map((asset, index) => assetId(asset, `allowedAssets[${index}]`)));
  const restrictedIds = new Set(restrictedAssets.map((asset, index) => assetId(asset, `restrictedAssets[${index}]`)));
  const invalidExecutable = executable_assets.filter((id) => !allowedIds.has(id) || restrictedIds.has(id));
  if (invalidExecutable.length) fail(`Restricted or unknown assets cannot be executable: ${invalidExecutable.join(', ')}`, 'generationBoundary.executable_assets', 'RESTRICTED_ASSET_EXECUTION');
  const overlap = executable_assets.filter((id) => non_executable_assets.includes(id));
  if (overlap.length) fail(`Assets cannot be both executable and non-executable: ${overlap.join(', ')}`, 'generationBoundary');
  const missingRestricted = [...restrictedIds].filter((id) => !non_executable_assets.includes(id));
  if (missingRestricted.length) fail(`All restricted assets must be declared non-executable: ${missingRestricted.join(', ')}`, 'generationBoundary.non_executable_assets');
  return deepFreeze({
    mandatory_prompt_inputs: stringArray(root.mandatory_prompt_inputs, 'generationBoundary.mandatory_prompt_inputs', { min: 1 }),
    optional_prompt_inputs: stringArray(root.optional_prompt_inputs, 'generationBoundary.optional_prompt_inputs'),
    negative_constraints: stringArray(root.negative_constraints, 'generationBoundary.negative_constraints', { min: 1 }),
    human_only_decisions: stringArray(root.human_only_decisions, 'generationBoundary.human_only_decisions', { min: 1 }),
    deferred_to_sprint3: stringArray(root.deferred_to_sprint3, 'generationBoundary.deferred_to_sprint3', { min: 1 }),
    executable_assets,
    non_executable_assets
  });
}
