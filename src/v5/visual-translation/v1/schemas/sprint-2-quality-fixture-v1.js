import { enumValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { deepFreeze, fail } from './sprint-2-schema-utils.js';

export const SPRINT_2_FIXTURE_MODULES = Object.freeze(['anchor_direction', 'visual_dna', 'visual_grammar']);
export const SPRINT_2_PROJECT_TYPES = Object.freeze(['b2b', 'consumer_goods', 'cultural_brand', 'packaging', 'ip', 'technology_service']);

export function validateSprint2QualityFixture(value) {
  const root = objectValue(value, 'sprint2QualityFixture');
  const expected_anti_patterns = stringArray(root.expected_anti_patterns, 'sprint2QualityFixture.expected_anti_patterns');
  const expected_repair_actions = stringArray(root.expected_repair_actions, 'sprint2QualityFixture.expected_repair_actions');
  if (expected_anti_patterns.length && !expected_repair_actions.length) fail('A failing Golden Fixture requires expected Repair Actions', 'sprint2QualityFixture.expected_repair_actions');
  return deepFreeze({
    fixture_version: 'sprint-2-quality-fixture-v1',
    fixture_id: stringValue(root.fixture_id, 'sprint2QualityFixture.fixture_id'),
    project_type: enumValue(root.project_type, SPRINT_2_PROJECT_TYPES, 'sprint2QualityFixture.project_type'),
    module: enumValue(root.module, SPRINT_2_FIXTURE_MODULES, 'sprint2QualityFixture.module'),
    input: structuredClone(objectValue(root.input, 'sprint2QualityFixture.input')),
    expected_anti_patterns,
    expected_module_status: enumValue(root.expected_module_status, ['passed', 'failed', 'not_evaluated'], 'sprint2QualityFixture.expected_module_status'),
    expected_repair_actions,
    semantic_evaluator_skip_allowed: booleanField(root.semantic_evaluator_skip_allowed, 'sprint2QualityFixture.semantic_evaluator_skip_allowed'),
    human_notes: stringValue(root.human_notes, 'sprint2QualityFixture.human_notes')
  });
}

function booleanField(value, path) {
  if (typeof value !== 'boolean') throw Object.assign(new Error(`${path} must be boolean`), { code: 'FAILED_SCHEMA', path });
  return value;
}

export function validateSprint2FixtureImport(value) {
  const root = objectValue(value, 'sprint2FixtureImport');
  return deepFreeze({
    import_contract_version: 'sprint-2-fixture-import-v1',
    fixture_id: stringValue(root.fixture_id, 'sprint2FixtureImport.fixture_id'),
    project_type: enumValue(root.project_type, SPRINT_2_PROJECT_TYPES, 'sprint2FixtureImport.project_type'),
    source_kind: enumValue(root.source_kind, ['desensitized_fixture'], 'sprint2FixtureImport.source_kind'),
    input: structuredClone(objectValue(root.input, 'sprint2FixtureImport.input')),
    redaction_notes: stringArray(root.redaction_notes, 'sprint2FixtureImport.redaction_notes', { min: 1 })
  });
}
