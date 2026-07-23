import { ANTI_PATTERN_RULE_TYPES, ANTI_PATTERN_SEVERITIES } from './constants.js';

const ID_PATTERN = /^AP-[A-Z]+-[0-9]{3}$/;
const DEFAULT_BASE_PENALTY = Object.freeze({ S1: 2, S2: 6, S3: 12, S4: 0 });
const PENALTY_RANGES = Object.freeze({ S1: [1, 3], S2: [4, 8], S3: [9, 15], S4: [0, 0] });

export class AntiPatternRegistry {
  #definitions = new Map();

  register(definition) {
    const normalized = normalizeDefinition(definition);
    if (this.#definitions.has(normalized.id)) throw new Error(`Anti-pattern already registered: ${normalized.id}`);
    this.#definitions.set(normalized.id, normalized);
    return this;
  }

  registerMany(definitions) {
    for (const definition of definitions) this.register(definition);
    return this;
  }

  get(id) {
    return this.#definitions.get(id);
  }

  list({ module } = {}) {
    return [...this.#definitions.values()].filter((definition) => !module || definition.scope.includes('*') || definition.scope.includes(module));
  }

  get size() {
    return this.#definitions.size;
  }
}

function normalizeDefinition(definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('Anti-pattern definition must be an object');
  if (!ID_PATTERN.test(definition.id)) throw new TypeError(`Invalid anti-pattern id: ${definition.id}`);
  if (typeof definition.name !== 'string' || !definition.name.trim()) throw new TypeError(`${definition.id}.name is required`);
  if (!Array.isArray(definition.scope) || !definition.scope.length || definition.scope.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new TypeError(`${definition.id}.scope must be a non-empty string array`);
  }
  if (!ANTI_PATTERN_SEVERITIES.includes(definition.severity)) throw new TypeError(`${definition.id}.severity is invalid`);
  if (!ANTI_PATTERN_RULE_TYPES.includes(definition.ruleType)) throw new TypeError(`${definition.id}.ruleType is invalid`);
  if (typeof definition.detect !== 'function') throw new TypeError(`${definition.id}.detect must be a function`);
  if (typeof definition.risk !== 'string' || !definition.risk.trim()) throw new TypeError(`${definition.id}.risk is required`);
  if (!Array.isArray(definition.exceptions)) throw new TypeError(`${definition.id}.exceptions must be an array`);
  if (!Array.isArray(definition.repair) || !definition.repair.length) throw new TypeError(`${definition.id}.repair must be a non-empty array`);
  const basePenalty = definition.basePenalty ?? DEFAULT_BASE_PENALTY[definition.severity];
  const [minimumPenalty, maximumPenalty] = PENALTY_RANGES[definition.severity];
  if (!Number.isFinite(basePenalty) || basePenalty < minimumPenalty || basePenalty > maximumPenalty) {
    throw new TypeError(`${definition.id}.basePenalty must be within ${minimumPenalty}-${maximumPenalty} for ${definition.severity}`);
  }

  return Object.freeze({
    id: definition.id,
    name: definition.name.trim(),
    scope: Object.freeze([...new Set(definition.scope.map((item) => item.trim()))]),
    severity: definition.severity,
    ruleType: definition.ruleType,
    basePenalty,
    risk: definition.risk.trim(),
    exceptions: Object.freeze([...definition.exceptions]),
    repair: Object.freeze([...definition.repair]),
    detect: definition.detect
  });
}
