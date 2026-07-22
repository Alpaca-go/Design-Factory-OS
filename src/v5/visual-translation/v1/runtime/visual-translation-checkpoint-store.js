import { buildAnalysisCheckpoint, canResumeAnalysisCheckpoint } from '../../../shared/analysis/checkpoint-store.js';
import { STAGE_SEQUENCE, VISUAL_TRANSLATION_V1 } from '../protocol/stage-registry.js';

export function buildVisualTranslationCheckpoint(options) {
  return buildAnalysisCheckpoint({
    ...options,
    checkpointVersion: VISUAL_TRANSLATION_V1.checkpointVersion,
    protocolVersion: VISUAL_TRANSLATION_V1.protocolVersion,
    stageSequence: options.stageSequence ?? STAGE_SEQUENCE[options.stageId]
  });
}

export function canResumeVisualTranslationCheckpoint(saved, expected, output) {
  return canResumeAnalysisCheckpoint(saved, {
    ...expected,
    checkpointVersion: VISUAL_TRANSLATION_V1.checkpointVersion,
    protocolVersion: VISUAL_TRANSLATION_V1.protocolVersion
  }, output);
}
