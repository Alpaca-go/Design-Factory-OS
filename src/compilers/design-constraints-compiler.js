import {
  assertCompilerInput,
  brandElementIndex,
  clone,
  compilerEnvelope,
  rationaleIndex,
  resolveElements,
  resolveRationales,
  sortByDisplayOrder
} from './compiler-contract.js';

export const DESIGN_CONSTRAINTS_COMPILER_ID = 'design-constraints-compiler';

const CORE_SOURCE_PATHS = Object.freeze([
  'meta.schemaVersion',
  'meta.decisionId',
  'meta.status',
  'meta.stateDigest',
  'constraints.elementPolicies',
  'constraints.forbiddenDirections',
  'constraints.unresolved',
  'constraints.conflicts',
  'brand.elements',
  'brand.approvedBrandDNA',
  'governance.invariantChecks',
  'governance.readiness',
  'governance.blockers'
]);

function compilePolicy(policy, elements, rationales, audit) {
  return {
    policyId: policy.policyId,
    elementRef: policy.elementRef,
    element: resolveElements([policy.elementRef], elements, { includeEvidence: audit })[0],
    classification: policy.classification,
    directive: policy.directive,
    ...(policy.identityGuardRefs !== undefined ? { identityGuardRefs: clone(policy.identityGuardRefs) } : {}),
    displayOrder: policy.displayOrder,
    ...(audit ? {
      reasonRef: policy.reasonRef,
      evidenceRefs: clone(policy.evidenceRefs),
      rationale: resolveRationales([policy.reasonRef], rationales)[0]
    } : {})
  };
}

function compileForbiddenDirection(item) {
  return {
    ruleId: item.ruleId,
    statement: item.statement,
    appliesToRefs: clone(item.appliesToRefs),
    rationaleRef: item.rationaleRef,
    evidenceRefs: clone(item.evidenceRefs),
    displayOrder: item.displayOrder
  };
}

export function compileDesignConstraints(state, options = {}) {
  assertCompilerInput(state, DESIGN_CONSTRAINTS_COMPILER_ID);
  const audit = options.audit === true;
  const elements = brandElementIndex(state);
  const rationales = audit ? rationaleIndex(state) : null;
  const policies = sortByDisplayOrder(state.constraints.elementPolicies)
    .map((policy) => compilePolicy(policy, elements, rationales, audit));
  const groups = {
    locked: policies.filter((policy) => policy.classification === 'locked'),
    evolve: policies.filter((policy) => policy.classification === 'evolve'),
    flexible: policies.filter((policy) => policy.classification === 'flexible')
  };
  const conflicts = clone(state.constraints.conflicts);
  const conflictStatus = {
    total: conflicts.length,
    open: conflicts.filter((item) => item.resolutionStatus === 'open').length,
    blockers: conflicts.filter((item) => item.severity === 'blocker').length,
    openBlockers: conflicts.filter((item) => item.severity === 'blocker' && item.resolutionStatus === 'open').length
  };

  return compilerEnvelope(
    state,
    DESIGN_CONSTRAINTS_COMPILER_ID,
    'DesignConstraintsView',
    audit ? [...CORE_SOURCE_PATHS, 'decisionRecord.rationale'] : CORE_SOURCE_PATHS,
    {
      policies,
      groups,
      forbiddenDirections: sortByDisplayOrder(state.constraints.forbiddenDirections).map(compileForbiddenDirection),
      unresolved: clone(state.constraints.unresolved),
      conflicts,
      conflictStatus,
      approvedBrandDNAStatus: state.brand.approvedBrandDNA.status,
      invariantChecks: clone(state.governance.invariantChecks)
    }
  );
}
