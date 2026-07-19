import { availability } from './availability.js';
import { BRAND_CONTEXT_ADAPTER_VERSION } from './versions.js';

export function adaptBrandContext(source) {
  const sourceAvailable = Boolean(source && typeof source === 'object');
  const value = sourceAvailable ? structuredClone(source) : {};
  const evidenceMap = value.evidenceMap || value.visualEvidenceMap || value.output?.evidenceMap || value.output?.visualEvidenceMap;
  const identity = evidenceMap?.identity || value.identity || {};
  const brandFacts = value.brandFacts || value.config?.brandFacts || {};
  const lockedAssets = firstDefined(
    evidenceMap?.lockedAssets,
    value.lockedAssets,
    value.metadata?.lockedAssets,
    value.config?.runtime?.lockedVisualAssets
  );

  return Object.freeze({
    adapter_version: BRAND_CONTEXT_ADAPTER_VERSION,
    brand_name: availability(firstDefined(brandFacts.brandName, identity.brandName, value.brandName), sourceAvailable),
    project_name: availability(firstDefined(identity.projectName, value.projectName), sourceAvailable),
    industry: availability(firstDefined(brandFacts.industry, value.industry), sourceAvailable),
    business_model: availability(firstDefined(brandFacts.businessModel, value.businessModel), sourceAvailable),
    locked_assets: availability(lockedAssets, sourceAvailable),
    allowed_project_ids: availability(value.allowedProjectIds, sourceAvailable)
  });
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}
