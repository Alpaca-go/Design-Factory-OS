import { assertCompilerInput, deepFreeze } from './compilers/compiler-contract.js';
import { compileCreativeFreedom } from './compilers/creative-freedom-compiler.js';
import { compileCreativeStrategy } from './compilers/creative-strategy-compiler.js';
import { compileDesignConstraints } from './compilers/design-constraints-compiler.js';
import { compileCreativeBriefV4 } from './compilers/creative-brief-compiler.js';
import { compileDesignDecisionsV4 } from './compilers/design-decisions-compiler.js';
import { readCreativeDecisionState } from './creative-decision-state-store.js';
import { createPerformanceProfiler } from './performance-profiler.js';

export const COMPILER_PIPELINE_ID = 'creative-decision-compiler-pipeline';

export const COMPILER_STAGE_ORDER = Object.freeze([
  'creativeFreedom',
  'creativeStrategy',
  'designConstraints',
  'creativeBrief',
  'designDecisions'
]);

export function compileCreativeDecisionState(state, options = {}) {
  assertCompilerInput(state, COMPILER_PIPELINE_ID);
  const measure = options.profiler
    ? (stage, operation) => options.profiler.syncStage(stage, operation)
    : (_stage, operation) => operation();
  return measure('compilerPipeline', () => {
    const result = {
      kind: 'CompilerPipelineResult',
      pipelineId: COMPILER_PIPELINE_ID,
      schemaVersion: state.meta.schemaVersion,
      decisionId: state.meta.decisionId,
      stateDigest: state.meta.stateDigest,
      stateStatus: state.meta.status,
      readiness: state.governance.readiness,
      stageOrder: [...COMPILER_STAGE_ORDER],
      creativeFreedom: compileCreativeFreedom(state),
      creativeStrategy: compileCreativeStrategy(state),
      designConstraints: compileDesignConstraints(state),
      creativeBrief: measure('creativeBrief', () => compileCreativeBriefV4(state)),
      designDecisions: compileDesignDecisionsV4(state)
    };
    return deepFreeze(result);
  });
}

export async function compileActiveCreativeDecision(projectRoot) {
  const state = await readCreativeDecisionState(projectRoot, { required: true });
  return compileCreativeDecisionState(state);
}

export function profileCreativeDecisionState(state, options = {}) {
  const profiler = createPerformanceProfiler(options.profilerOptions);
  const result = compileCreativeDecisionState(state, { profiler });
  const performance = profiler.snapshot({
    ...options.context,
    decisionId: state.meta.decisionId
  });
  return deepFreeze({ result, performance });
}

export async function profileActiveCreativeDecision(projectRoot, options = {}) {
  const state = await readCreativeDecisionState(projectRoot, { required: true });
  return profileCreativeDecisionState(state, options);
}
