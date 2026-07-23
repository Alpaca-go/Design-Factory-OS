import { arrayValue, objectValue, stringValue } from '../../../shared/analysis/runtime-contracts.js';

export function uniqueStringArray(value, path, options = {}) {
  const items = arrayValue(value, path, options).map((item, index) => stringValue(item, `${path}[${index}]`, { maxLength: options.itemMaxLength }));
  if (new Set(items).size !== items.length) fail(`${path} contains duplicate values`, path);
  return items;
}

export function validateTimestamp(value, path) {
  const text = stringValue(value, path);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf())) fail(`${path} must be a valid timestamp`, path);
  return parsed.toISOString();
}

export function validateHash(value, path) {
  const text = stringValue(value, path);
  if (!/^[a-f0-9]{64}$/u.test(text)) fail(`${path} must be a SHA-256 hash`, path);
  return text;
}

export function assetId(asset, path) {
  if (typeof asset === 'string') return stringValue(asset, path);
  const item = objectValue(asset, path);
  return stringValue(item.asset_id || item.assetId || item.id, `${path}.asset_id`);
}

export function validateAssetList(value, path) {
  const cloned = arrayValue(value, path).map((asset, index) => {
    assetId(asset, `${path}[${index}]`);
    return structuredClone(asset);
  });
  const ids = cloned.map((asset, index) => assetId(asset, `${path}[${index}]`));
  if (new Set(ids).size !== ids.length) fail(`${path} contains duplicate asset IDs`, path);
  return { values: cloned, ids: new Set(ids) };
}

export function evidenceId(item, path) {
  const value = objectValue(item, path);
  return stringValue(value.evidence_id || value.evidenceId || value.id, `${path}.evidence_id`);
}

export function assertKnownReferences(values, allowed, path, label = 'reference') {
  const unknown = values.filter((value) => !allowed.has(value));
  if (unknown.length) fail(`${path} contains unknown ${label}: ${unknown.join(', ')}`, path);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function fail(message, path, code = 'FAILED_SCHEMA') {
  throw Object.assign(new Error(message), { code, path });
}
