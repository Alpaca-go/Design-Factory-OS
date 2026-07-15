import {
  BRAND_DNA_DIMENSION_IDS
} from '../creative-decision-state.js';
import {
  assertCompilerInput,
  clone,
  compilerEnvelope,
  coreBrandElement,
  sortByDisplayOrder
} from './compiler-contract.js';
import { compileCreativeFreedom } from './creative-freedom-compiler.js';
import { compileCreativeStrategy } from './creative-strategy-compiler.js';
import { compileDesignConstraints } from './design-constraints-compiler.js';

export const DESIGN_DECISIONS_COMPILER_ID = 'design-decisions-compiler-v4';

const SOURCE_PATHS = Object.freeze([
  'meta.schemaVersion',
  'meta.decisionContractVersion',
  'meta.decisionId',
  'meta.projectId',
  'meta.projectVersion',
  'meta.status',
  'meta.createdAt',
  'meta.approvedAt',
  'meta.supersedesDecisionId',
  'meta.stateDigest',
  'provenance.inputDigests',
  'provenance.reasoningRuns',
  'provenance.reasoningContractDigest',
  'provenance.sourceTimestamps',
  'provenance.evidenceIndex',
  'provenance.dataPolicyRef',
  'brand.approvedBrandDNA',
  'brand.elements',
  'strategy.creativeFreedom',
  'strategy.creativeVision',
  'strategy.thesis',
  'strategy.actions',
  'strategy.indexes',
  'strategy.creativePrinciples',
  'strategy.photographyDirection',
  'strategy.designGoal',
  'constraints.elementPolicies',
  'constraints.forbiddenDirections',
  'constraints.unresolved',
  'constraints.conflicts',
  'decisionRecord',
  'governance.approvals',
  'governance.blockers',
  'governance.warnings',
  'governance.invariantChecks',
  'governance.readiness'
]);

function coreEvidence(item) {
  return {
    evidenceId: item.evidenceId,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    locator: item.locator,
    summary: item.summary,
    observedAt: item.observedAt,
    sourceDigest: item.sourceDigest,
    confidentiality: item.confidentiality
  };
}

function coreDna(state) {
  return {
    status: state.brand.approvedBrandDNA.status,
    dimensions: Object.fromEntries(BRAND_DNA_DIMENSION_IDS.map((id) => {
      const item = state.brand.approvedBrandDNA.dimensions[id];
      return [id, {
        directive: item.directive,
        elementRefs: clone(item.elementRefs),
        evidenceRefs: clone(item.evidenceRefs),
        status: item.status,
        displayOrder: item.displayOrder
      }];
    }))
  };
}

function coreAuditCollection(items, idField) {
  return sortByDisplayOrder(items).map((item) => ({
    [idField]: item[idField],
    statement: item.statement,
    evidenceRefs: clone(item.evidenceRefs),
    displayOrder: item.displayOrder
  }));
}

function freedomPayload(view) {
  return {
    recommendation: clone(view.recommendation),
    humanOverride: clone(view.humanOverride),
    effective: clone(view.effective),
    overrideApplied: view.overrideApplied,
    audit: clone(view.audit)
  };
}

function strategyPayload(view) {
  return {
    effectiveFreedom: clone(view.effectiveFreedom),
    creativeVision: clone(view.creativeVision),
    thesis: view.thesis,
    actions: clone(view.actions),
    groups: clone(view.groups),
    domainDirections: clone(view.domainDirections),
    indexes: clone(view.indexes),
    creativePrinciples: clone(view.creativePrinciples),
    photographyDirection: clone(view.photographyDirection),
    designGoal: view.designGoal
  };
}

function constraintsPayload(view) {
  return {
    policies: clone(view.policies),
    groups: clone(view.groups),
    forbiddenDirections: clone(view.forbiddenDirections),
    unresolved: clone(view.unresolved),
    conflicts: clone(view.conflicts),
    conflictStatus: clone(view.conflictStatus),
    approvedBrandDNAStatus: view.approvedBrandDNAStatus,
    invariantChecks: clone(view.invariantChecks)
  };
}

function renderList(items, formatter) {
  return items.map((item) => `- ${formatter(item)}`).join('\n');
}

function renderGovernanceItem(item) {
  return typeof item === 'string' ? item : JSON.stringify(item);
}

function renderMarkdown(state, decisions) {
  const record = decisions.decisionRecord;
  const freedom = decisions.creativeFreedom;
  const strategy = decisions.strategy;
  const constraints = decisions.constraints;
  const rationale = renderList(record.rationale, (item) => `${item.rationaleId}: ${item.statement}`);
  const tradeoffs = renderList(record.tradeoffs, (item) => `${item.tradeoffId}: ${item.statement}`);
  const rejected = renderList(record.rejectedDirections, (item) => `${item.directionId}: ${item.statement}`);
  const actions = renderList(strategy.actions, (item) => `[${item.actionType}] ${item.domain}: ${item.directive}`);
  const policies = renderList(constraints.policies, (item) => `[${item.classification}] ${item.element.name}: ${item.directive}`);
  const forbidden = renderList(constraints.forbiddenDirections, (item) => item.statement);
  const principles = renderList(strategy.creativePrinciples, (item) => item.statement);
  const unresolved = renderList(constraints.unresolved, (item) => `${item.unresolvedId}: ${item.question} [${item.requiredBefore}]`);
  const conflicts = renderList(
    constraints.conflicts,
    (item) => `${item.conflictId}: ${item.description} [${item.severity}/${item.resolutionStatus}]`
  );
  const warnings = renderList(decisions.governance.warnings, renderGovernanceItem);
  const blockers = renderList(decisions.governance.blockers, renderGovernanceItem);
  const dna = renderList(
    Object.entries(decisions.approvedBrandDNA.dimensions).sort((left, right) => left[1].displayOrder - right[1].displayOrder),
    ([id, item]) => `${id}: ${item.directive}`
  );
  return [
    '# Design Decisions',
    `Decision ID: ${state.meta.decisionId}`,
    `State Digest: ${state.meta.stateDigest}`,
    '## Creative Decision',
    record.statement,
    '## Rationale',
    rationale,
    '## Tradeoffs',
    tradeoffs,
    '## Rejected Directions',
    rejected,
    '## Creative Freedom',
    `Recommended: ${freedom.recommendation.freedom}% / ${freedom.recommendation.mode} / ${freedom.recommendation.confidence}`,
    `Effective: ${freedom.effective.freedom === null ? '—' : `${freedom.effective.freedom}%`} / ${freedom.effective.mode} / ${freedom.effective.source}`,
    '## Strategy Actions',
    strategy.creativeVision.statement,
    strategy.creativeVision.direction,
    strategy.thesis,
    actions,
    '## Creative Principles',
    principles,
    '## Photography Direction',
    Object.entries(strategy.photographyDirection).map(([key, value]) => `${key}: ${value}`).join('\n\n'),
    '## Design Goal',
    strategy.designGoal,
    '## Constraints',
    policies,
    '## Forbidden Directions',
    forbidden,
    '## Unresolved Constraints',
    unresolved,
    '## Conflicts',
    conflicts,
    '## Approved Brand DNA',
    dna,
    '## Override Audit',
    record.overrideAudit.summary,
    '## Approval',
    `Brand DNA: ${decisions.governance.approvals.brandDNA.status}`,
    `Creative Decision: ${decisions.governance.approvals.creativeDecision.status}`,
    `Readiness: ${decisions.governance.readiness}`,
    '## Warnings',
    warnings,
    '## Blockers',
    blockers
  ].join('\n\n');
}

export function compileDesignDecisionsV4(state) {
  assertCompilerInput(state, DESIGN_DECISIONS_COMPILER_ID);
  const freedom = compileCreativeFreedom(state, { audit: true });
  const strategy = compileCreativeStrategy(state, { audit: true });
  const constraints = compileDesignConstraints(state, { audit: true });
  const decisions = {
    meta: {
      schemaVersion: state.meta.schemaVersion,
      decisionContractVersion: state.meta.decisionContractVersion,
      decisionId: state.meta.decisionId,
      projectId: state.meta.projectId,
      projectVersion: state.meta.projectVersion,
      status: state.meta.status,
      createdAt: state.meta.createdAt,
      approvedAt: state.meta.approvedAt,
      ...(state.meta.supersedesDecisionId !== undefined ? { supersedesDecisionId: state.meta.supersedesDecisionId } : {}),
      stateDigest: state.meta.stateDigest
    },
    provenance: {
      inputDigests: clone(state.provenance.inputDigests),
      reasoningRuns: clone(state.provenance.reasoningRuns),
      reasoningContractDigest: state.provenance.reasoningContractDigest,
      sourceTimestamps: clone(state.provenance.sourceTimestamps),
      evidenceIndex: state.provenance.evidenceIndex.map(coreEvidence),
      dataPolicyRef: state.provenance.dataPolicyRef
    },
    approvedBrandDNA: coreDna(state),
    brandElements: state.brand.elements.map(coreBrandElement),
    creativeFreedom: freedomPayload(freedom),
    strategy: strategyPayload(strategy),
    constraints: constraintsPayload(constraints),
    decisionRecord: {
      statement: state.decisionRecord.statement,
      rationale: coreAuditCollection(state.decisionRecord.rationale, 'rationaleId'),
      tradeoffs: coreAuditCollection(state.decisionRecord.tradeoffs, 'tradeoffId'),
      rejectedDirections: coreAuditCollection(state.decisionRecord.rejectedDirections, 'directionId'),
      overrideAudit: clone(state.decisionRecord.overrideAudit),
      ...(state.decisionRecord.changeSummary !== undefined ? { changeSummary: state.decisionRecord.changeSummary } : {})
    },
    governance: {
      approvals: clone(state.governance.approvals),
      blockers: clone(state.governance.blockers),
      warnings: clone(state.governance.warnings),
      invariantChecks: clone(state.governance.invariantChecks),
      readiness: state.governance.readiness
    }
  };

  return compilerEnvelope(
    state,
    DESIGN_DECISIONS_COMPILER_ID,
    'DesignDecisionsCompilation',
    SOURCE_PATHS,
    {
      designDecisions: decisions,
      markdown: renderMarkdown(state, decisions)
    }
  );
}
