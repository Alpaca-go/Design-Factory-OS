import crypto from 'node:crypto';

export function stableSourceHash(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

export function stableSerialize(value) {
  if (value === null) return 'null';
  if (value === undefined) return '"__undefined__"';
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  throw new TypeError(`Unsupported source hash value: ${typeof value}`);
}
