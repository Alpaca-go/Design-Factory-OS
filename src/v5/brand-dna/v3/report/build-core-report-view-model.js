const STATUS_ZH = Object.freeze({
  confirmed: '已确认', 'reasonable-inference': '合理推断', conflicting: '内容冲突', missing: '信息缺失', suggested: '建议',
  high: '高', medium: '中', low: '低', embedded: '已内化', declared: '已声明', aspirational: '愿景阶段', 'not-applicable': '不适用',
  primary: '主要人群', secondary: '次要人群', extension: '延伸人群', critical: '严重', major: '主要', minor: '次要'
});

const GENE_TYPE_ZH = Object.freeze({ functional: '功能结果', capability: '交付能力', relational: '关系角色', emotional: '情绪价值', cultural: '文化内核', behavioral: '行为方式', aesthetic: '审美表达' });

function qualityStatus(gate) {
  if (!gate.passed) return 'failed';
  return gate.warnings?.length || gate.deterministicFixes?.length ? 'passed-with-warnings' : 'passed';
}

export function buildV3CoreReportViewModel({ decision, evidenceMap, prepared, qualityGate, metrics }) {
  const sources = new Map(prepared.sourceDocuments.map((item) => [item.sourceId, item.originalFileName]));
  const primaryRisk = decision.diagnosis.risks.find((item) => ['critical', 'major'].includes(item.severity)) || decision.diagnosis.risks[0];
  const functional = decision.genes.find((item) => item.type === 'functional');
  const capability = decision.genes.find((item) => item.type === 'capability');
  const usage = metrics.reduce((total, item) => ({ inputTokens: total.inputTokens + (item.usage?.inputTokens || 0), outputTokens: total.outputTokens + (item.usage?.outputTokens || 0) }), { inputTokens: 0, outputTokens: 0 });
  return Object.freeze({
    title: { brandName: decision.identity.brandName, reportName: '品牌 DNA 核心分析报告', analysisTaskName: decision.identity.analysisTaskName },
    protocol: { protocolVersion: 'brand-dna-v3-deep-compact', reportVersion: 'brand-dna-core-report-v3', analysisStatus: '核心分析已完成', extensionStatus: '视觉系统与生图任务待继续' },
    executiveSummary: {
      keyFacts: [`所属行业：${decision.identity.industry}`, `商业角色：${decision.identity.businessRole}`, `发展阶段：${decision.identity.developmentStage}`],
      keyJudgments: [`品牌定位：${decision.identity.brandPositioning}`, `客户结果：${functional.statement}`, `交付基础：${capability.statement}`],
      coreConflict: primaryRisk?.statement || '当前材料未识别出需要优先处理的重大冲突',
      oneSentenceDna: decision.oneSentenceDna,
      creativeThesis: decision.creativeThesis.statement,
      priorityConfirmations: decision.pendingConfirmations.slice(0, 3)
    },
    identity: decision.identity, audiences: decision.audiences, strategy: decision.strategy, genes: decision.genes, oneSentenceDna: decision.oneSentenceDna,
    risks: decision.diagnosis.risks, creativeThesis: decision.creativeThesis, distinctiveMechanisms: decision.visualMechanisms, pendingConfirmations: decision.pendingConfirmations,
    evidenceIndex: evidenceMap.evidence.map((item) => ({ ...item, sourceFileName: sources.get(item.sourceId) || '未知来源' })),
    qualityGate: { status: qualityStatus(qualityGate), warnings: qualityGate.warnings || [], deterministicFixes: qualityGate.deterministicFixes || [], patchUsed: Boolean(qualityGate.patchUsed), issues: qualityGate.issues || [] },
    metadata: { documentSetHash: prepared.documentSetHash, sourceFiles: prepared.sourceDocuments.map((item) => item.originalFileName), modelCallCount: metrics.filter((item) => item.kind === 'model').length, coreDurationMs: metrics.reduce((sum, item) => sum + item.durationMs, 0), usage, models: [...new Set(metrics.map((item) => item.modelId).filter(Boolean))] },
    labels: STATUS_ZH, geneTypeLabels: GENE_TYPE_ZH
  });
}
