import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CROSS_INDUSTRY_FREEZE_THRESHOLDS, FROZEN_COMPONENT_PATHS } from './cross-industry-freeze.js';

const pct = (value) => `${Math.round(Number(value || 0) * 100)}%`;
const yesNo = (value) => value ? '通过' : '未通过';
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export async function createFrozenComponentManifest(repositoryRoot, componentPaths = FROZEN_COMPONENT_PATHS) {
  const files = [];
  for (const componentPath of componentPaths) {
    const content = await readFile(path.resolve(repositoryRoot, componentPath));
    files.push(Object.freeze({
      path: componentPath.replaceAll('\\', '/'),
      sha256: createHash('sha256').update(content).digest('hex'),
      size_bytes: content.byteLength
    }));
  }
  const digest = createHash('sha256')
    .update(files.map((item) => `${item.path}:${item.sha256}`).join('\n'))
    .digest('hex');
  return Object.freeze({ algorithm: 'sha256', digest, files: Object.freeze(files) });
}

export function compareFrozenComponentManifests(baseline, current) {
  const expected = new Map((baseline?.files || []).map((item) => [item.path, item.sha256]));
  const actual = new Map((current?.files || []).map((item) => [item.path, item.sha256]));
  const changed = [...new Set([...expected.keys(), ...actual.keys()])]
    .filter((key) => expected.get(key) !== actual.get(key))
    .map((componentPath) => Object.freeze({
      path: componentPath,
      baseline_sha256: expected.get(componentPath) || null,
      current_sha256: actual.get(componentPath) || null
    }));
  return Object.freeze({ frozen_components_intact: changed.length === 0, changed: Object.freeze(changed) });
}

function matrix(evaluation) {
  const lines = [
    '# 跨项目测试矩阵',
    '',
    '| 项目 | Pipeline | Benchmark | 品牌理解 | Evidence | 方向差异 | Critic | Anchor | 结论 |',
    '|---|---|---|---|---|---|---|---|---|'
  ];
  for (const item of evaluation.projects) {
    lines.push(`| ${item.test_id} ${item.project_name} | ${yesNo(item.pipeline_pass)} | ${yesNo(item.benchmark_pass)} | ${yesNo(item.brand_understanding_pass)} | ${yesNo(item.evidence_safety_pass)} | ${yesNo(item.direction_difference_pass)} | ${yesNo(item.critic_agreement)} | ${yesNo(item.anchor_internal_test_pass)} | ${item.conclusion} |`);
  }
  lines.push('', '## 汇总指标', '');
  for (const [key, value] of Object.entries(evaluation.metrics)) lines.push(`- ${key}: ${pct(value)}`);
  return `${lines.join('\n')}\n`;
}

function defects(evaluation, classification) {
  const items = evaluation.repeated_defects.filter((item) => !classification || item.classification === classification);
  const lines = [classification === 'model_output_variance' ? '# Model Output Variance 清单' : '# 重复缺陷清单', ''];
  if (!items.length) lines.push('- 无');
  for (const item of items) {
    lines.push(`## ${item.defect_key}`, '', `- 分类：${item.classification}`, `- 严重度：${item.severity}`, `- 模块：${item.module}`, `- 影响项目：${item.affected_project_ids.join('、')}`, `- 是否达到跨项目触发门槛：${item.repeated_cross_project_defect ? '是' : '否'}`, `- 最小修复范围：${item.minimum_fix_scope || '待确认'}`, '');
  }
  return `${lines.join('\n')}\n`;
}

function anchorSmoke(evaluation) {
  const lines = [
    '# Anchor Smoke Test 结果',
    '',
    `- 尝试项目数：${evaluation.anchor_smoke_test.attempted_project_count} / 3`,
    `- 通过项目数：${evaluation.anchor_smoke_test.passed_project_count}`,
    `- 执行边界合规：${evaluation.anchor_smoke_test.policy_compliant ? '是' : '否'}`,
    `- 边界问题：${evaluation.anchor_smoke_test.violations.join('、') || '无'}`,
    ''
  ];
  return lines.join('\n');
}

function finalDecision(evaluation, freezeIntegrity) {
  const lines = [
    '# Retrieval-First 跨行业冻结决策',
    '',
    `- 测试检查点：${evaluation.checkpoint}`,
    `- 测试项目数：${evaluation.project_count}`,
    `- 冻结组件完整：${freezeIntegrity?.frozen_components_intact === false ? '否' : '是'}`,
    `- 最终决策：${evaluation.freeze_decision}`,
    `- 是否允许重新进入系统开发：${evaluation.development_allowed ? '是' : '否'}`,
    '',
    '## 放行标准',
    ''
  ];
  for (const [key, value] of Object.entries(evaluation.criteria)) lines.push(`- ${key}: ${yesNo(value)}`);
  lines.push('', '## 开发触发条件', '');
  for (const [key, value] of Object.entries(evaluation.development_triggers)) lines.push(`- ${key}: ${value ? '已触发' : '未触发'}`);
  if (freezeIntegrity?.frozen_components_intact === false) {
    lines.push('', '## 冻结漂移', '', ...freezeIntegrity.changed.map((item) => `- ${item.path}`));
  }
  return `${lines.join('\n')}\n`;
}

function projectRecord(record, result) {
  return `# 项目测试记录

## 1. 基本信息

- 测试编号：${record.test_id}
- 项目名称：${record.project_name}
- 行业：${record.industry}
- 商业模式：${record.business_model}
- 输入类型：${record.input_type}
- Git Commit：${record.git_commit || '未记录'}
- 模型：${record.model || '未记录'}
- 开始时间：${record.started_at || '未记录'}
- 结束时间：${record.completed_at || '未记录'}

## 2. Pipeline

- 是否成功完成：${record.pipeline.completed ? '是' : '否'}
- Pipeline Completeness：${record.pipeline.completeness}
- Provider Fallback：${record.pipeline.provider_fallback_count}
- Legacy Fallback：${record.pipeline.legacy_fallback ? '是' : '否'}
- 总耗时：${record.pipeline.total_duration_ms}ms

## 3. Retrieval

- 查询：${record.retrieval.query_count}
- 原始结果：${record.retrieval.raw_result_count}
- 相关结果：${record.retrieval.relevant_result_count}
- 可用案例：${record.retrieval.usable_case_count}
- 同行业：${record.retrieval.direct_industry_count}
- 同商业模式：${record.retrieval.business_model_count}
- 反模板：${record.retrieval.anti_template_count}
- 状态：${record.retrieval.status}

## 4. 自动判定

- 品牌理解：${yesNo(result.brand_understanding_pass)}
- Evidence 安全：${yesNo(result.evidence_safety_pass)}
- 方向差异：${yesNo(result.direction_difference_pass)}
- Critic 一致：${yesNo(result.critic_agreement)}
- Anchor Test Readiness：${record.anchor.readiness}
- 平均分：${result.average_score}
- 项目结论：${result.conclusion}
`;
}

export function buildCrossIndustryFreezeArtifacts(evaluation, { freezeIntegrity } = {}) {
  const artifacts = new Map();
  artifacts.set('00-baseline/config.json', json({
    schema_version: evaluation.schema_version,
    thresholds: CROSS_INDUSTRY_FREEZE_THRESHOLDS,
    baseline: evaluation.baseline
  }));
  artifacts.set('00-baseline/git-commit.txt', `${evaluation.baseline.commit || 'not_recorded'}\n`);
  artifacts.set('00-baseline/frozen-components.md', `# Frozen Components\n\n- Manifest digest: ${evaluation.baseline.frozen_component_manifest?.digest || 'not_recorded'}\n\n${(evaluation.baseline.frozen_component_manifest?.files || []).map((item) => `- ${item.path}: \`${item.sha256}\``).join('\n')}\n`);
  evaluation.records.forEach((record, index) => {
    const folder = `${record.test_id}-${record.project_name.replace(/[<>:"/\\|?*]/gu, '_')}`;
    artifacts.set(`${folder}/test-record.md`, projectRecord(record, evaluation.projects[index]));
    artifacts.set(`${folder}/issues.json`, json(record.issues));
  });
  artifacts.set('summary/cross-project-matrix.md', matrix(evaluation));
  artifacts.set('summary/repeated-defects.md', defects(evaluation));
  artifacts.set('summary/model-variance.md', defects(evaluation, 'model_output_variance'));
  artifacts.set('summary/anchor-smoke-test.md', anchorSmoke(evaluation));
  artifacts.set('summary/final-freeze-decision.md', finalDecision(evaluation, freezeIntegrity));
  artifacts.set('summary/freeze-evaluation.json', json(evaluation));
  return artifacts;
}
