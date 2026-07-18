function escapeCell(value) { return String(value ?? '').replaceAll('|', '\\|').replace(/\s*\n\s*/g, '<br>'); }
function list(values, fallback = '暂无。') { return values?.length ? values.map((item) => `- ${item}`).join('\n') : fallback; }
function numbered(values, fallback = '暂无。') { return values?.length ? values.map((item, index) => `${index + 1}. ${item}`).join('\n') : fallback; }
function evidenceLabel(ids) { return ids?.length ? ids.join('、') : '待确认'; }

export function compileVisualDirectionsReport(view) {
  const directionSections = view.directions.map((direction) => `### ${direction.directionId} · ${direction.name}

> ${direction.oneSentenceConcept}

- 核心隐喻：${direction.coreMetaphor}
- 专属机制：${direction.distinctiveMechanism}
- 策略信号：${direction.strategicSignals.join('、')}
- 证据：${evidenceLabel(direction.evidenceIds)}
- 图形语言：${direction.graphicLanguage.join('；')}
- 色彩逻辑：${direction.colorLogic}
- 材质语言：${direction.materialLanguage.join('；')}
- 光线语言：${direction.lightingLanguage}
- 构图语言：${direction.compositionLanguage}
- 人物政策：${direction.subjectPolicy.people}
- 产品政策：${direction.subjectPolicy.products}
- 环境政策：${direction.subjectPolicy.environment}
- 适用触点：${direction.suitableApplications.join('；')}
- 横向评分：品牌匹配 ${direction.brandFit} / 灵感价值 ${direction.inspirationValue} / 独特性 ${direction.distinctiveness}
- 行业模板风险：${direction.categoryClicheRisk}

**已知风险**

${list(direction.risks)}`).join('\n\n');

  const comparisonRows = view.recommendation.comparison.map((item) => {
    const direction = view.directions.find((candidate) => candidate.directionId === item.directionId);
    return `| ${item.rank} | ${item.directionId} · ${escapeCell(direction.name)} | ${item.comparisonScore} | ${direction.categoryClicheRisk} |`;
  }).join('\n');
  const evidenceRows = view.evidenceIndex.map((item) => `| ${item.evidenceId} | ${item.type} | ${escapeCell(item.statement)} | ${escapeCell(item.shortestQuote)} | ${escapeCell(item.sourceFile)} |`).join('\n');
  const signalRows = view.signals.map((item) => `| ${item.signalId} | ${item.type} | ${escapeCell(item.statement)} | ${item.importance} | ${item.visualPotential} | ${evidenceLabel(item.evidenceIds)} |`).join('\n');
  const opportunityBlock = (title, items) => `### ${title}\n\n${items.map((item) => `- **${item.opportunityId}** ${item.statement}（品牌化潜力：${item.brandability}；依据：${item.rationale}；证据：${evidenceLabel(item.evidenceIds)}）`).join('\n')}`;
  const report = `# ${view.identity.projectName}视觉方向报告

> **协议**：${view.protocol.protocolVersion}<br>
> **报告版本**：${view.protocol.reportVersion}<br>
> **状态**：${view.protocol.status}<br>
> **决策边界**：系统只做方向推荐，人工选择后才能进入 Anchor Direction System。

## 0. 视觉任务摘要

本报告将已批准文策压缩为视觉证据、五类信号与机会地图，并提出三个可比较的方向。它不是完整品牌战略重建，也不是最终 VI 定案。

- 推荐方向：${view.recommended.directionId} · ${view.recommended.name}
- 推荐仍需人工确认：${view.recommendation.humanSelectionRequired ? '是' : '否'}
- 来源文件：${view.metadata.sourceFiles.join('；')}

## 1. 品牌事实与视觉边界

- 项目：${view.identity.projectName}
- 品牌：${view.identity.brandName}
- 识别状态：${view.identity.status}
- Locked Assets：${view.boundaries.lockedAssets.join('；') || '无'}
- Suggested Assets：${view.boundaries.suggestedAssets.join('；') || '无'}
- 冲突：${view.boundaries.conflicts.map((item) => item.statement).join('；') || '无'}
- 待确认：${view.boundaries.missingInformation.map((item) => item.statement).join('；') || '无'}

## 2. 五类视觉策略信号

| ID | 类型 | 信号 | 重要度 | 视觉潜力 | 证据 |
|---|---|---|---|---|---|
${signalRows}

## 3. 视觉机会地图

${opportunityBlock('可视化事实', view.opportunities.visualizableFacts)}

${opportunityBlock('视觉隐喻', view.opportunities.metaphors)}

${opportunityBlock('核心审美张力', view.opportunities.aestheticTensions)}

### 行业模板风险

${view.opportunities.categoryCliches.map((item) => `- **${item.clicheId} · ${item.pattern}**：${item.risk}。允许：${item.allowedWhen}；禁止：${item.prohibitedWhen}。`).join('\n')}

## 4. 三个视觉方向

${directionSections}

## 5. 方向比较

| 排名 | 方向 | 比较分 | 模板风险 |
|---:|---|---:|---|
${comparisonRows}

> 比较分只用于本项目内部横向排序，不代表绝对创意质量，也不等于自动定案。

## 6. 推荐方向

### ${view.recommended.directionId} · ${view.recommended.name}

${numbered(view.recommendation.rationale)}

**建议保留**

${list(view.recommendation.preservedStrengths)}

**仍需解决**

${list(view.recommendation.unresolvedRisks)}

**备选方向**：${view.recommendation.alternativeDirectionIds.join('、')}

## 7. 视觉风险与待确认事项

${list([
    ...view.boundaries.missingInformation.map((item) => item.statement),
    ...view.boundaries.conflicts.map((item) => item.statement),
    ...view.recommendation.unresolvedRisks
  ])}

## 附录 A：Evidence Index

| ID | 类型 | 陈述 | 最短必要引文 | 原始文件 |
|---|---|---|---|---|
${evidenceRows}

## 附录 B：运行元数据

- Document Set Hash：${view.metadata.documentSetHash}
- 模型调用：${view.metadata.modelCallCount}
- 输入 Token：${view.metadata.usage.inputTokens || 'Provider 未返回'}
- 输出 Token：${view.metadata.usage.outputTokens || 'Provider 未返回'}
- 阶段累计耗时：${view.metadata.durationMs} ms
- 模型：${view.metadata.models.join('；') || 'Checkpoint / 本地阶段'}
`;
  return report.trim() + '\n';
}

export function measureVisualReportComposition(markdown) {
  const text = String(markdown || '');
  const base = text.match(/## 1\. 品牌事实与视觉边界([\s\S]*?)(?=\n## 2\.)/)?.[1]?.length || 0;
  const visual = text.match(/## 2\. 五类视觉策略信号([\s\S]*?)(?=\n## 附录 A)/)?.[1]?.length || 0;
  const substantive = base + visual;
  return { baseCharacters: base, visualCharacters: visual, visualRatio: substantive ? visual / substantive : 0 };
}
