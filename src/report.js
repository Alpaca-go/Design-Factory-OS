import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, mdCell, writeText } from './utils.js';

const OUTPUT_FILES = [
  '01-项目分析报告.md',
  '02-Creative-Brief.md',
  '03-Knowledge-Review.md',
  '04-Design-Review.md'
];

const LEGACY_OUTPUTS = [
  '00-素材清单.md',
  '01-Brand-Lock.md',
  '02-视觉方案优化报告.md',
  '03-缺图分析.md',
  '04-图片规划.md',
  'Chat生图任务包.md',
  '02-Chat生图任务包.md',
  'Knowledge-Candidate.md',
  'Knowledge-Analysis.md'
];

function header(title, result) {
  return `# ${title}\n\n> Design Factory OS v${result.version}  \n> 生成时间：${result.generatedAt}  \n> 项目：${result.brandLock.brandName}\n\n`;
}

function list(values, empty = '待确认') {
  return values?.length ? values.map((value) => `- ${value}`).join('\n') : `- ${empty}`;
}

function evidence(values) {
  return values?.length ? values.join('；') : '待补充可核验依据';
}

function renderBrandLock(result) {
  const brand = result.brandLock;
  return `## Brand Lock\n\n` +
    `> 这里记录的是当前证据支持的品牌边界。标记“待确认”的内容不能作为正式设计事实。\n\n` +
    `- 品牌名称：${brand.brandName}\n` +
    `- Logo 素材：${brand.logo.files.join('、') || '待提供/待确认'}\n` +
    `- 品牌主色：${brand.primaryColor || '待确认'}\n` +
    `- 辅助色：${brand.secondaryColors.join('、') || '待确认'}\n` +
    `- 字体与版式气质：${brand.fontTemperament || '待确认'}\n` +
    `- 已识别字体：${brand.fonts.join('、') || '待确认'}\n` +
    `- 包装结构：${brand.packaging.join('、') || '待确认'}\n` +
    `- 核心视觉资产：${brand.coreVisualAssets.join('、') || '待确认'}\n\n`;
}

function renderBenchmark(result) {
  const benchmark = result.benchmarks;
  const rows = benchmark.cases.length
    ? benchmark.cases.map((item, index) => `| ${index + 1} | ${mdCell(item.name)} | ${mdCell(item.reason)} | ${item.url ? `[查看来源](${item.url})` : '未提供'} |`).join('\n')
    : '| — | 待补充 | 当前没有可核验对标案例 | 未提供 |';
  return `## Benchmark Analysis\n\n` +
    `- 检索状态：${benchmark.search.status}\n` +
    `- 项目类型：${benchmark.projectType.value}\n` +
    `- 行业：${benchmark.industry.value}\n\n` +
    `| # | 同类案例 | 参考原因 | 来源 |\n|---:|---|---|---|\n${rows}\n\n` +
    `### 同类案例的共同特征\n\n${list(benchmark.commonTraits, '尚未形成有证据支持的共同特征')}\n\n`;
}

function renderReasoningSummary(result) {
  const reasoning = result.creativeReasoning;
  return `## Creative Reasoning\n\n` +
    `> ${reasoning.evidenceStatus}\n\n` +
    `### 品牌身份\n\n${reasoning.brandIdentity.statement}\n\n依据：${evidence(reasoning.brandIdentity.evidence)}。\n\n` +
    `### 品牌定位\n\n${reasoning.brandPositioning.statement}\n\n依据：${evidence(reasoning.brandPositioning.evidence)}。\n\n` +
    `### 设计语言与情绪\n\n- 设计语言：${reasoning.designLanguage.statement}\n- 设计依据：${evidence(reasoning.designLanguage.rationale)}\n- 情绪方向：${reasoning.emotionalDirection.statement}\n- 希望产生的感受：${reasoning.emotionalDirection.desiredFeelings.join('、') || '待确认'}\n- 应避免的感受：${reasoning.emotionalDirection.avoidFeelings.join('、') || '待确认'}\n\n` +
    `### 设计目标\n\n${reasoning.designGoal}\n\n`;
}

function projectAnalysis(result) {
  const benchmark = result.benchmarks;
  const inspected = result.creativeReasoning.visualInspection;
  return header('项目分析报告', result) +
    `## 项目证据概览\n\n` +
    `- 工作流：Creative Brief\n` +
    `- 素材文件：${result.inventory.totalFiles} 个\n` +
    `- 图片素材：${result.inventory.imageCount} 张\n` +
    `- 逐张视觉核验记录：${inspected.inspectedImageCount}/${inspected.totalImages} 张\n` +
    `- 核验状态：${inspected.verified ? '已闭环' : '未闭环'}\n` +
    `- 项目类型依据：${evidence(benchmark.projectType.evidence)}\n` +
    `- 行业依据：${evidence(benchmark.industry.evidence)}\n\n` +
    renderBrandLock(result) + renderBenchmark(result) + renderReasoningSummary(result) +
    `## 当前判断边界\n\n` +
    `- 本报告只把素材、配置和公开来源能够支持的内容写成事实。\n` +
    `- 未经完整视觉核验的构图、材质、工艺与摄影判断保留为待确认。\n` +
    `- 对标案例用于解释行业语境，不会替代本项目自身证据。\n` +
    `- 本阶段不规划图片数量、画幅比例或生图任务。\n`;
}

function creativeBrief(result) {
  const r = result.creativeReasoning;
  const dnaRows = [
    ['Logo', r.visualDNA.logo],
    ['Color', r.visualDNA.color],
    ['Typography', r.visualDNA.typography],
    ['Composition', r.visualDNA.composition],
    ['Whitespace', r.visualDNA.whitespace],
    ['Photography', r.visualDNA.photography],
    ['Materials', r.visualDNA.materials],
    ['Packaging', r.visualDNA.packaging],
    ['Craft', r.visualDNA.craft]
  ].map(([name, value]) => `| ${name} | ${mdCell(value)} |`).join('\n');
  const photo = r.photographyDirection;
  const risks = r.designRisks.map((risk, index) =>
    `### ${index + 1}. ${risk.problem}\n\n- 原因：${risk.reason}\n- 防偏方式：${risk.prevention}`
  ).join('\n\n');
  return header('Creative Brief', result) +
    `> 本简报面向品牌设计与创意团队，定义项目理解、设计边界和探索空间。待确认项需在创意发展前补齐证据。\n\n` +
    `## 1. Brand Identity\n\n${r.brandIdentity.statement}\n\n**判断依据：** ${evidence(r.brandIdentity.evidence)}。\n\n` +
    `## 2. Brand Positioning\n\n${r.brandPositioning.statement}\n\n**定位依据：** ${evidence(r.brandPositioning.evidence)}。\n\n` +
    `## 3. Design Language\n\n${r.designLanguage.statement}\n\n**为什么采用这一语言：** ${evidence(r.designLanguage.rationale)}。\n\n` +
    `### 设计原则\n\n${list(r.designLanguage.principles, '设计原则待确认')}\n\n` +
    `## 4. Emotional Direction\n\n${r.emotionalDirection.statement}\n\n- 希望产生的感受：${r.emotionalDirection.desiredFeelings.join('、') || '待确认'}\n- 应避免的感受：${r.emotionalDirection.avoidFeelings.join('、') || '待确认'}\n- 判断依据：${evidence(r.emotionalDirection.evidence)}\n\n` +
    `## 5. Visual DNA\n\n| 维度 | 品牌视觉边界 |\n|---|---|\n${dnaRows}\n\n` +
    `## 6. Photography Direction\n\n` +
    `- 光线：${photo.lighting}\n- 取景与机位：${photo.framing}\n- 景深：${photo.depth}\n- 材质表现：${photo.materials}\n- 氛围：${photo.atmosphere}\n\n` +
    `## 7. Design Risks\n\n${risks || '当前风险待确认。'}\n\n` +
    `## 8. Must Keep\n\n${list(r.mustKeep, '尚无已确认的不可变资产')}\n\n` +
    `## 9. Can Explore\n\n${list(r.canExplore, '探索空间待设计负责人与品牌方确认')}\n\n` +
    `## 10. Design Goal\n\n${r.designGoal}\n`;
}

function knowledgeReview(result) {
  const review = result.thinkingReview;
  const statusRows = review.categories.map((category) =>
    `| ${category.title} | ${category.questions.length} | ${category.questions.length ? 'Available' : 'Missing'} |`
  ).join('\n');
  const systemQuestions = review.categories.map((category) =>
    `### ${category.title}\n\n${list(category.questions, '该思考框架文件尚无问题')}`
  ).join('\n\n');
  const projectQuestions = review.categories.map((category) =>
    `### ${category.title}\n\n${list(review.projectQuestions[category.id], '暂无项目问题')}`
  ).join('\n\n');
  return header('Knowledge Review', result) +
    `> ${review.statement}\n\n` +
    `## Thinking Framework 状态\n\n` +
    `| 维度 | 问题数 | 状态 |\n|---|---:|---|\n${statusRows}\n\n` +
    `### 读取警告\n\n${list(review.warnings, '无')}\n\n` +
    `## 可复用思考问题\n\n${systemQuestions}\n\n` +
    `## 本项目应继续回答的问题\n\n${projectQuestions}\n\n` +
    `## 治理边界\n\n` +
    `- 本次运行不会把项目结论写成通用答案。\n` +
    `- 本次运行不会修改 Thinking Framework。\n` +
    `- 问题用于帮助设计师检查判断，不会触发自动设计或图片规划。\n`;
}

function designReview(result) {
  const review = result.briefReview;
  const rows = review.checks.map((item) =>
    `| ${item.section} | ${item.status} | ${mdCell(item.evidence)} | ${mdCell(item.nextStep)} |`
  ).join('\n');
  const risks = review.risks.map((risk) =>
    `### ${risk.problem}\n\n- 原因：${risk.reason}\n- 防偏方式：${risk.prevention}`
  ).join('\n\n');
  return header('Design Review', result) +
    `> 本报告评审 Creative Brief 是否具备进入创意发展的证据与边界，不评价尚未产生的设计作品。\n\n` +
    `## 总体结论\n\n` +
    `- 准备状态：${review.readiness}\n` +
    `- 完整度：${review.completeness}%\n` +
    `- 结论：${review.summary}\n\n` +
    `## 十项简报检查\n\n` +
    `| 简报章节 | 状态 | 当前依据 | 下一步 |\n|---|---|---|---|\n${rows}\n\n` +
    `## 已建立的优势\n\n${list(review.strengths, '暂无足够证据形成独立优势结论')}\n\n` +
    `## 待补证问题\n\n${list(review.openQuestions, '无；十项内容已具备进入创意发展的基础')}\n\n` +
    `## 需要持续控制的设计风险\n\n${risks || '当前风险待确认。'}\n\n` +
    `## 评审结论边界\n\n` +
    `本评审不生成图片任务、Prompt、数量或比例方案，也不会自动修改 Knowledge 或执行 Git 操作。\n`;
}

export async function renderAll(result, output, options = {}) {
  await ensureDir(output);
  for (const name of [...new Set([...LEGACY_OUTPUTS, ...OUTPUT_FILES])]) {
    await fs.rm(path.join(output, name), { force: true });
  }
  if (!options.debug) await fs.rm(path.join(output, 'design-factory-result.json'), { force: true });
  const files = {
    '01-项目分析报告.md': projectAnalysis(result),
    '02-Creative-Brief.md': creativeBrief(result),
    '03-Knowledge-Review.md': knowledgeReview(result),
    '04-Design-Review.md': designReview(result)
  };
  result.outputFiles = Object.keys(files);
  for (const [name, content] of Object.entries(files)) {
    await writeText(path.join(output, name), content);
  }
  if (options.debug) {
    await writeText(path.join(output, 'design-factory-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  }
  return Object.keys(files);
}
