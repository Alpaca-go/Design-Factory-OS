const assetItems = (visualAssetEvidence = {}) => Object.entries(visualAssetEvidence)
  .filter(([key, value]) => key !== 'unresolved' && Array.isArray(value))
  .flatMap(([group, value]) => value.map((item) => ({ ...item, group })));

export function buildVisualAssetPipelineStatus({ visualAssetEvidence, inputProvided = false, directions = [] } = {}) {
  const items = assetItems(visualAssetEvidence);
  const provided = inputProvided || items.length > 0;
  const knownIds = new Set(items.map((item) => item.evidence_id || item.asset_id).filter(Boolean));
  const referencedIds = new Set(directions.flatMap((entry) => entry?.direction?.asset_references || entry?.asset_references || []));
  const usedIds = [...referencedIds].filter((id) => knownIds.has(id));
  const unresolved = visualAssetEvidence?.unresolved || [];
  const inputStatus = provided ? 'provided' : 'not_provided';
  const analysisStatus = !provided ? 'not_applicable'
    : items.length === 0 ? 'failed'
      : unresolved.length ? 'partial'
        : 'complete';
  const usageStatus = !provided ? 'not_applicable' : usedIds.length ? 'referenced' : 'not_referenced';
  return Object.freeze({
    input_status: inputStatus,
    analysis_status: analysisStatus,
    usage_status: usageStatus,
    available_asset_ids: Object.freeze([...knownIds]),
    referenced_asset_ids: Object.freeze(usedIds)
  });
}

