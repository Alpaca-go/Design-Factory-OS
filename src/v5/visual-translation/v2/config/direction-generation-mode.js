// Direction generation mode switch for the execution-oriented v2 experiment.
//
// The v2 experiment must coexist with the frozen production baseline `conceptual_v1`.
// Sprint 2 / Desktop / Report Compiler keep using `conceptual_v1`; only the
// experimental runner selects `execution_oriented_v2`. Nothing in this file
// modifies v1 behaviour — it is a read-only selector used by the v2 entry point.

export const DIRECTION_GENERATION_MODES = Object.freeze({
  CONCEPTUAL_V1: 'conceptual_v1',
  EXECUTION_ORIENTED_V2: 'execution_oriented_v2'
});

export const PRODUCTION_BASELINE_MODE = DIRECTION_GENERATION_MODES.EXECUTION_ORIENTED_V2;
export const EXPERIMENT_MODE = DIRECTION_GENERATION_MODES.EXECUTION_ORIENTED_V2;

export function isExecutionMode(mode) {
  return mode === DIRECTION_GENERATION_MODES.EXECUTION_ORIENTED_V2;
}

export function normalizeDirectionGenerationMode(value) {
  if (!value) return PRODUCTION_BASELINE_MODE;
  if (!Object.values(DIRECTION_GENERATION_MODES).includes(value)) {
    throw Object.assign(new Error(`Unknown direction_generation_mode: ${value}`), {
      code: 'UNKNOWN_DIRECTION_GENERATION_MODE',
      path: 'direction_generation_mode'
    });
  }
  return value;
}

export const DIRECTION_GENERATION_MODE_VERSIONS = Object.freeze({
  conceptual_v1: 'visual-directions-prompt-v1.3',
  execution_oriented_v2: 'visual-direction-v2-execution'
});
