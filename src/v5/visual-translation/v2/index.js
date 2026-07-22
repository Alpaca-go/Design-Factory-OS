// Execution-oriented Visual Direction v2 — public surface.
//
// Experimental branch `experiment/execution-oriented-directions-v2`. Coexists
// with the frozen conceptual_v1 baseline; the production pipeline keeps using
// v1. Nothing here modifies v1, Evidence, Asset Authorization, Audience
// Boundary, Direction Score v1, Difference Matrix v1 or the v1.3.3 Report
// Compiler.

export {
  DIRECTION_GENERATION_MODES,
  PRODUCTION_BASELINE_MODE,
  EXPERIMENT_MODE,
  isExecutionMode,
  normalizeDirectionGenerationMode,
  DIRECTION_GENERATION_MODE_VERSIONS
} from './config/direction-generation-mode.js';

export {
  VISUAL_DIRECTION_V2_CONTRACT_VERSION,
  REUSABLE_ASSET_TYPES,
  REQUIRED_REUSABLE_ASSET_TYPES,
  COMPOSITION_TOUCHPOINTS,
  EXECUTION_EXAMPLE_CATEGORIES,
  ANTI_CONCEPT_ART_CONSTRAINTS,
  ANTI_CONCEPT_ART_CONSTRAINT_IDS,
  DIRECTION_FAMILIES,
  DIRECTION_FAMILY_TYPES,
  CONSUMER_VALUE_ROLES,
  ASSET_AUTHORIZATION_MODES,
  PHOTOGRAPHY_REQUIREMENT_MODES,
  collectExecutionDirectionV2ValidationErrors,
  validateExecutionDirectionV2,
  validateExecutionDirectionV2Set,
  validateReusableAsset,
  validateCompositionTemplate
} from './schemas/direction-contract-v2.js';

export {
  ANCHOR_V2_CONTRACT_VERSION,
  ANCHOR_IMAGE_EXPECTED_TOUCHPOINTS,
  validateAnchorCandidateV2
} from './schemas/anchor-contract-v2.js';

export {
  EXECUTION_READINESS_EVALUATOR_VERSION,
  EXECUTION_READINESS_PASS_CRITERIA,
  evaluateExecutionReadiness,
  CONTENT_READINESS_WEIGHTS,
  calculateContentReadiness
} from './runtime/execution-readiness-evaluator.js';

export {
  checkAntiConceptArtConstraints,
  detectRealEstateDrift,
  detectAbstractOnlyDependency,
  detectRealEstateDriftFromText,
  detectAbstractOnlyFromText
} from './runtime/anti-concept-art-constraints.js';

export {
  guardAssetAuthorization,
  guardEvidencePreservation,
  guardAudienceBoundary
} from './runtime/regression-guards.js';

export { compileExecutionDirectionV2, hasCompleteExecutionExamples } from './runtime/compile-execution-direction-v2.js';

export {
  evaluateBrandIdentityPreservation
} from './runtime/brand-identity-preservation-evaluator.js';
export {
  evaluateBusinessModelCoverage
} from './runtime/business-model-coverage-evaluator.js';
export {
  evaluateConsumerValueCoverage
} from './runtime/consumer-value-coverage-evaluator.js';
export {
  normalizeConsumerValue,
  normalizeConsumerValues,
  CONSUMER_VALUE_NORMALIZER_VERSION
} from './runtime/consumer-value-normalizer.js';
export {
  aggregateGateIssues,
  gateIssueKey,
  GATE_ISSUE_AGGREGATOR_VERSION
} from './runtime/gate-issue-aggregator.js';
export {
  evaluateDirectionFamilyDifference
} from './runtime/direction-family-difference-evaluator.js';
export {
  evaluateComplianceWeight
} from './runtime/compliance-weight-controller.js';
export {
  evaluateE02AestheticGate
} from './runtime/e02-aesthetic-gate.js';
export {
  evaluateSpatialDrift
} from './runtime/spatial-drift-evaluator.js';
export {
  validateGlobalAssetIds
} from './runtime/asset-id-validator.js';
export {
  evaluateConsumerWeightConsistency
} from './runtime/consumer-weight-consistency.js';
export {
  evaluateExecutionExampleCompleteness
} from './runtime/execution-example-completeness-evaluator.js';
export {
  evaluateExecutionExampleSpecificity
} from './runtime/execution-example-specificity-evaluator.js';
export {
  evaluateIndustryRecognitionCoverage
} from './runtime/industry-recognition-classifier.js';
export {
  evaluateAssetAuthorizationSet,
  detectForgeryStructured
} from './runtime/asset-authorization-evaluator.js';

export {
  evaluateConceptualDirectionV1,
  runABComparison,
  runABRunner
} from './runtime/ab-runner.js';

export { buildExecutionDirectionV2Prompt, VISUAL_DIRECTIONS_PROMPT_V2_VERSION } from './prompts/direction-generation-prompt-v2.js';
export { ANALYSIS_PIPELINE_MODES, DEFAULT_ANALYSIS_PIPELINE_MODE, normalizeAnalysisPipelineMode, isVisualFactFirstMode, isRetrievalFirstMode } from './config/analysis-pipeline-mode.js';
export { validateVisualRelevantBrandFacts, validateVisualAssetEvidence, validateBenchmarkQueryPlan, validateBenchmarkCase, validateVisualOpportunitySynthesis } from './visual-fact-first/schemas.js';
export { compileBenchmarkQueryPlan } from './visual-fact-first/benchmark-query-compiler.js';
export { retrieveBenchmarkCases } from './visual-fact-first/benchmark-retrieval.js';
export { adaptVisualFactFirstToStep4 } from './visual-fact-first/step4-input-adapter.js';
export { evaluateVisualFactFirstAB } from './visual-fact-first/ab-evaluator.js';
export { compileVisualBrief, compileVisualBriefMarkdown } from './retrieval-first/visual-brief.js';
export { validateLightweightDirections, evaluateModelCriticAdvisory } from './runtime/lightweight-validator.js';
export { buildAnchorCandidateV2Prompt, ANCHOR_CANDIDATE_PROMPT_V2_VERSION } from './prompts/anchor-candidate-prompt-v2.js';

export { renderNestedField } from './report/compile-execution-directions-report-v2.js';
export {
  compileExecutionDirectionsReportV2,
  compileExecutionDirectionsAuditV2,
  compileVisualDirectionsReportViewModel,
  compileVisualDirectionsAuditViewModel,
  groupVisualDirectionIssues,
  renderVisualDirectionsReport,
  renderVisualDirectionsAudit
} from './report/visual-directions-report-compiler.js';
