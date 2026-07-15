import {
  CREATIVE_DECISION_STATE_SCHEMA_VERSION,
  assertCreativeDecisionState
} from '../creative-decision-state.js';

export class CompilerInputError extends Error {
  constructor(compilerId, cause) {
    super(`${compilerId} 拒绝无效 Creative Decision State`, { cause });
    this.name = 'CompilerInputError';
    this.code = 'INVALID_CREATIVE_DECISION_STATE';
    this.compilerId = compilerId;
  }
}

export function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function assertCompilerInput(state, compilerId) {
  try {
    assertCreativeDecisionState(state);
  } catch (error) {
    throw new CompilerInputError(compilerId, error);
  }
  if (state.meta.schemaVersion !== CREATIVE_DECISION_STATE_SCHEMA_VERSION) {
    throw new CompilerInputError(compilerId, new Error('Unsupported Creative Decision State schema'));
  }
  return state;
}

export function compilerEnvelope(state, compilerId, kind, sourcePaths, payload) {
  return deepFreeze({
    kind,
    compilerId,
    schemaVersion: state.meta.schemaVersion,
    decisionId: state.meta.decisionId,
    stateDigest: state.meta.stateDigest,
    stateStatus: state.meta.status,
    readiness: state.governance.readiness,
    ready: state.governance.readiness === 'release-ready' && state.governance.blockers.length === 0,
    blockers: clone(state.governance.blockers),
    sourcePaths: [...sourcePaths],
    ...payload
  });
}

export function sortByDisplayOrder(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => left.item.displayOrder - right.item.displayOrder || left.index - right.index)
    .map(({ item }) => item);
}

export function unique(values) {
  return [...new Set(values)];
}

export function coreBrandElement(element) {
  return {
    elementId: element.elementId,
    name: element.name,
    kind: element.kind,
    definition: element.definition,
    verificationStatus: element.verificationStatus,
    evidenceRefs: clone(element.evidenceRefs)
  };
}

export function brandElementIndex(state) {
  return new Map(state.brand.elements.map((element) => [element.elementId, element]));
}

export function resolveElements(refs, index, options = {}) {
  return unique(refs).map((ref) => {
    const element = coreBrandElement(index.get(ref));
    if (options.includeEvidence !== true) delete element.evidenceRefs;
    return element;
  });
}

export function coreDecisionText(value, idField) {
  return {
    ...(idField ? { [idField]: value[idField] } : {}),
    statement: value.statement,
    status: value.status,
    evidenceRefs: clone(value.evidenceRefs),
    displayOrder: value.displayOrder
  };
}

export function rationaleIndex(state) {
  return new Map(state.decisionRecord.rationale.map((item) => [item.rationaleId, item]));
}

export function resolveRationales(refs, index) {
  return unique(refs).map((ref) => {
    const item = index.get(ref);
    return {
      rationaleId: item.rationaleId,
      statement: item.statement,
      evidenceRefs: clone(item.evidenceRefs),
      displayOrder: item.displayOrder
    };
  });
}

export function limitCharacters(text, maximum) {
  if (text.length <= maximum) return text;
  if (maximum <= 1) return text.slice(0, maximum);
  return `${text.slice(0, maximum - 1).trimEnd()}…`;
}
