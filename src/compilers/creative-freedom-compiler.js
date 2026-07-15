import {
  assertCompilerInput,
  clone,
  compilerEnvelope
} from './compiler-contract.js';

export const CREATIVE_FREEDOM_COMPILER_ID = 'creative-freedom-compiler';

const CORE_SOURCE_PATHS = Object.freeze([
  'meta.schemaVersion',
  'meta.decisionId',
  'meta.status',
  'meta.stateDigest',
  'strategy.creativeFreedom.recommendation.freedom',
  'strategy.creativeFreedom.recommendation.mode',
  'strategy.creativeFreedom.recommendation.confidence',
  'strategy.creativeFreedom.recommendation.briefWhy',
  'strategy.creativeFreedom.humanOverride',
  'strategy.creativeFreedom.effective',
  'governance.readiness',
  'governance.blockers'
]);

const AUDIT_SOURCE_PATHS = Object.freeze([
  'strategy.creativeFreedom.recommendation.why',
  'strategy.creativeFreedom.factors',
  'provenance.evidenceIndex'
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

export function compileCreativeFreedom(state, options = {}) {
  assertCompilerInput(state, CREATIVE_FREEDOM_COMPILER_ID);
  const source = state.strategy.creativeFreedom;
  const audit = options.audit === true;
  const recommendation = {
    freedom: source.recommendation.freedom,
    mode: source.recommendation.mode,
    confidence: source.recommendation.confidence,
    briefWhy: clone(source.recommendation.briefWhy)
  };

  return compilerEnvelope(
    state,
    CREATIVE_FREEDOM_COMPILER_ID,
    'CreativeFreedomView',
    audit ? [...CORE_SOURCE_PATHS, ...AUDIT_SOURCE_PATHS] : CORE_SOURCE_PATHS,
    {
      recommendation,
      humanOverride: clone(source.humanOverride),
      effective: clone(source.effective),
      overrideApplied: source.humanOverride.type !== 'auto',
      ...(audit ? {
        audit: {
          why: clone(source.recommendation.why),
          factors: clone(source.factors),
          evidenceIndex: state.provenance.evidenceIndex.map(coreEvidence)
        }
      } : {})
    }
  );
}
