import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AntiPatternRegistry,
  PHASE_2_RULE_IDS,
  createAntiPatternValidator,
  createPhase2Registry,
  createShadowModeValidator,
  defineSemanticEvaluator
} from '../validators/index.js';

const fixtureRoot = path.resolve(import.meta.dirname, 'fixtures/quality-system/phase2');
const criticalRuleIds = new Set(['AP-BRAND-002', 'AP-BRAND-003', 'AP-BRAND-004', 'AP-REP-003', 'AP-PKG-001', 'AP-PKG-002']);

const evaluator = defineSemanticEvaluator(({ ruleId, metadata }) => metadata.semanticFindings?.[ruleId] || false);

async function fixture(name) {
  return JSON.parse(await fs.readFile(path.join(fixtureRoot, name), 'utf8'));
}

function detected(result) {
  return result.anti_patterns.filter((finding) => finding.detected && !finding.exception_applied);
}

test('Phase 2 registry contains exactly the selected rules and all three rule types', () => {
  const definitions = createPhase2Registry({ evaluator }).list();
  assert.equal(definitions.length, 22);
  assert.deepEqual(definitions.map((definition) => definition.id), [...PHASE_2_RULE_IDS]);
  assert.deepEqual(new Set(definitions.map((definition) => definition.ruleType)), new Set(['deterministic', 'semantic', 'hybrid']));
});

test('normal fixture passes in shadow mode', async () => {
  const sample = await fixture('pass.json');
  const result = await createShadowModeValidator({ evaluator }).validate(sample);
  assert.equal(result.mode, 'shadow');
  assert.equal(result.status, sample.expectedStatus);
  assert.deepEqual(detected(result), []);
  assert.equal(result.mqs_score, null);
});

test('every focused-error fixture hits its expected rule set with evidence and repair', async (t) => {
  const { cases } = await fixture('single-errors.json');
  assert.equal(cases.length, PHASE_2_RULE_IDS.length);
  for (const sample of cases) {
    await t.test(sample.ruleId, async () => {
      const result = await createShadowModeValidator({ evaluator }).validate(sample);
      const findings = detected(result);
      assert.deepEqual(findings.map((finding) => finding.anti_pattern_id), sample.expectedRuleIds || [sample.ruleId]);
      assert.equal(result.status, sample.expectedStatus);
      assert.ok(findings[0].evidence.length > 0, `${sample.ruleId} 缺少证据`);
      assert.ok(findings[0].repair.length > 0, `${sample.ruleId} 缺少 Repair Action`);
      if (criticalRuleIds.has(sample.ruleId)) {
        assert.equal(findings[0].severity, 'S4');
        assert.ok(result.hard_fails.some((finding) => finding.id === sample.ruleId));
        assert.equal(findings[0].penalty, 0);
      }
    });
  }
});

test('deterministic hits always expose explicit evidence', async () => {
  const { cases } = await fixture('single-errors.json');
  const validator = createShadowModeValidator({ evaluator });
  for (const sample of cases) {
    const result = await validator.validate(sample);
    for (const finding of detected(result).filter((item) => item.evaluation_mode === 'deterministic')) {
      assert.ok(finding.evidence.length >= 1, `${finding.anti_pattern_id} must expose deterministic evidence`);
      assert.notEqual(finding.confidence, 0);
    }
  }
});

test('two composite fixtures retain every expected finding', async (t) => {
  const { cases } = await fixture('composite-errors.json');
  assert.ok(cases.length >= 2);
  for (const sample of cases) {
    await t.test(sample.name, async () => {
      const result = await createShadowModeValidator({ evaluator }).validate(sample);
      assert.equal(result.status, sample.expectedStatus);
      const ids = detected(result).map((finding) => finding.anti_pattern_id);
      for (const expectedRule of sample.expectedRules) assert.ok(ids.includes(expectedRule), `${expectedRule} 未命中`);
    });
  }
});

test('rule scope prevents packaging checks from running on another module', async () => {
  const output = { packaging_changes: [{ kind: 'structure', target: 'box_shape', before: 'a', after: 'b' }] };
  const result = await createShadowModeValidator({ evaluator }).validate({ module: 'visual_dna', output });
  assert.equal(result.anti_patterns.some((finding) => finding.anti_pattern_id.startsWith('AP-PKG-')), false);
  assert.equal(result.status, 'pass');
});

test('semantic rules remain explicitly unevaluated without an injected evaluator', async () => {
  const validator = createShadowModeValidator();
  const result = await validator.validate({ module: 'report', output: { sections: ['mixed language'] } });
  const finding = result.anti_patterns.find((item) => item.anti_pattern_id === 'AP-REP-004');
  assert.equal(finding.detected, false);
  assert.equal(finding.evaluated, false);
  assert.equal(finding.evaluation_mode, 'not_evaluated');
});

test('duplicate IDs fail registration and repeated occurrences apply 1x, 1.25x, then 1.5x', async () => {
  const definition = {
    id: 'AP-TST-001', name: '重复测试', scope: ['test'], severity: 'S2', ruleType: 'deterministic', basePenalty: 4,
    risk: '测试风险', exceptions: [], repair: ['修复重复问题'],
    detect: () => ({ occurrenceCount: 3, evidence: ['第一次', '第二次', '第三次'] })
  };
  const registry = new AntiPatternRegistry().register(definition);
  assert.throws(() => registry.register(definition), /already registered/);
  const result = await createAntiPatternValidator(registry).validate({ module: 'test', output: {}, metadata: {} });
  assert.equal(result.results[0].penalty, 15);
  assert.equal(result.results[0].occurrence_count, 3);
  assert.equal(result.penaltySummary.total, 15);
});

test('numeric penalties are capped at 40 per module', async () => {
  const makeRule = (id) => ({
    id, name: id, scope: ['test'], severity: 'S3', ruleType: 'deterministic', basePenalty: 15,
    risk: '测试风险', exceptions: [], repair: ['修复问题'],
    detect: () => ({ occurrenceCount: 3, evidence: ['一次', '二次', '三次'] })
  });
  const registry = new AntiPatternRegistry().registerMany([makeRule('AP-TST-002'), makeRule('AP-TST-003')]);
  const result = await createAntiPatternValidator(registry).validate({ module: 'test', output: {}, metadata: {} });
  assert.equal(result.penaltySummary.total, 40);
  assert.equal(result.penaltySummary.uncapped_total, 112.5);
  assert.equal(result.penaltySummary.cap_applied, true);
  assert.equal(result.results.reduce((sum, finding) => sum + finding.penalty, 0), 40);
});

test('shadow mode clones source output and cannot change or block the main flow result', async () => {
  let mainCalls = 0;
  const mainFlow = async () => {
    mainCalls += 1;
    return {
      status: 'completed-directions',
      directions: [{ id: 'd1', title: 'Original direction' }],
      reportMarkdown: '# Existing report'
    };
  };
  const mainResult = await mainFlow();
  const before = structuredClone(mainResult);
  const shadowResult = await createShadowModeValidator({ evaluator }).validate({
    module: 'visual_direction',
    output: mainResult,
    metadata: { semanticFindings: { 'AP-DIR-005': { evidence: ['旁路发现语义错位'] } } }
  });
  assert.equal(shadowResult.status, 'repair');
  assert.equal(mainCalls, 1);
  assert.deepEqual(mainResult, before);
  assert.equal(mainResult.status, 'completed-directions');
  assert.equal(shadowResult.stage_results.find((stage) => stage.stage === 'mqs_scoring').status, 'skipped');
});
