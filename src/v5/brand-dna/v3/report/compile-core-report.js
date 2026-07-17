function list(items, fallback = '暂无') { return items?.length ? items.map((item) => `- ${item}`).join('\n') : `- ${fallback}`; }

export function compileV3CoreReport({ decision, evidenceMap, prepared, qualityGate, metrics }) {
  const sources = new Map(prepared.sourceDocuments.map((item) => [item.sourceId, item.originalFileName]));
  const evidenceRows = evidenceMap.evidence.map((item) => `| ${item.evidenceId} | ${item.category} | ${item.statement.replaceAll('|', '\\|')} | ${sources.get(item.sourceId)} / ${item.sectionPath.join(' / ')} |`).join('\n');
  const genes = decision.genes.map((gene) => `| ${gene.type} | ${gene.statement.replaceAll('|', '\\|')} | ${gene.confidence} | ${gene.culturalMaturity || '不适用'} | ${gene.differentiationValue} | ${gene.evidenceIds.join('、')} |`).join('\n');
  return `# ${decision.identity.projectName} Brand DNA 核心分析报告

> 协议：brand-dna-v3-deep-compact · 核心报告：brand-dna-core-report-v3 · 核心质量门：${qualityGate.passed ? '通过' : '需修复'}

## 0. 执行摘要

${decision.oneSentenceDna}

唯一创意命题：**${decision.creativeThesis.statement}**

## 1. 项目识别与事实边界

- 品牌：${decision.identity.brandName}
- 行业：${decision.identity.industry}
- 商业角色：${decision.identity.businessRole}
- 品牌定位：${decision.identity.brandPositioning}
- 发展阶段：${decision.identity.developmentStage}
- 置信度：${decision.identity.confidence}

## 2. 核心目标人群

${decision.audiences.map((audience) => `### ${audience.name}（${audience.priority}）\n\n- 需求：${audience.needs.join('；')}\n- 阻力：${audience.barriers.join('；') || '暂无'}\n- 使用场景：${audience.useCases.join('；') || '暂无'}\n- 判断层级：${audience.inferenceLevel}`).join('\n\n')}

## 3. 品牌战略

- 使命：${decision.strategy.mission}
- 承诺：${decision.strategy.promise}
- 关系角色：${decision.strategy.relationshipRole}
- 价值主张：${decision.strategy.valuePropositions.join('；')}
- 差异化依据：${decision.strategy.differentiators.join('；')}

## 4. 品牌人格与文化

- 人格：${decision.strategy.personality.join('；')}
- 语气：${decision.strategy.toneOfVoice.join('；')}
- 情绪结果：${decision.strategy.emotionalOutcomes.join('；')}

## 5. 七类 Brand DNA

| 类型 | 基因 | 置信度 | 文化成熟度 | 差异化价值 | Evidence |
|---|---|---|---|---|---|
${genes}

## 6. 一句话 Brand DNA

> ${decision.oneSentenceDna}

## 7. 战略冲突、缺失与风险

### 冲突
${list(decision.diagnosis.conflicts.map((item) => `[${item.status}] ${item.statement}`))}

### 缺失
${list(decision.diagnosis.missingInformation)}

### 风险
${list(decision.diagnosis.risks.map((item) => `[${item.status}] ${item.statement}`))}

## 8. 唯一创意命题

> ${decision.creativeThesis.statement}

${decision.creativeThesis.rationale}

- 专属机制：${decision.creativeThesis.distinctiveMechanism}
- 覆盖度：能力 ${decision.creativeThesis.coverage.capability}/5；关系 ${decision.creativeThesis.coverage.relationship}/5；情绪 ${decision.creativeThesis.coverage.emotion}/5；文化 ${decision.creativeThesis.coverage.culture}/5；差异化 ${decision.creativeThesis.coverage.differentiation}/5

## 9. 待确认事项

${list(decision.pendingConfirmations)}

## 附录 A：证据索引

| ID | 类别 | 事实 | 来源 |
|---|---|---|---|
${evidenceRows}

## 附录 B：原文引用

为避免报告被原材料淹没，主报告不重复大段原文；最短必要引文保存在结构化 Evidence Map 中，可按 Evidence ID 查看。

## 附录 C：运行元数据

- 文档集 Hash：${prepared.documentSetHash}
- 模型调用：${metrics.filter((item) => item.kind === 'model').length}
- 核心阶段耗时：${metrics.reduce((sum, item) => sum + item.durationMs, 0)} ms
`;
}
