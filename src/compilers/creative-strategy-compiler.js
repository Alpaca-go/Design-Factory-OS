import {
  assertCompilerInput,
  brandElementIndex,
  clone,
  compilerEnvelope,
  coreDecisionText,
  rationaleIndex,
  resolveElements,
  resolveRationales,
  sortByDisplayOrder
} from './compiler-contract.js';

export const CREATIVE_STRATEGY_COMPILER_ID = 'creative-strategy-compiler';

const CORE_SOURCE_PATHS = Object.freeze([
  'meta.schemaVersion',
  'meta.decisionId',
  'meta.status',
  'meta.stateDigest',
  'strategy.creativeFreedom.effective',
  'strategy.creativeVision',
  'strategy.thesis',
  'strategy.actions',
  'strategy.indexes',
  'strategy.creativePrinciples',
  'strategy.photographyDirection',
  'strategy.designGoal',
  'brand.elements',
  'governance.readiness',
  'governance.blockers'
]);

function compileAction(action, elements, rationales, audit) {
  return {
    actionId: action.actionId,
    actionType: action.actionType,
    domain: action.domain,
    elementRefs: clone(action.elementRefs),
    elements: resolveElements(action.elementRefs, elements, { includeEvidence: audit }),
    directive: action.directive,
    transformationDepth: action.transformationDepth,
    ...(action.identityGuardRefs !== undefined ? { identityGuardRefs: clone(action.identityGuardRefs) } : {}),
    displayOrder: action.displayOrder,
    ...(audit ? {
      rationaleRefs: clone(action.rationaleRefs),
      evidenceRefs: clone(action.evidenceRefs),
      rationales: resolveRationales(action.rationaleRefs, rationales)
    } : {})
  };
}

export function compileCreativeStrategy(state, options = {}) {
  assertCompilerInput(state, CREATIVE_STRATEGY_COMPILER_ID);
  const audit = options.audit === true;
  const elements = brandElementIndex(state);
  const rationales = audit ? rationaleIndex(state) : null;
  const actions = sortByDisplayOrder(state.strategy.actions)
    .map((action) => compileAction(action, elements, rationales, audit));
  const groups = {
    locked: actions.filter((action) => action.actionType === 'locked'),
    evolve: actions.filter((action) => action.actionType === 'evolve'),
    flexible: actions.filter((action) => action.actionType === 'flexible')
  };
  const domainDirections = [];
  for (const action of actions) {
    let domain = domainDirections.find((item) => item.domain === action.domain);
    if (!domain) {
      domain = { domain: action.domain, actions: [] };
      domainDirections.push(domain);
    }
    domain.actions.push(action);
  }

  return compilerEnvelope(
    state,
    CREATIVE_STRATEGY_COMPILER_ID,
    'CreativeStrategyView',
    audit ? [...CORE_SOURCE_PATHS, 'decisionRecord.rationale'] : CORE_SOURCE_PATHS,
    {
      effectiveFreedom: clone(state.strategy.creativeFreedom.effective),
      creativeVision: clone(state.strategy.creativeVision),
      thesis: state.strategy.thesis,
      actions,
      groups,
      domainDirections,
      indexes: clone(state.strategy.indexes),
      creativePrinciples: sortByDisplayOrder(state.strategy.creativePrinciples)
        .map((item) => coreDecisionText(item, 'principleId')),
      photographyDirection: clone(state.strategy.photographyDirection),
      designGoal: state.strategy.designGoal
    }
  );
}
