// Asset ID Global Uniqueness Gate (doc section 八).
//
// Every reusable visual asset must carry a globally unique asset_id across the
// three directions (recommended format E01-G-01 / E01-I-01 / E01-P-01 / E01-L-01).
// Duplicate ids indicate a copy-paste error and must block execution.

export const ASSET_ID_VALIDATOR_VERSION = 'asset-id-validator-v1';

export function validateGlobalAssetIds(directions = []) {
  const occurrences = new Map(); // asset_id -> [direction_id, ...]
  for (const direction of directions) {
    const assets = direction.core_reusable_assets || [];
    for (const asset of assets) {
      const id = asset?.asset_id;
      if (!id) continue;
      if (!occurrences.has(id)) occurrences.set(id, []);
      occurrences.get(id).push(direction.direction_id);
    }
  }

  const duplicates = [];
  for (const [assetId, directionIds] of occurrences.entries()) {
    if (directionIds.length > 1) duplicates.push({ asset_id: assetId, direction_ids: directionIds });
  }

  const duplicateDetected = duplicates.length > 0;
  const blockingReasons = duplicateDetected
    ? duplicates.map((d) => `duplicate_asset_id:${d.asset_id}(${d.direction_ids.join('/')})`)
    : [];

  return {
    evaluator_version: ASSET_ID_VALIDATOR_VERSION,
    duplicate_detected: duplicateDetected,
    duplicate_count: duplicates.length,
    duplicates,
    blocking_reasons: blockingReasons
  };
}
