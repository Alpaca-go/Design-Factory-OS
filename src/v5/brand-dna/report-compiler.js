import { evidenceStatusLabel } from './schema.js';

function escapeCell(value) {
  return String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function sourceText(fact) {
  if (!fact.evidence?.length) return '无直接来源';
  return fact.evidence.map((item) => {
    const location = [item.filename, item.section, item.page ? `第 ${item.page} 页` : ''].filter(Boolean).join(' / ');
    return item.excerpt ? `${location}：“${item.excerpt}”` : location;
  }).join('；');
}

function factLine(label, fact) {
  return `- **${label}**：[${evidenceStatusLabel(fact.status)}｜${fact.confidence}] ${fact.value}${fact.note ? `（${fact.note}）` : ''}
  - Evidence IDs：${fact.evidenceIds?.join('、') || '无'}
  - 来源：${sourceText(fact)}`;
}

function factTable(items, empty = '暂无已提取信息') {
  if (!items?.length) return `- [信息缺失] ${empty}`;
  return [
    '| 信息状态 | 内容 | 置信度 | Evidence IDs | 来源 |',
    '|---|---|---|---|---|',
    ...items.map((fact) => `| ${evidenceStatusLabel(fact.status)} | ${escapeCell(fact.value)} | ${fact.confidence} | ${escapeCell(fact.evidenceIds?.join('、') || '无')} | ${escapeCell(sourceText(fact))} |`)
  ].join('\n');
}

function list(items, fallback = '暂无') {
  return items?.length ? items.map((item) => `- ${item}`).join('\n') : `- ${fallback}`;
}

function directions(title, items) {
  return `### ${title}

${items?.length ? items.map((item) => `- **${item.direction}**：${item.rationale || '基于品牌 DNA 的建议'}${item.actions?.length ? `
  - 动作：${item.actions.join('；')}` : ''}`).join('\n') : '- [信息缺失] 暂无可靠方向'}`;
}

function metadataBlock(metadata, qualityAudit) {
  if (!metadata) return '';
  return `> 协议：${metadata.protocolVersion} · Brand DNA Schema：${metadata.brandDnaSchemaVersion} · 报告 Schema：${metadata.reportSchemaVersion} · 生图 Schema：${metadata.imageTaskSchemaVersion}
>
> 模型质量等级：${metadata.qualityTier} · 质量评分：${qualityAudit?.totalScore ?? metadata.qualityScore}/100 · 深度基准：${metadata.qualityTier === 'benchmark' ? '已通过固定基准认证' : '未宣称达到 GPT-5.6 Benchmark'}

`;
}

function imageSystemBlock(system) {
  if (!system) return '- [信息缺失] 全局视觉系统尚未生成';
  return `### GPT Image System Spec

- **System ID**：${system.systemId}
- **品牌 DNA 摘要**：${system.brandDnaSummary}
- **全局视觉锚点**：${system.anchorVisual}
- **构图系统**：${system.compositionSystem}
- **色彩角色**：${system.colorSystem?.map((item) => `${item.role}＝${item.direction}（${item.usage}）`).join('；') || '待建立'}
- **材质系统**：${system.materialSystem?.join('；') || '待建立'}
- **光线系统**：${system.lightingSystem}
- **图像语言**：${system.imageLanguage}
- **跨图片一致性规则**：${system.consistencyRules?.join('；') || '待建立'}
- **Locked Facts**：${system.lockedFacts?.join('；') || '无'}
- **Known Assets**：${system.knownAssets?.join('；') || '未提供现有视觉资产'}
- **Creative Freedom**：${system.creativeFreedom?.join('；') || '仅在已确认事实边界内创造'}
- **Negative Constraints**：${system.globalProhibitions?.join('；') || '不得伪造业务与视觉资产'}
- **Text Policy**：${system.textPolicy}
- **Logo Policy**：${system.logoPolicy}`;
}

export function compileBrandDnaReport(dna, options = {}) {
  const projectName = dna.projectName.status === 'missing' ? '品牌项目' : dna.projectName.value;
  const genes = dna.genes.map((gene) => `| ${gene.type} | ${escapeCell(gene.statement)} | ${gene.confidence} | ${escapeCell(gene.evidenceIds?.join('、') || '无')} | ${escapeCell(gene.evidence.map((item) => item.filename).join('、') || '推断/建议')} |`).join('\n');
  const tasks = options.imageTasks || dna.creativeTranslation.generationPlan;
  const imageSystem = options.imageSystem || dna.imageSystem;
  return `# ${projectName}品牌DNA与创意转译报告

${metadataBlock(options.metadata, options.qualityAudit)}
## 1. 项目识别结果

${factLine('项目名称', dna.projectName)}
${factLine('品牌名称', dna.brandName)}
${factLine('行业 / 品类', dna.category)}
${factLine('商业模式', dna.businessModel)}
${factLine('发展阶段', dna.developmentStage)}

## 2. 信息可信度与来源说明

- **[已确认]**：文档中有明确表达，且没有相互冲突。
- **[合理推断]**：由多条材料合理推导，但原文没有直接确认。
- **[建议]**：创意与战略优化建议，不是项目既有事实。
- **[内容冲突]**：不同材料或章节存在不一致，报告不替用户擅自裁决。
- **[信息缺失]**：完成判断所需的信息没有出现在材料中。

## 3. 项目事实

${factLine('品牌使命 / 目的', dna.strategy.purpose)}
${factLine('品牌承诺', dna.strategy.brandPromise)}

### 价值主张

${factTable(dna.strategy.valueProposition)}

### 差异化依据

${factTable(dna.strategy.differentiators)}

## 4. 核心目标人群

### 主要人群

${factTable(dna.audience.primary)}

### 次要人群

${factTable(dna.audience.secondary)}

### 需求、阻力与使用场景

**需求**

${factTable(dna.audience.needs)}

**阻力**

${factTable(dna.audience.barriers)}

**使用场景**

${factTable(dna.audience.usageScenarios)}

## 5. 品牌战略提取

${factLine('品牌定位', dna.strategy.positioning)}
${factLine('关系角色', dna.personality.relationshipRole)}

### 品牌价值观

${factTable(dna.strategy.brandValues)}

### 人格、语气与情绪结果

${factTable([...dna.personality.traits, ...dna.personality.toneOfVoice, ...dna.personality.emotionalOutcome])}

## 6. 品牌 DNA

| 基因类型 | DNA 表述 | 置信度 | Evidence IDs | 来源 |
|---|---|---|---|---|
${genes}

## 7. 一句话品牌 DNA

> ${dna.oneSentenceDna}

## 8. 战略冲突、缺失与风险

### 内容冲突

${list(dna.diagnosis.conflicts, '未发现明确冲突')}

### 信息缺失

${list(dna.diagnosis.missingInformation, '暂无')}

### 空泛表达

${list(dna.diagnosis.genericStatements, '未发现明显空泛表达')}

### 战略与合规风险

${list([...dna.diagnosis.strategicRisks, ...dna.boundaries.complianceRisks.map((item) => `[${evidenceStatusLabel(item.status)}] ${item.value}`)], '暂无明确风险')}

## 9. 唯一创意命题

> ${dna.creativeTranslation.creativeThesis}

此命题是本报告唯一的视觉创意方向，后续色彩、字体、图形、摄影、材质、光线与动态均应服从该命题。

## 10. 视觉创意转译

- **视觉气质**：${dna.creativeTranslation.visualPersonality.join('、') || '待建立'}
- **视觉关键词**：${dna.creativeTranslation.visualKeywords.join('、') || '待建立'}
- **情绪温度**：${dna.creativeTranslation.emotionalTemperature.join('、') || '待建立'}

${directions('色彩方向', dna.creativeTranslation.colorDirection)}

${directions('字体与排版方向', dna.creativeTranslation.typographyDirection)}

${directions('图形方向', dna.creativeTranslation.graphicDirection)}

${directions('构图方向', dna.creativeTranslation.compositionDirection)}

${directions('摄影方向', dna.creativeTranslation.photographyDirection)}

${directions('插画方向', dna.creativeTranslation.illustrationDirection)}

${directions('材质与工艺方向', dna.creativeTranslation.materialDirection)}

${directions('光线方向', dna.creativeTranslation.lightingDirection)}

${directions('动态方向', dna.creativeTranslation.motionDirection)}

### 品牌 DNA 到视觉变量的因果映射

${dna.creativeTranslation.mappings?.length ? dna.creativeTranslation.mappings.map((mapping) => `- **${mapping.visualVariable} / ${mapping.decision}**：${mapping.rationale}
  - DNA 基因：${mapping.dnaGeneId}
  - 应用：${mapping.applicationExamples?.join('；') || '待建立'}
  - 避免：${mapping.avoid?.join('；') || '无'}`).join('\n') : '- [信息缺失] 尚未建立因果映射'}

${imageSystemBlock(imageSystem)}

## 11. 建议建立的视觉资产

**已存在资产**

${list(imageSystem?.knownAssets, '未提供现有视觉资产')}

**建议建立资产**

${list(dna.creativeTranslation.suggestedAssets, '根据后续确认信息建立基础视觉资产')}

**禁止擅自生成资产**

- ${imageSystem?.logoPolicy || '不得伪造或重新设计正式 Logo'}
- ${imageSystem?.textPolicy || '不得生成不可控品牌文字，为后期排版预留区域'}

## 12. 禁止与规避方向

${list([
    ...(imageSystem?.globalProhibitions || []),
    ...dna.creativeTranslation.avoidDirections,
    ...dna.boundaries.prohibitedClaims.map((item) => `[${evidenceStatusLabel(item.status)}] ${item.value}`),
    ...dna.boundaries.prohibitedStyles.map((item) => `[${evidenceStatusLabel(item.status)}] ${item.value}`)
  ], '不得伪造正式 Logo、市场数据、产品能力、专业认证或业务事实')}

## 13. GPT 生图任务顺序

${tasks.map((task, index) => `${task.sequence || index + 1}. **${task.title}**（${task.role}）
   - 图片职责：${task.outputResponsibility || task.objective}
   - 品牌 DNA 依据：${task.brandDnaBasis?.join('；') || '见第 6 章'}
   - 观者应获得：${task.viewerTakeaway || '与品牌 DNA 一致的核心认知'}
   - 与前序任务的职责差异：${task.intentionalDifferenceFromPreviousTasks?.join('；') || (index === 0 ? '首张图负责建立全局视觉锚点' : '必须与前图承担不同验证职责')}`).join('\n')}

## 14. 每张图片的执行 Prompt

${tasks.map((task, index) => `### ${index + 1}. ${task.title}

- **图片职责**：${task.objective}
- **品牌 DNA 依据**：${task.brandDnaBasis?.join('；') || '见第 6 章'}
- **主体**：${task.subject}
- **环境 / 场景**：${task.environment}
- **叙事时刻**：${task.narrativeMoment}
- **必须元素**：${task.requiredElements.join('；') || '以品牌 DNA 为准'}
- **可选元素**：${task.optionalElements.join('；') || '无'}
- **禁止元素**：${task.prohibitedElements.join('；') || '不得伪造正式 Logo、不可控品牌文字或未确认业务事实'}
- **构图**：${task.composition}
- **视觉焦点**：${task.focalHierarchy}
- **镜头与透视**：${task.cameraAndPerspective}
- **色彩**：${task.colorDirection || task.colorAndLighting}
- **材质与质感**：${task.materialAndTexture}
- **光线**：${task.lighting || task.colorAndLighting}
- **氛围**：${task.atmosphere}
- **Locked Assets**：${task.lockedAssetInstructions?.join('；') || '没有提供可锁定资产'}
- **文字政策 / Text Policy**：${task.textPolicy || '不生成正式品牌文字，为后期排版预留区域'}
- **Logo Policy**：${task.logoPolicy || '不得伪造或重新设计正式 Logo'}
- **与全局锚点的一致性**：${task.consistencyWithPreviousTasks?.join('；') || imageSystem?.consistencyRules?.join('；') || '遵循同一全局视觉系统'}
- **与其他图片的职责差异**：${task.intentionalDifferenceFromPreviousTasks?.join('；') || '承担独立验证职责'}
- **画幅比例**：${task.aspectRatio || '由任务场景决定'}

\`\`\`text
${task.finalPrompt || task.prompt}
\`\`\``).join('\n\n')}

## 15. 待确认信息

${list([
    ...dna.diagnosis.missingInformation,
    ...[dna.projectName, dna.brandName, dna.category, dna.businessModel, dna.developmentStage]
      .filter((fact) => fact.status === 'missing' || fact.status === 'conflicting')
      .map((fact) => fact.value)
  ], '当前核心信息已在材料范围内得到确认；后续新增资料仍需复核')}
`;
}

export function validateBrandDnaReport(markdown, options = {}) {
  for (let index = 1; index <= 15; index += 1) {
    if (!markdown.includes(`## ${index}.`)) throw new Error(`品牌 DNA 报告缺少第 ${index} 章`);
  }
  for (const label of ['[已确认]', '[合理推断]', '[建议]', '[内容冲突]', '[信息缺失]']) {
    if (!markdown.includes(label)) throw new Error(`品牌 DNA 报告缺少信息状态 ${label}`);
  }
  for (const label of [
    '唯一创意命题', 'GPT 生图任务顺序', 'Locked Facts', 'Negative Constraints',
    'Logo Policy', 'Text Policy', '全局视觉锚点', '主体', '构图', '光线', '与全局锚点的一致性'
  ]) {
    if (!markdown.includes(label)) throw new Error(`品牌 DNA 报告缺少字段：${label}`);
  }
  if (options.imageSystem && !options.imageSystem.systemId) throw new Error('品牌 DNA 报告缺少 GPT Image System ID');
  if (options.imageTasks && options.imageTasks.some((task) => !(task.finalPrompt || task.prompt))) {
    throw new Error('品牌 DNA 报告包含缺少 finalPrompt 的图片任务');
  }
}
