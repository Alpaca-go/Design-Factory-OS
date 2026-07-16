import {
  bulletList,
  cleanText,
  escapeMarkdownInline,
  markdownTable,
  uniqueText
} from './markdown-sanitizer.js';

function references(item) {
  const ids = item?.evidenceLabels?.length ? item.evidenceLabels.join('、') : '无直接证据';
  const sources = item?.sourceNames?.length
    ? item.sourceNames.map((name) => `《${name}》`).join('、')
    : '未标注来源';
  const quotes = item?.shortQuotes?.length
    ? `  \n**短引**：${item.shortQuotes.map(escapeMarkdownInline).join('；')}`
    : '';
  return `**依据**：${ids}  \n**来源**：${sources}${quotes}`;
}

function factCard(item) {
  if (!item) return '信息缺失。';
  return `**${escapeMarkdownInline(item.label)}**  \n\`${item.statusLabel} · ${item.confidenceLabel}置信度\`

${escapeMarkdownInline(item.value)}

${references(item)}`;
}

function directionSection(title, items) {
  return `### ${title}

${items?.length
    ? items.map((item) => `- **${escapeMarkdownInline(item.direction || item.statement)}**：${escapeMarkdownInline(item.rationale || '基于品牌 DNA 的建议')}${item.actions?.length ? `；执行动作：${item.actions.map(escapeMarkdownInline).join('、')}` : ''}`).join('\n')
    : '- 尚未形成可靠方向。'}`;
}

function sourceList(names) {
  return names?.length ? names.map((name) => `《${name}》`).join('、') : '未标注来源';
}

function taskDetail(task, index, boundaries) {
  return `## A${index + 1}. ${escapeMarkdownInline(task.roleLabel)}｜${escapeMarkdownInline(task.title)}

### 任务目标

${escapeMarkdownInline(task.objective || task.coreMessage)}

### 核心信息

${escapeMarkdownInline(task.coreMessage)}

### Brand DNA 依据

${bulletList(task.brandDnaBasis, '旧版任务未保留 Gene ID。')}

### 事实与资产边界

${bulletList(uniqueText([
    ...boundaries.lockedFacts,
    ...boundaries.prohibitedElements,
    ...(task.lockedAssetInstructions || [])
  ]), '不得引入未确认的业务、Logo、认证或产品事实。')}

### 视觉规范

- **主体**：${escapeMarkdownInline(task.subject || '待明确')}
- **场景**：${escapeMarkdownInline(task.environment || '待明确')}
- **叙事时刻**：${escapeMarkdownInline(task.narrativeMoment || '待明确')}
- **构图**：${escapeMarkdownInline(task.composition || '待明确')}
- **视觉焦点**：${escapeMarkdownInline(task.focalHierarchy || '待明确')}
- **镜头与透视**：${escapeMarkdownInline(task.cameraAndPerspective || '待明确')}
- **色彩**：${escapeMarkdownInline(task.colorDirection || task.colorAndLighting || '待明确')}
- **材质**：${escapeMarkdownInline(task.materialAndTexture || '待明确')}
- **光线**：${escapeMarkdownInline(task.lighting || task.colorAndLighting || '待明确')}
- **氛围**：${escapeMarkdownInline(task.atmosphere || '待明确')}

### 必须出现

${bulletList(task.requiredElements, '以已确认事实和任务目标为准。')}

### 可选出现

${bulletList(task.optionalElements, '无')}

### 禁止出现

${bulletList(uniqueText([
    ...(task.prohibitedElements || []),
    ...boundaries.prohibitedElements
  ]), '不得伪造正式 Logo、认证标识、疗效、药械标签或业务事实。')}

### 一致性与职责差异

- **与全局系统一致**：${uniqueText(task.consistencyWithGlobalSystem || []).map(escapeMarkdownInline).join('；') || '遵循全局视觉系统。'}
- **与前序图片一致**：${uniqueText(task.consistencyWithPreviousTasks || []).map(escapeMarkdownInline).join('；') || (index === 0 ? '首张图，无前序任务。' : '待补充。')}
- **本图新增证明**：${task.difference.map(escapeMarkdownInline).join('；') || '待明确具体增量价值。'}
- **文字政策**：${escapeMarkdownInline(task.textPolicy || boundaries.textPolicy)}
${task.allowedText?.length ? `- **允许文字**：${task.allowedText.map(escapeMarkdownInline).join('；')}` : ''}
- **Logo 政策**：${escapeMarkdownInline(task.logoPolicy || boundaries.logoPolicy)}
- **画幅**：${escapeMarkdownInline(task.aspectRatio || '由执行场景决定')}

### 最终英文 Prompt

\`\`\`text
${task.finalPrompt}
\`\`\``;
}

export function compileBrandDnaReportV2(viewModel) {
  const counts = viewModel.statusCounts;
  const infoStatus = `已确认 ${counts.confirmed || 0} 项 · 合理推断 ${counts.inferred || 0} 项 · 内容冲突 ${counts.conflicting || 0} 项 · 待确认 ${counts.missing || 0} 项`;
  const qualityStatus = `${viewModel.audit.passed ? '通过' : '需复核'} · ${viewModel.audit.score}/100${viewModel.audit.pendingCount ? ` · 仍有 ${viewModel.audit.pendingCount} 项需人工确认` : ''}`;
  const geneRows = viewModel.genes.map((gene) => [
    gene.id,
    gene.typeLabel,
    gene.statement,
    `${gene.confidenceLabel}置信度`,
    gene.culturalMaturity || '—'
  ]);
  const taskRows = viewModel.taskOverview.map((task) => [
    String(task.sequence).padStart(2, '0'),
    task.roleLabel,
    task.coreMessage,
    task.format,
    task.aspectRatio || '待定'
  ]);
  const evidenceRows = viewModel.evidenceIndex.map((item) => [
    item.id,
    item.topic,
    item.claim,
    sourceList(item.sourceNames)
  ]);
  const auditRows = Object.entries(viewModel.audit.dimensionScores).map(([key, value]) => [
    ({
      projectIdentityAndBoundaries: '项目识别与事实边界',
      evidence: '证据准确与可追溯',
      strategy: '战略重建深度',
      diagnosis: '战略冲突诊断',
      brandDna: 'DNA 区分度与因果性',
      creativeThesis: '创意命题覆盖',
      visualTranslation: '视觉系统专属性',
      visualSpecificity: '视觉系统专属性',
      imageExecution: '生图任务可执行性',
      reusability: '复用与一致性',
      crossFieldTechnical: '跨字段一致性与技术正确性'
    })[key] || key,
    String(value)
  ]);
  const metadata = viewModel.metadata;

  return `# ${escapeMarkdownInline(viewModel.title.brandName)}
## ${viewModel.title.reportName}

> **分析模式**：Brand DNA 深度分析  
> **信息状态**：${infoStatus}  
> **核心命题**：${escapeMarkdownInline(viewModel.executiveSummary.creativeThesis)}  
> **质量状态**：${qualityStatus}

## 0. 执行摘要

### 品牌当前最重要的事实

${bulletList(viewModel.executiveSummary.confirmedFacts, '现有材料不足以确认核心事实。')}

### 本报告的核心判断

${bulletList(viewModel.executiveSummary.keyJudgments, '需要补充资料后再形成判断。')}

### 唯一创意命题

> ${escapeMarkdownInline(viewModel.executiveSummary.creativeThesis)}

### 需要优先确认

${viewModel.executiveSummary.priorityConfirmations.length
    ? viewModel.executiveSummary.priorityConfirmations.map((item, index) => `${index + 1}. ${escapeMarkdownInline(item)}`).join('\n')
    : '当前没有必须优先确认的事项。'}

## 1. 项目识别与事实边界

${viewModel.identity.projectName !== viewModel.identity.brandName
    ? `- **项目名称**：${escapeMarkdownInline(viewModel.identity.projectName)}\n`
    : ''}- **品牌名称**：${escapeMarkdownInline(viewModel.identity.brandName)}
- **分析任务名**：${escapeMarkdownInline(viewModel.identity.analysisTaskName || '与品牌名称一致，不单独展示')}
- **来源文档**：${sourceList(viewModel.identity.sourceFileTitles)}
- **识别置信度**：${({ high: '高', medium: '中', low: '低' })[viewModel.identity.confidence] || '低'}

### 信息状态说明

- \`已确认\`：文档中有明确表达，且没有相互冲突。
- \`合理推断\`：由材料合理推导，但原文没有直接确认。
- \`建议\`：战略或创意建议，不是项目既有事实。
- \`内容冲突\`：不同材料存在不一致，报告不擅自裁决。
- \`信息缺失\`：完成判断所需的信息尚未出现。

### 核心事实

${viewModel.facts.slice(0, 8).map(factCard).join('\n\n---\n\n')}

## 2. 核心战略结论

### 品牌对外定位

${factCard(viewModel.strategy.positioning)}

### 实际业务结构

${factCard(viewModel.strategy.businessReality)}

### 品牌使命与承诺

${factCard(viewModel.strategy.purpose)}

${factCard(viewModel.strategy.promise)}

### 目标人群与使用关系

${viewModel.strategy.audience.length
    ? viewModel.strategy.audience.map(factCard).join('\n\n')
    : '现有材料尚未形成可靠的人群结构。'}

## 3. 品牌 DNA

${markdownTable(
    ['基因', '类型', '核心表述', '置信度', '文化成熟度'],
    geneRows
  )}

### 一句话品牌 DNA

> ${escapeMarkdownInline(viewModel.oneSentenceDna)}

## 4. 战略冲突、缺失与风险

### 内容冲突

${bulletList(viewModel.risks.conflicts, '未发现明确冲突。')}

### 信息缺失

${bulletList(viewModel.risks.missing, '暂无。')}

### 空泛表达

${bulletList(viewModel.risks.generic, '未发现明显空泛表达。')}

### 战略与合规风险

${bulletList(viewModel.risks.strategic, '暂无明确风险。')}

## 5. 唯一创意命题

> ${escapeMarkdownInline(viewModel.creativeThesis.statement)}

该命题是后续色彩、图形、摄影、材质、光线与图片任务的唯一共同方向。${
  viewModel.creativeThesis.coverage
    ? `\n\n**覆盖度**：能力 ${viewModel.creativeThesis.coverage.capability}/5 · 关系 ${viewModel.creativeThesis.coverage.relationship}/5 · 情绪 ${viewModel.creativeThesis.coverage.emotion}/5 · 文化 ${viewModel.creativeThesis.coverage.culture}/5 · 差异化 ${viewModel.creativeThesis.coverage.differentiation}/5`
    : '\n\n**覆盖度**：旧版结构化结果未评估。'
}

## 6. 视觉创意系统

- **视觉气质**：${viewModel.visualSystem.personality.map(escapeMarkdownInline).join('、') || '待建立'}
- **视觉关键词**：${viewModel.visualSystem.keywords.map(escapeMarkdownInline).join('、') || '待建立'}
- **情绪温度**：${viewModel.visualSystem.emotionalTemperature.map(escapeMarkdownInline).join('、') || '待建立'}
- **全局视觉锚点**：${escapeMarkdownInline(viewModel.visualSystem.anchorVisual || '待建立')}
- **构图系统**：${escapeMarkdownInline(viewModel.visualSystem.compositionSystem || '待建立')}
- **材质系统**：${viewModel.visualSystem.materialSystem.map(escapeMarkdownInline).join('、') || '待建立'}
- **光线系统**：${escapeMarkdownInline(viewModel.visualSystem.lightingSystem || '待建立')}
- **图像语言**：${escapeMarkdownInline(viewModel.visualSystem.imageLanguage || '待建立')}

### 品牌专属视觉资产候选

${bulletList(viewModel.visualSystem.distinctiveAssets, '尚未形成可追溯的品牌专属视觉资产机制。')}

${directionSection('色彩方向', viewModel.visualSystem.directions.color)}

${directionSection('图形方向', viewModel.visualSystem.directions.graphic)}

${directionSection('构图与摄影方向', [
    ...viewModel.visualSystem.directions.composition,
    ...viewModel.visualSystem.directions.photography
  ])}

${directionSection('材质、光线与动态方向', [
    ...viewModel.visualSystem.directions.material,
    ...viewModel.visualSystem.directions.lighting,
    ...viewModel.visualSystem.directions.motion
  ])}

### DNA 到视觉变量的因果映射

${viewModel.visualSystem.mappings.length
    ? viewModel.visualSystem.mappings.map((mapping) => `- **${escapeMarkdownInline(mapping.dnaGeneId)}｜${escapeMarkdownInline(mapping.visualVariable)}**：${escapeMarkdownInline(mapping.decision)}。${escapeMarkdownInline(mapping.rationale)}`).join('\n')
    : '- 尚未建立可靠映射。'}

## 7. 生成与设计边界

### 已确认且必须保持的事实

${bulletList(viewModel.boundaries.lockedFacts, '暂无额外锁定事实。')}

### 已批准资产

${bulletList(viewModel.boundaries.lockedAssets, '未提供可锁定的 Logo、标准色、字体、图形或认证资产。')}

### 已确认的任务必需元素

${bulletList(viewModel.boundaries.verifiedRequiredElements, '旧版结果未单独标注已确认的任务必需元素。')}

### 建议元素

${bulletList(viewModel.boundaries.suggestedElements, '暂无。')}

### 可发挥空间

${bulletList(viewModel.boundaries.creativeFreedom, '仅可在已确认事实边界内创造。')}

### 禁止元素与声明

${bulletList([
    ...viewModel.boundaries.prohibitedElements,
    ...viewModel.boundaries.prohibitedClaims
  ], '不得伪造 Logo、认证、疗效、产品标签或业务事实。')}

### 全局政策

- **文字政策**：${escapeMarkdownInline(viewModel.boundaries.textPolicy)}
- **Logo 政策**：${escapeMarkdownInline(viewModel.boundaries.logoPolicy)}

## 8. 图片任务总览

${markdownTable(['顺序', '图片职责', '核心信息', '形式', '比例'], taskRows)}

## 9. 待确认事项

${viewModel.boundaries.pendingConfirmations.length
    ? markdownTable(
        ['序号', '待确认内容', '影响'],
        viewModel.boundaries.pendingConfirmations.map((item, index) => [
          String(index + 1),
          item,
          '确认后更新相关事实、边界与图片任务'
        ])
      )
    : '当前核心信息已在材料范围内确认；新增资料仍需复核。'}

# 执行附录

${viewModel.taskDetails.map((task, index) => taskDetail(task, index, viewModel.boundaries)).join('\n\n')}

## B. 证据索引

${evidenceRows.length
    ? markdownTable(['证据', '主题', '结论', '来源'], evidenceRows)
    : '旧版结果未保留可用证据索引。'}

## C. 原文引用

${viewModel.evidenceQuotes.length
    ? viewModel.evidenceQuotes.map((quote) => `### ${quote.evidenceId}｜${escapeMarkdownInline(quote.topic)}

**来源**：《${escapeMarkdownInline(quote.sourceName)}》  
**位置**：${escapeMarkdownInline(quote.location)}

> ${escapeMarkdownInline(quote.quote)}`).join('\n\n')
    : '旧版结果未保留完整原文。'}

## D. 质量审计摘要

- **质量状态**：${viewModel.audit.passed ? '通过' : '需复核'}
- **综合评分**：${viewModel.audit.score}/100
- **模型原始评分**：${viewModel.audit.reportedScore}/100
- **仍需人工确认**：${viewModel.audit.pendingCount} 项

${auditRows.length ? markdownTable(['维度', '得分'], auditRows) : '旧版结果未保留分维度评分。'}

### 硬失败

${bulletList(viewModel.audit.hardFailures, '无。')}

### 扣分与改进原因

${bulletList(viewModel.audit.deductions, '无额外扣分项。')}

## E. 协议、模型与运行元数据

- **报告协议**：${cleanText(metadata.reportSchemaVersion, 'brand-dna-report-v2')}
- **内容协议**：${cleanText(metadata.contentProtocolVersion, 'brand-dna-content-v1.2')}
- **分析协议**：${cleanText(metadata.protocolVersion, '旧版未记录')}
- **Brand DNA Schema**：${cleanText(metadata.brandDnaSchemaVersion, '旧版未记录')}
- **生图 Schema**：${cleanText(metadata.imageTaskSchemaVersion, '旧版未记录')}
- **模型**：${cleanText(metadata.modelId, '旧版未记录')}
- **模型质量等级**：${cleanText(metadata.qualityTier, '旧版未记录')}
- **生成时间**：${cleanText(metadata.generatedAt, '旧版未记录')}
`;
}
