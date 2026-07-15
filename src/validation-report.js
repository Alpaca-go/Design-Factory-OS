import path from 'node:path';
import { writeText } from './utils.js';

export const VALIDATION_REPORT_PREFIX = 'Masterpiece OS v4.0 Validation Report — ';

function duration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round((milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`;
}

function lines(items, formatter = (item) => item, empty = '- 无') {
  return items?.length ? items.map((item) => `- ${formatter(item)}`).join('\n') : empty;
}

function classificationGroups(state) {
  const names = new Map((state.brand.elements || []).map((item) => [item.elementId, item.name]));
  const groups = { locked: [], evolve: [], flexible: [] };
  for (const policy of state.constraints.elementPolicies || []) {
    groups[policy.classification]?.push({
      name: names.get(policy.elementRef) || policy.elementRef,
      directive: policy.directive
    });
  }
  return groups;
}

function stageRows(performance) {
  return (performance.stageSummary || []).map((item) => (
    `| ${item.label} | ${duration(item.durationMs)} | ${item.status} | ${item.provider} |`
  )).join('\n');
}

export function validationReportFilename(projectName) {
  return `${VALIDATION_REPORT_PREFIX}${projectName}.md`;
}

export function createHandoffTiming(performance, readyAt = new Date().toISOString()) {
  const startedAt = performance.startedAt || readyAt;
  return {
    analysisStartedAt: startedAt,
    outputsReadyAt: performance.endedAt || readyAt,
    handoffReadyAt: readyAt,
    analysisDurationMs: performance.totalDurationMs || 0,
    handoffDurationMs: Math.max(0, Date.parse(readyAt) - Date.parse(startedAt))
  };
}

export function renderValidationReport(result, options = {}) {
  const projectName = options.projectName || result.performance.project || '未命名项目';
  const target = options.performanceTarget || { minMinutes: 10, maxMinutes: 11 };
  const targetMaxMs = target.maxMinutes * 60 * 1000;
  const meetsTarget = result.handoff.handoffDurationMs <= targetMaxMs;
  const groups = classificationGroups(result.state);
  const freedom = result.state.strategy.creativeFreedom;
  const reportName = validationReportFilename(projectName);
  const pending = [
    'GPT Read Time', 'Image Generation Time', 'First-pass Image Quality', 'Brand Consistency',
    'Creative Freedom Recommendation Reasonableness', 'Design Constraints Effectiveness',
    'Manual Revision Count', 'User Satisfaction'
  ];

  return `# Masterpiece OS v4.0 Validation Report — ${projectName}

> Generated automatically by the v4.0 deterministic delivery pipeline  
> Project: ${projectName}  
> Mode: ${result.mode}  
> Result: ${result.review.status === 'PASS' ? 'Analysis PASS' : 'Analysis FAIL'} / Image Validation Pending

## Validation Summary

- Visual Inspection: ${result.brandUnderstanding.visualInspection.inspectedImages.length}/${result.inventory.imageCount}
- Decision ID: \`${result.state.meta.decisionId}\`
- State Digest: \`${result.state.meta.stateDigest}\`
- State: \`${result.state.meta.status} / ${result.state.governance.readiness}\`
- Creative Freedom: \`${freedom.effective.freedom}%\`
- Recommended Mode: \`${freedom.effective.mode}\`
- Confidence: \`${freedom.recommendation.confidence}\`
- Design Review: \`${result.review.status}\`

## Creative Decision

${result.decisionRecord?.statement || result.state.decisionRecord.statement}

## Locked

${lines(groups.locked, (item) => `${item.name}：${item.directive}`)}

## Evolve

${lines(groups.evolve, (item) => `${item.name}：${item.directive}`)}

## Flexible

${lines(groups.flexible, (item) => `${item.name}：${item.directive}`)}

## Performance

- Analysis Start: \`${result.handoff.analysisStartedAt}\`
- Formal Outputs Ready: \`${result.handoff.outputsReadyAt}\`
- Validation Handoff Ready: \`${result.handoff.handoffReadyAt}\`
- Analysis Duration: **${duration(result.handoff.analysisDurationMs)}**
- Complete Handoff Duration: **${duration(result.handoff.handoffDurationMs)}**
- Performance Target: **${meetsTarget ? 'PASS' : 'MISS'}**（不超过 ${target.maxMinutes} 分钟；参考区间 ${target.minMinutes}–${target.maxMinutes} 分钟）

| Stage | Duration | Status | Timing Provider |
|---|---:|---|---|
${stageRows(result.performance)}

计时说明：Provider 阶段使用 Provider 提交的 Runtime Trace；本地 State、Compiler、Review 与输出阶段使用运行时实测。完整交付耗时从最早阶段开始计算至 Validation Report 自动生成。

## Output Files

正式输出：

${lines(result.outputFiles, (item) => `\`outputs/${item}\``)}

Validation 记录：

- \`outputs/${reportName}\`

Runtime GPT Brief persistence: \`forbidden / not persisted\`

## Pending Image Validation Metrics

| Metric | Status |
|---|---|
${pending.map((item) => `| ${item} | Pending |`).join('\n')}

## Conclusion

${result.review.status === 'PASS'
    ? '分析阶段通过。当前停止 Masterpiece 分析，等待 GPT 阅读和首轮生图验证。'
    : '分析阶段未通过。应先解决 Design Review 中的阻断项。'}
`;
}

export async function publishValidationReport(result, output, options = {}) {
  const projectName = options.projectName || path.basename(options.projectRoot || path.dirname(output));
  const filename = validationReportFilename(projectName);
  const reportPath = path.join(output, filename);

  result.handoff = createHandoffTiming(result.performance);
  await writeText(reportPath, renderValidationReport(result, { ...options, projectName }));

  // Capture the actual report publication boundary, then persist that value.
  result.handoff = createHandoffTiming(result.performance, new Date().toISOString());
  await writeText(reportPath, renderValidationReport(result, { ...options, projectName }));
  return { filename, path: reportPath };
}
