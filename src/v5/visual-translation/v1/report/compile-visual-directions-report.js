function escapeCell(value) { return String(value ?? '').replaceAll('|', '\\|').replace(/\s*\n\s*/g, '<br>'); }
function list(values, fallback = '暂无。') { return values?.length ? values.map((item) => `- ${item}`).join('\n') : fallback; }
function numbered(values, fallback = '暂无。') { return values?.length ? values.map((item, index) => `${index + 1}. ${item}`).join('\n') : fallback; }
import { measurePrimaryLanguage } from '../schemas/report-language-v1.js';

function evidenceLabel(ids) { return ids?.length ? ids.join('、') : '待确认'; }

export function compileVisualDirectionsReport(view) {
  const assetRows = view.boundaries.suggestedAssets.map((asset) => `| ${asset.assetId} | ${escapeCell(asset.name)} | ${asset.assetType} | ${asset.status} | ${asset.execution_scope} | ${asset.executable ? '是' : '否'} | ${asset.requires_human_approval ? '是' : '否'} | ${escapeCell(asset.restriction_reason || '无')} | ${escapeCell(asset.reason)} |`).join('\n');
  const directionSections = view.directions.map((direction) => `### ${direction.directionId} · ${direction.name}

${direction.internalCodeName ? `英文代号：${direction.internalCodeName}\n` : ''}

> ${direction.oneSentenceConcept}

- 核心隐喻：${direction.coreMetaphor}
- 专属机制：${direction.distinctiveMechanism}
- 品牌专属理由：${direction.mechanismAssessment.brandSpecificReason}
- 理由依据：${direction.mechanismAssessment.reasonBasis}
- 行业模板风险：${direction.mechanismAssessment.industryTemplateRisk}
- 替代机制：${direction.mechanismAssessment.replacementMechanism}
- 策略信号：${direction.strategicSignals.join('、')}
- 证据：${evidenceLabel(direction.evidenceIds)}
- 依据类型：${direction.reason_basis}
- 证据置信度：${direction.evidence_confidence}
- 图形语言：${direction.graphicLanguage.join('、')}
- 色彩逻辑：${direction.colorLogic}
- 材质家族：${direction.materialLanguage.join('、')}
- 高层光线原则：${direction.lightingLanguage}
- 构图原则：${direction.compositionLanguage}
- 情绪角色：${direction.emotionalRole}
- 空间行为：${direction.spatialBehavior}
- 人物政策：${direction.subjectPolicy.people}（${direction.subjectPolicy.peopleRole}）
- 产品政策：${direction.subjectPolicy.products}（${direction.subjectPolicy.productRole}）
- 环境政策：${direction.subjectPolicy.environment}（${direction.subjectPolicy.environmentRole}）
- 适用触点：${direction.suitableApplications.map((item) => `${item.name}[${item.audience}/${item.role}]`).join('、')}
- 可执行资产：${direction.executableAssetIds.join('、') || '无'}
- Sprint 2 后置项：${direction.deferredToAnchor.join('、')}
- 横向评分：品牌匹配 ${direction.brandFit} / 灵感价值 ${direction.inspirationValue} / 独特性 ${direction.distinctiveness} / 延展性 ${direction.scalability}
- 风险拆分：模板 ${direction.risk_breakdown.template_risk_penalty} / 受众 ${direction.risk_breakdown.audience_risk_penalty} / 证据 ${direction.risk_breakdown.evidence_risk_penalty} / 资产 ${direction.risk_breakdown.asset_risk_penalty} / 反模式 ${direction.risk_breakdown.anti_pattern_penalty}
- 风险扣分合计：${direction.risk_breakdown.risk_penalty_total}

**已知风险**

${list(direction.risks)}`).join('\n\n');

  const comparisonRows = view.recommendation.comparison.map((item) => {
    const direction = view.directions.find((candidate) => candidate.directionId === item.directionId);
    return `| ${item.rank} | ${item.directionId} · ${escapeCell(direction.name)} | ${item.base_score} | ${item.evidence_confidence} | ${item.confidence_adjusted_score} | ${item.risk_penalty} | ${item.final_score} | ${escapeCell(item.penalty_reasons.join('、') || '无')} |`;
  }).join('\n');
  const matrixRows = view.differenceMatrix.pairs.map((pair) => `| ${pair.direction_pair} | ${escapeCell(pair.shared_visual_traits.join('、') || '无显著共性')} | ${pair.dimensions.map((item) => `${item.name}=${item.score}：${item.reason}`).join('<br>')} | ${pair.total_score} / ${pair.max_score} | ${pair.status} | ${pair.full_difference_review_required ? '需要' : '不需要'} | ${escapeCell(pair.review_result || '待复核')} |`).join('\n');
  const evidenceRows = view.evidenceIndex.map((item) => `| ${item.evidenceId} | ${item.type} | ${escapeCell(item.statement)} | ${escapeCell(item.shortestQuote)} | ${escapeCell(item.sourceFile)} |`).join('\n');
  const signalRows = view.signals.map((item) => `| ${item.signalId} | ${item.type} | ${escapeCell(item.statement)} | ${item.reason_basis} | ${item.evidence_confidence} | ${item.importance} | ${item.visualPotential} | ${evidenceLabel(item.evidenceIds)} |`).join('\n');
  const opportunityBlock = (title, items) => `### ${title}\n\n${items.map((item) => `- **${item.opportunityId}** ${item.statement}（品牌化潜力：${item.brandability}；依据类型：${item.reason_basis}；置信度：${item.evidence_confidence}；说明：${item.rationale}；证据：${evidenceLabel(item.evidenceIds)}）`).join('\n')}`;
  const report = `# ${view.identity.projectName}视觉方向报告

> **协议**：${view.protocol.protocolVersion}<br>
> **报告版本**：${view.protocol.reportVersion}<br>
> **状态**：${view.protocol.status}<br>
> **决策边界**：系统只做方向推荐，人工选择后才能进入 Anchor Direction System。

## 0. 视觉任务摘要

本报告将已批准文档压缩为视觉证据、策略信号与机会地图，并提出三个可比较方向。它不是完整品牌战略重建，也不提前锁定 Sprint 2 的 Anchor 场景、具体镜头或产品摆拍。

- 推荐方向：${view.recommended.directionId} · ${view.recommended.name}
- 推荐仍需人工确认：${view.recommendation.humanSelectionRequired ? '是' : '否'}
- 选择方法：${view.recommendation.selection_method}
- 来源文件：${view.metadata.sourceFiles.join('、')}

## 1. 品牌事实、受众与资产边界

- 项目：${view.identity.projectName}
- 品牌：${view.identity.brandName}
- Business Model：${view.audienceBoundary.businessModel}
- Primary Audience：${view.audienceBoundary.primaryAudience.map((item) => item.label).join('、') || 'unknown'}
- Excluded Audience：${view.audienceBoundary.excludedAudience.map((item) => item.label).join('、') || 'unavailable'}
- Consumer Visual Policy：${view.audienceBoundary.consumerVisualPolicy}
- Locked Assets：${view.boundaries.lockedAssets.join('、') || '无'}

### Suggested Assets

| ID | 资产 | 类型 | 状态 | 执行范围 | 可执行 | 需人工批准 | 限制原因 | 说明 |
|---|---|---|---|---|---|---|---|---|
${assetRows || '| — | 无 | — | — | — | — | — | — | — |'}

## 2. 六类视觉策略信号

| ID | 类型 | 信号 | 依据类型 | 置信度 | 重要度 | 视觉潜力 | 证据 |
|---|---|---|---|---:|---|---|---|
${signalRows}

## 3. 视觉机会地图

${opportunityBlock('可视化事实', view.opportunities.visualizableFacts)}

${opportunityBlock('视觉隐喻', view.opportunities.metaphors)}

${opportunityBlock('核心审美张力', view.opportunities.aestheticTensions)}

### 行业模板风险

${view.opportunities.categoryCliches.map((item) => `- **${item.clicheId} · ${item.pattern}**：${item.risk}。允许：${item.allowedWhen}；禁止：${item.prohibitedWhen}。`).join('\n')}

## 4. 三个视觉方向

${directionSections}

## 5. 方向语义差异矩阵

| 方向对 | 共享视觉特征 | 六维语义评分与说明 | 总分 | 状态 | 满分复核 | 复核结果 |
|---|---|---|---:|---|---|---|
${matrixRows}

评分含义：0 为高度相似，1 为部分差异，2 为明显差异。总分 0–5 需要重写，6–8 需要加强，9–12 通过。

## 6. 方向评分与比较

| 排名 | 方向 | 基础分 | 证据置信度 | 置信度调整分 | 风险扣分 | 最终分 | 扣分原因 |
|---:|---|---:|---:|---:|---:|---:|---|
${comparisonRows}

评分公式：base_score = brand_fit × 0.40 + inspiration_value × 0.20 + distinctiveness × 0.25 + scalability × 0.15；confidence_adjusted_score = base_score × evidence_confidence；final_score = max(0, confidence_adjusted_score - risk_penalty)。全部使用 0–100 量纲。

## 7. 推荐方向

### ${view.recommended.directionId} · ${view.recommended.name}

${numbered(view.recommendation.rationale)}

**决策因素**

${list(view.recommendation.strategic_factors)}

**建议保留**

${list(view.recommendation.preservedStrengths)}

**仍需解决**

${list(view.recommendation.unresolvedRisks)}

## 附录 A：Evidence Index

| ID | 类型 | 陈述 | 最短必要引文 | 原始文件 |
|---|---|---|---|---|
${evidenceRows}

## 附录 B：运行元数据

- 报告语言：${view.reportLanguage}
- Document Set Hash：${view.metadata.documentSetHash}
- 模型调用：${view.metadata.modelCallCount}
- 输入 Token：${view.metadata.usage.inputTokens || 'Provider 未返回'}
- 输出 Token：${view.metadata.usage.outputTokens || 'Provider 未返回'}
- 阶段累计耗时：${view.metadata.durationMs} ms
- 模型：${view.metadata.models.join('、') || 'Checkpoint / 本地阶段'}
`;
  const body = report.trim();
  const language = measurePrimaryLanguage(body, view.reportLanguage);
  return `${body}\n- 主语言比例：${language.primary_language_ratio}\n- 语言状态：${language.language_status}\n`;
}

export function measureVisualReportComposition(markdown) {
  const text = String(markdown || '');
  const base = text.match(/## 1\. 品牌事实、受众与资产边界([\s\S]*?)(?=\n## 2\.)/)?.[1]?.length || 0;
  const visual = text.match(/## 2\. 六类视觉策略信号([\s\S]*?)(?=\n## 附录 A)/)?.[1]?.length || 0;
  const substantive = base + visual;
  return { baseCharacters: base, visualCharacters: visual, visualRatio: substantive ? visual / substantive : 0 };
}
