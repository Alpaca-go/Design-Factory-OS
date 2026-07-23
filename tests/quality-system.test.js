import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AntiPatternRegistry,
  VALIDATION_ORDER,
  createAntiPatternValidator,
  createHardFailValidator,
  createMqsValidator,
  createQualityValidator,
  createSchemaValidator
} from '../validators/index.js';

const root = path.resolve(import.meta.dirname, '..');

function createScorer(overrides = {}) {
  return createMqsValidator(async (_output, context) => {
    context.metadata.calls?.push('mqs_scoring');
    return {
      score: 82,
      level: 'L3',
      minimumLevelMet: true,
      coreDimensionsMet: true,
      dimensionScores: {
        evidence_traceability: 14,
        differentiation: 13,
        coherence: 14,
        executability: 15,
        scalability: 14,
        restraint: 12
      },
      repairActions: [],
      ...overrides
    };
  });
}

function createHarness({ registry = new AntiPatternRegistry(), schemaResult = true, hardFailRules = [], score = {} } = {}) {
  return createQualityValidator({
    schemaValidator: createSchemaValidator(async (_output, context) => {
      context.metadata.calls?.push('schema_validation');
      return schemaResult;
    }),
    hardFailValidator: createHardFailValidator(hardFailRules),
    antiPatternValidator: createAntiPatternValidator(registry),
    mqsValidator: createScorer(score)
  });
}

test('quality schemas and example data are valid JSON documents with stable contract fields', async () => {
  const files = [
    'schemas/mqs-score.schema.json',
    'schemas/anti-pattern-result.schema.json',
    'schemas/validation-result.schema.json',
    'schemas/quality-context.schema.json',
    'schemas/human-review.schema.json',
    'schemas/shadow-validation-record.schema.json',
    'examples/quality-system/anchor-output.example.json',
    'examples/quality-system/anchor-validation-result.example.json',
    'examples/quality-system/shadow-validation-result.example.json'
  ];
  const documents = await Promise.all(files.map(async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))));
  assert.equal(documents[0].properties.status.enum.join(','), 'pass,repair,reject');
  assert.equal(documents[1].properties.severity.enum.join(','), 'S1,S2,S3,S4');
  assert.deepEqual(documents[2].required, ['module', 'status', 'schema_validation', 'hard_fails', 'anti_patterns', 'penalty_summary', 'mqs_score', 'stage_results']);
  assert.ok(documents[3].properties.metadata.required.includes('source_hash'));
  assert.equal(documents[4].properties.human_judgement.enum.length, 4);
  assert.equal(documents[7].status, 'repair');
  assert.equal(documents[8].mode, 'shadow');
});

test('validator pipeline runs schema, hard fail, anti-pattern, MQS, and status in fixed order', async () => {
  const calls = [];
  const registry = new AntiPatternRegistry().register({
    id: 'AP-GEN-001',
    name: '形容词堆叠',
    scope: ['anchor_direction'],
    severity: 'S1',
    ruleType: 'deterministic',
    risk: '形容词没有形成视觉机制',
    exceptions: [],
    repair: ['将形容词转化为可观察规则'],
    detect(context) {
      context.metadata.calls.push('anti_pattern_detection');
      return false;
    }
  });
  const validator = createHarness({
    registry,
    hardFailRules: [{
      id: 'HF-LOCKED-ASSET',
      message: 'Locked asset changed',
      detect(context) {
        context.metadata.calls.push('hard_fail_detection');
        return false;
      }
    }]
  });
  const result = await validator.validate({ module: 'anchor_direction', output: {}, metadata: { calls } });
  assert.equal(result.status, 'pass');
  assert.deepEqual(calls, VALIDATION_ORDER.slice(0, 4));
  assert.deepEqual(result.stage_results.map((stage) => stage.stage), VALIDATION_ORDER);
});

test('an S2/S3 finding produces repair and a new anti-pattern requires no core change', async () => {
  const registry = new AntiPatternRegistry();
  const validator = createHarness({ registry });
  registry.register({
    id: 'AP-ANC-004',
    name: '无排除边界',
    scope: ['anchor_direction'],
    severity: 'S2',
    ruleType: 'deterministic',
    risk: 'Anchor 无法定义不属于自身的画面',
    exceptions: [],
    repair: ['补充排除边界'],
    detect: ({ output }) => output.exclusion_boundary ? false : {
      confidence: 0.95,
      location: { section: 'exclusion_boundary' },
      evidence: ['缺少 exclusion_boundary']
    }
  });
  const result = await validator.validate({ module: 'anchor_direction', output: { anchor: '可验证关系' } });
  assert.equal(result.status, 'repair');
  assert.deepEqual(result.mqs_score.violations, ['AP-ANC-004']);
  assert.deepEqual(result.mqs_score.repair_actions, ['补充排除边界']);
});

test('hard fail, active S4, and failed core dimension each produce reject', async () => {
  const hardFailValidator = createHarness({
    hardFailRules: [{ id: 'HF-CROSS-PROJECT', message: '跨项目污染', detect: () => true }]
  });
  assert.equal((await hardFailValidator.validate({ module: 'visual_direction', output: {} })).status, 'reject');

  const registry = new AntiPatternRegistry().register({
    id: 'AP-BRAND-002', name: '跨项目污染', scope: ['*'], severity: 'S4', ruleType: 'deterministic', risk: '品牌事实被污染', exceptions: [], repair: ['移除外部项目资产'], detect: () => ({ evidence: ['检测到外部项目资产'] })
  });
  assert.equal((await createHarness({ registry }).validate({ module: 'visual_direction', output: {} })).status, 'reject');
  assert.equal((await createHarness({ score: { coreDimensionsMet: false } }).validate({ module: 'visual_direction', output: {} })).status, 'reject');
});

test('schema failure rejects early and skips downstream validators', async () => {
  const calls = [];
  const validator = createHarness({ schemaResult: { valid: false, errors: [{ path: '/anchor', message: 'is required' }] } });
  const result = await validator.validate({ module: 'anchor_direction', output: {}, metadata: { calls } });
  assert.equal(result.status, 'reject');
  assert.equal(result.mqs_score, null);
  assert.deepEqual(calls, ['schema_validation']);
  assert.deepEqual(result.stage_results.slice(1, 4).map((stage) => stage.status), ['skipped', 'skipped', 'skipped']);
});

test('registered exceptions and S1 findings do not block pass', async () => {
  const registry = new AntiPatternRegistry().registerMany([
    {
      id: 'AP-TECH-001', name: '科技粒子背景', scope: ['visual_direction'], severity: 'S1', ruleType: 'deterministic', risk: '模板化', exceptions: [], repair: ['降低识别权重'], detect: () => ({ evidence: ['科技粒子成为主要识别'] })
    },
    {
      id: 'AP-TECH-003', name: '发光网络节点', scope: ['visual_direction'], severity: 'S2', ruleType: 'hybrid', risk: '模板化', exceptions: ['节点关系是品牌核心机制'], repair: ['建立独特节点语法'],
      detect: () => ({ detected: true, evidence: ['使用发光网络节点'], exceptionApplied: true, exceptionReason: '节点关系是有证据的品牌核心机制' })
    }
  ]);
  const result = await createHarness({ registry }).validate({ module: 'visual_direction', output: {} });
  assert.equal(result.status, 'pass');
  assert.equal(result.anti_patterns[1].exception_applied, true);
  assert.deepEqual(result.mqs_score.violations, ['AP-TECH-001']);
});

test('duplicate or incomplete anti-pattern definitions are rejected at registration', () => {
  const definition = {
    id: 'AP-GEN-007', name: '趋势替代战略', scope: ['*'], severity: 'S2', ruleType: 'hybrid', risk: '趋势覆盖品牌战略', exceptions: [], repair: ['替换为品牌专属机制'], detect: () => false
  };
  const registry = new AntiPatternRegistry().register(definition);
  assert.throws(() => registry.register(definition), /already registered/);
  assert.throws(() => registry.register({ ...definition, id: 'bad-id' }), /Invalid anti-pattern id/);
});
