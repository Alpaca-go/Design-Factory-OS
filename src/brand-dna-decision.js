import { unique } from './utils.js';

export const BRAND_DNA_DIMENSIONS = [
  ['logo', 'Logo'],
  ['color', 'Color'],
  ['typography', 'Typography'],
  ['composition', 'Composition'],
  ['whitespace', 'Whitespace'],
  ['photography', 'Photography'],
  ['materials', 'Materials'],
  ['packaging', 'Packaging'],
  ['craft', 'Craft']
];

const PENDING = '待确认（Brand DNA Decision 未完成）';
const PENDING_PATTERN = /待.*(?:确认|补充|验证|打样)|仍需.*确认|尚未|未完成|不得仅凭/;

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function strings(value) {
  return unique((Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => clean(item))
    .filter(Boolean));
}

function statementSection(value) {
  if (typeof value === 'string') return { statement: value.trim(), evidence: [] };
  return {
    statement: clean(value?.statement || value?.summary || value?.intent) || PENDING,
    evidence: strings(value?.evidence || value?.sources)
  };
}

function normalizeDna(value = {}) {
  return Object.fromEntries(BRAND_DNA_DIMENSIONS.map(([id]) => {
    const item = value?.[id];
    return [id, clean(typeof item === 'string' ? item : item?.decision || item?.statement || item?.direction) || PENDING];
  }));
}

function complete(value) {
  return Boolean(clean(value)) && !PENDING_PATTERN.test(value);
}

function approvalRequested(value = {}) {
  return value.approved === true || String(value.status || '').trim().toLowerCase() === 'approved';
}

function benchmarkReferences(input, benchmarks) {
  const configured = Array.isArray(input?.references) ? input.references : [];
  const references = configured.length ? configured : (benchmarks.cases || []);
  return references.map((item) => typeof item === 'string'
    ? { name: item, url: '', reason: '' }
    : {
        name: clean(item?.name) || '未命名案例',
        url: clean(item?.url) || '',
        reason: clean(item?.reason) || ''
      });
}

/**
 * Brand DNA can only become approved after the four-stage decision chain is
 * complete. Legacy visualDNA is retained as a candidate for migration, but it
 * is deliberately never promoted into the Creative Brief.
 */
export function buildBrandDnaDecision(brand, benchmarks, config = {}) {
  const supplied = config.brandDnaDecision || config.brandDNADecision || {};
  const legacyVisualDna = config.creativeReasoning?.visualDNA || config.creativeBrief?.visualDNA;
  const originalIntent = statementSection(supplied.originalIntent || config.originalIntent);
  const benchmarkInput = supplied.industryBenchmark || {};
  const industryBenchmark = {
    observations: strings(benchmarkInput.observations || benchmarkInput.findings || benchmarks.commonTraits),
    opportunities: strings(benchmarkInput.opportunities || benchmarkInput.whiteSpace || benchmarkInput.whitespace),
    references: benchmarkReferences(benchmarkInput, benchmarks),
    context: clean(benchmarkInput.context)
      || `${benchmarks.industry.value} / ${benchmarks.projectType.value}`
  };
  const decisionInput = supplied.creativeDecision || {};
  const creativeDecision = {
    statement: clean(typeof decisionInput === 'string' ? decisionInput : decisionInput.statement || decisionInput.summary) || PENDING,
    rationale: strings(decisionInput.rationale || decisionInput.reasons || decisionInput.evidence),
    tradeoffs: strings(decisionInput.tradeoffs || decisionInput.rejectedDirections || decisionInput.notDoing)
  };
  const draftApprovedBrandDNA = normalizeDna(supplied.approvedBrandDNA);
  const candidateBrandDNA = normalizeDna(supplied.candidateBrandDNA || legacyVisualDna);
  const approval = supplied.approval || {};

  const stageReadiness = {
    originalIntent: complete(originalIntent.statement) && originalIntent.evidence.length > 0,
    industryBenchmark: industryBenchmark.observations.length > 0
      && industryBenchmark.opportunities.length > 0
      && industryBenchmark.references.length >= 3,
    creativeDecision: complete(creativeDecision.statement) && creativeDecision.rationale.length > 0,
    approvedBrandDNA: Object.values(draftApprovedBrandDNA).every(complete),
    explicitApproval: approvalRequested(approval)
  };
  const blockerLabels = {
    originalIntent: 'Original Intent 缺少明确陈述或依据',
    industryBenchmark: 'Industry Benchmark 缺少观察、差异机会或至少三个参考案例',
    creativeDecision: 'Creative Decision 缺少明确决策或理由',
    approvedBrandDNA: 'Approved Brand DNA 的九个维度尚未完整',
    explicitApproval: 'Brand DNA 尚未显式批准'
  };
  const blockers = Object.entries(stageReadiness)
    .filter(([, ready]) => !ready)
    .map(([stage]) => blockerLabels[stage]);
  const approved = blockers.length === 0;
  const approvedBrandDNA = approved
    ? draftApprovedBrandDNA
    : Object.fromEntries(BRAND_DNA_DIMENSIONS.map(([id]) => [id, PENDING]));

  return {
    status: approved ? 'Approved' : 'Needs Decision',
    originalIntent,
    industryBenchmark,
    creativeDecision,
    approvedBrandDNA,
    draftApprovedBrandDNA,
    candidateBrandDNA,
    approval: {
      status: approved ? 'Approved' : 'Not Approved',
      approvedBy: clean(approval.approvedBy || approval.by),
      approvedAt: clean(approval.approvedAt || approval.at),
      blockers
    },
    stageReadiness,
    migration: {
      legacyVisualDnaDetected: Boolean(legacyVisualDna),
      message: legacyVisualDna
        ? '检测到旧 creativeReasoning.visualDNA；已保留为候选，但不会直接进入 Approved Brand DNA。'
        : null
    },
    sourcePolicy: 'Approved Brand DNA 只接受完成 Original Intent → Industry Benchmark → Creative Decision → 显式批准的决策结果；用户视觉方案只能作为证据或候选，不能直接成为批准结论。',
    brandName: brand.brandName
  };
}
