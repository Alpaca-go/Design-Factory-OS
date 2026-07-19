export const VISUAL_TRANSLATION_SPRINT_2A = Object.freeze({
  protocolVersion: 'visual-translation-protocol-v2',
  inputContractVersion: 'sprint-2-input-contract-v1',
  schemaVersion: 'visual-language-system-v1',
  checkpointVersion: 'visual-translation-sprint-2-checkpoint-v1',
  runtimeCheckpointVersion: 'visual-translation-sprint-2-checkpoint-v2',
  runtimeVersion: 'visual-language-construction-runtime-v1',
  qualityCalibrationVersion: 'visual-language-quality-calibration-v1',
  qualityCliVersion: 'sprint-2-quality-cli-v1',
  reportAppendVersion: 'visual-translation-sprint-2-report-append-v1',
  checkpointStageId: '20-sprint-2-visual-language-system',
  checkpointStatus: Object.freeze(['draft', 'pending_anchor_confirmation', 'confirmed'])
});

export const SPRINT_2_RUNTIME_MODULES = Object.freeze([
  'anchor_candidates',
  'anchor_confirmation',
  'visual_dna',
  'shape_composition_grammar',
  'material_lighting_grammar',
  'motion_information_grammar',
  'consistency_rules',
  'generation_boundary'
]);
