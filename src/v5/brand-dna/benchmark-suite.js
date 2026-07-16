import { BRAND_DNA_PROTOCOL, BRAND_DNA_QUALITY_GATE } from './protocol-config.js';

export function validateBenchmarkManifest(manifest) {
  if (manifest?.protocolVersion !== BRAND_DNA_PROTOCOL.protocolVersion) {
    throw new Error('Brand DNA Benchmark 协议版本不匹配');
  }
  if (!Array.isArray(manifest.projects) || manifest.projects.length < 12) {
    throw new Error('Brand DNA Benchmark 固定项目不得少于 12 个');
  }
  const ids = new Set();
  for (const project of manifest.projects) {
    if (!project.id || ids.has(project.id)) throw new Error('Brand DNA Benchmark 项目 ID 缺失或重复');
    ids.add(project.id);
    for (const group of ['single-prompt', 'deep-protocol', 'gpt-5.6-benchmark']) {
      if (!project.comparisonGroups?.includes(group)) throw new Error(`${project.id} 缺少对照组 ${group}`);
    }
  }
  return manifest;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function assessBenchmarkResults(records) {
  const completed = (records || []).filter((record) =>
    Number.isFinite(record.deepProtocolScore)
    && Number.isFinite(record.gpt56BenchmarkScore)
    && Number.isFinite(record.evidenceScore)
    && Number.isFinite(record.strategyScore)
    && Number.isFinite(record.imageExecutionScore)
    && Array.isArray(record.hardFailures)
  );
  if (completed.length < 12) {
    return Object.freeze({
      qualityTier: 'experimental',
      reusableProtocol: false,
      completedProjects: completed.length,
      reason: '固定基准集尚未完成 12 个项目，不能宣称达到 GPT-5.6 Benchmark'
    });
  }
  const averageDeep = average(completed.map((record) => record.deepProtocolScore));
  const averageBenchmark = average(completed.map((record) => record.gpt56BenchmarkScore));
  const passesMinimum = completed.every((record) =>
    record.deepProtocolScore >= BRAND_DNA_QUALITY_GATE.minTotalScore
    && record.evidenceScore >= BRAND_DNA_QUALITY_GATE.minEvidenceScore
    && record.strategyScore >= BRAND_DNA_QUALITY_GATE.minStrategyScore
    && record.imageExecutionScore >= BRAND_DNA_QUALITY_GATE.minImageExecutionScore
    && record.hardFailures.length === 0
  );
  const withinBenchmarkDistance = averageBenchmark - averageDeep <= 5;
  return Object.freeze({
    qualityTier: passesMinimum && withinBenchmarkDistance ? 'benchmark' : passesMinimum ? 'qualified' : 'experimental',
    reusableProtocol: passesMinimum,
    completedProjects: completed.length,
    averageDeepProtocolScore: averageDeep,
    averageGpt56BenchmarkScore: averageBenchmark,
    distanceFromBenchmark: averageBenchmark - averageDeep,
    reason: passesMinimum && withinBenchmarkDistance
      ? '已满足固定样本、最低质量线和 GPT-5.6 平均差距要求'
      : '尚未同时满足最低质量线与 GPT-5.6 平均差距要求'
  });
}
