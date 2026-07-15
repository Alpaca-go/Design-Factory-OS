import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, mdCell, writeText } from './utils.js';

export const STANDARD_OUTPUT_FILES = [
  '01-Analysis.md',
  '02-Creative-Brief.md',
  '03-Design-Decisions.md',
  '04-Design-Review.md'
];
export const QUICK_OUTPUT_FILES = ['02-Creative-Brief.md'];

const RETIRED_OUTPUTS = [
  '01-项目分析报告.md', '03-Knowledge-Review.md',
  '00-素材清单.md', '01-Brand-Lock.md', '02-视觉方案优化报告.md', '03-缺图分析.md', '04-图片规划.md',
  'Chat生图任务包.md', '02-Chat生图任务包.md', 'Knowledge-Candidate.md', 'Knowledge-Analysis.md',
  '03-Decision-Log.md', 'Creative-Brief-GPT.md', '02-Creative-Brief-GPT.md'
];

function header(title, result) {
  return `# ${title}\n\n> Masterpiece-OS v${result.version}  \n> 生成时间：${result.generatedAt}  \n> 项目：${result.brandLock.brandName}\n\n`;
}

function list(values, empty = '待确认') {
  return values?.length ? values.map((value) => `- ${value}`).join('\n') : `- ${empty}`;
}

function inline(values, empty = '待确认') {
  return values?.length ? values.join('；') : empty;
}

function brandLock(brand) {
  return `## Evidence\n\n` +
    `- 素材中的品牌名称：${brand.brandName}\n` +
    `- Logo 候选：${brand.logo.files.join('、') || '待提供/待确认'}\n` +
    `- 主色：${brand.primaryColor || '待确认'}\n` +
    `- 辅助色：${brand.secondaryColors.join('、') || '待确认'}\n` +
    `- 字体与版式气质：${brand.fontTemperament || '待确认'}\n` +
    `- 包装/载体：${brand.packaging.join('、') || '待确认'}\n` +
    `- 核心视觉资产：${brand.coreVisualAssets.join('、') || '待确认'}\n\n`;
}

function analysisReport(result) {
  const a = result.analysis;
  const inspection = a.evidence.assets;
  const competitorRows = a.competitorAnalysis.length
    ? a.competitorAnalysis.map((item, index) => `| ${index + 1} | ${mdCell(item.name)} | ${mdCell(item.relevance)} | ${item.url ? `[来源](${item.url})` : '未提供'} |`).join('\n')
    : '| — | 待补充 | 尚无可核验同类案例 | 未提供 |';
  const risks = a.designRisks.map((risk, index) =>
    `### ${index + 1}. ${risk.problem}\n\n- 原因：${risk.reason}\n- 控制方式：${risk.prevention}`
  ).join('\n\n');
  return header('Analysis', result) +
    `> Analysis 保存证据、研究、推理与完整风险，仅用于回溯和验证，不直接交给 GPT 生图。\n\n` +
    `## Analysis Scope\n\n` +
    `- 模式：${result.mode}\n- 素材：${inspection.totalFiles} 个文件，其中图片 ${inspection.imageCount} 张\n` +
    `- 逐张视觉核验：${inspection.inspectedImageCount}/${inspection.imageCount}\n` +
    `- 核验状态：${inspection.visualInspectionVerified ? '已闭环' : '未闭环'}\n\n` +
    `## Original Intent\n\n${a.originalIntent.statement}\n\n**Evidence：** ${inline(a.originalIntent.evidence, '待补充可核验依据')}。\n\n` +
    `## Industry Benchmark\n\n` +
    `- 对标语境：${a.industryBenchmark.context}\n` +
    `- 共同观察：${inline(a.industryBenchmark.observations)}\n` +
    `- 差异机会：${inline(a.industryBenchmark.opportunities)}\n\n` +
    `## Competitor Analysis\n\n| # | 案例 | 相关性 | 来源 |\n|---:|---|---|---|\n${competitorRows}\n\n` +
    brandLock(a.evidence.brandLock) +
    `### Visual Inspection Findings\n\n${list(inspection.findings, '尚无逐张画面结论')}\n\n` +
    `## Reasoning\n\n` +
    `### Brand Identity\n\n${a.reasoning.brandIdentity.statement}\n\n依据：${inline(a.reasoning.brandIdentity.evidence)}。\n\n` +
    `### Brand Positioning\n\n${a.reasoning.brandPositioning.statement}\n\n依据：${inline(a.reasoning.brandPositioning.evidence)}。\n\n` +
    `### Design Language\n\n${a.reasoning.designLanguage.statement}\n\n理由：${inline(a.reasoning.designLanguage.rationale)}。\n\n` +
    `### Emotional Direction\n\n${a.reasoning.emotionalDirection.statement}\n\n` +
    `- 希望产生：${inline(a.reasoning.emotionalDirection.desiredFeelings)}\n- 应避免：${inline(a.reasoning.emotionalDirection.avoidFeelings)}\n\n` +
    `## Creative Decision\n\n${a.creativeDecision.statement}\n\n` +
    `- 决策原因：${inline(a.creativeDecision.rationale)}\n- 主动取舍：${inline(a.creativeDecision.tradeoffs)}\n` +
    `- 批准状态：${a.approval.status}\n- 批准人：${a.approval.approvedBy || '待确认'}\n- 批准时间：${a.approval.approvedAt || '待确认'}\n\n` +
    `## Design Risks\n\n${risks || '完整设计风险待确认。'}\n\n` +
    `## Analysis Boundary\n\n- 对标案例不能替代项目事实。\n- 用户现有视觉不能直接升级为 Approved Brand DNA。\n- 未核验内容继续保持待确认。\n`;
}

function creativeBrief(result) {
  const b = result.creativeBrief;
  const dnaRows = Object.entries(b.approvedBrandDNA)
    .map(([name, value]) => `| ${name} | ${mdCell(value)} |`).join('\n');
  const photo = b.photographyDirection;
  return header('Creative Brief', result) +
    `> 面向设计团队与 GPT 的高密度设计方向。每句话都应帮助设计。\n\n` +
    `## 1. Creative Vision\n\n${b.creativeVision.statement}\n\n${b.creativeVision.direction}\n\n` +
    `## 2. Brand Personality\n\n${b.brandPersonality.statement}\n\n` +
    `- 希望呈现：${inline(b.brandPersonality.desired)}\n- 必须避免：${inline(b.brandPersonality.avoid)}\n\n` +
    `## 3. Approved Brand DNA\n\n| 维度 | 设计边界 |\n|---|---|\n${dnaRows}\n\n` +
    `## 4. Creative Principles\n\n${b.creativePrinciples.statement}\n\n${list(b.creativePrinciples.principles, '设计原则待确认')}\n\n` +
    `### Avoid Rules\n\n${list(b.creativePrinciples.avoidRules, '避免偏离已批准的品牌方向')}\n\n` +
    `## 5. Must Keep\n\n${list(b.mustKeep, '不可变资产待确认')}\n\n` +
    `## 6. Can Explore\n\n${list(b.canExplore, '探索空间待确认')}\n\n` +
    `## 7. Photography Direction\n\n` +
    `- 光线：${photo.lighting || '待确认'}\n- 取景：${photo.framing || '待确认'}\n- 景深：${photo.depth || '待确认'}\n` +
    `- 材质：${photo.materials || '待确认'}\n- 氛围：${photo.atmosphere || '待确认'}\n\n` +
    `## 8. Design Goal\n\n${b.designGoal}\n`;
}

function designDecisions(result) {
  const d = result.designDecisions;
  const dnaRows = Object.entries(d.approvedBrandDNA)
    .map(([name, value]) => `| ${name} | ${mdCell(value)} |`).join('\n');
  return header('Design Decisions', result) +
    `> 保存关键设计决策及其原因；Analysis 保留完整研究，Creative Brief 只承担执行表达。\n\n` +
    `## Creative Decision\n\n${d.creativeDecision.statement}\n\n` +
    `### Reasons\n\n${list(d.creativeDecision.reasons, '决策原因待确认')}\n\n` +
    `### Rejected Directions\n\n${list(d.creativeDecision.rejectedDirections, '尚无明确取舍')}\n\n` +
    `## Approved Brand DNA\n\n| 维度 | 已批准决策 |\n|---|---|\n${dnaRows}\n\n` +
    `## Creative Principles\n\n${d.creativePrinciples.statement}\n\n${list(d.creativePrinciples.principles, '原则待确认')}\n\n` +
    `### Why\n\n${list(d.creativePrinciples.reasons, '原则原因待确认')}\n\n` +
    `## Must Keep\n\n${list(d.mustKeep)}\n\n` +
    `## Can Explore\n\n${list(d.canExplore)}\n\n` +
    `## Avoid Rules\n\n${list(d.avoidRules)}\n\n` +
    `## Approval\n\n- 状态：${d.approval.status}\n- 批准人：${d.approval.approvedBy || '待确认'}\n` +
    `- 批准时间：${d.approval.approvedAt || '待确认'}\n- 阻塞项：${inline(d.approval.blockers, '无')}\n`;
}

function designReview(result) {
  const review = result.briefReview;
  const rows = review.checks.map((item) =>
    `| ${item.section} | ${item.status} | ${mdCell(item.evidence)} | ${mdCell(item.nextStep)} |`
  ).join('\n');
  return header('Design Review', result) +
    `> 评审压缩后的 Creative Brief 是否清晰、可执行并与 Analysis 分离。\n\n` +
    `## Overall\n\n- 状态：${review.readiness}\n- 完整度：${review.completeness}%\n` +
    `- Brief 内容字符：${review.briefCharacters}\n- 结论：${review.summary}\n\n` +
    `## Eight-Part Brief Check\n\n| Section | Status | Current State | Next Step |\n|---|---|---|---|\n${rows}\n\n` +
    `## Information Architecture Check\n\n` +
    `- Analysis 与 Brief 分离：${review.separationReady ? '通过' : '未通过'}\n` +
    `- Brief 未混入对标、证据或推理标签：${review.forbiddenTerms.length ? `未通过（${review.forbiddenTerms.join('、')}）` : '通过'}\n` +
    `- GPT Runtime Brief：已在内存生成，未保存为正式文件\n\n` +
    `## Strengths\n\n${list(review.strengths, '暂无足够证据形成优势结论')}\n\n` +
    `## Open Questions\n\n${list(review.openQuestions, '无；八部分 Brief 已具备进入创意发展的基础')}\n\n` +
    `## Boundary\n\n本评审不生成图片规划、Prompt 或第五个正式输出文件。\n`;
}

async function removeEmptyDebugDir(output) {
  const debugDir = path.join(output, 'debug');
  try {
    if ((await fs.readdir(debugDir)).length === 0) await fs.rmdir(debugDir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function renderAll(result, output, options = {}) {
  await ensureDir(output);
  for (const name of [...new Set([...RETIRED_OUTPUTS, ...STANDARD_OUTPUT_FILES])]) {
    await fs.rm(path.join(output, name), { force: true });
  }
  if (!options.debug) await fs.rm(path.join(output, 'masterpiece-os-result.json'), { force: true });
  if (!options.performanceJson) {
    await fs.rm(path.join(output, 'debug', 'performance.json'), { force: true });
    await removeEmptyDebugDir(output);
  }

  const allFiles = {
    '01-Analysis.md': analysisReport(result),
    '02-Creative-Brief.md': creativeBrief(result),
    '03-Design-Decisions.md': designDecisions(result),
    '04-Design-Review.md': designReview(result)
  };
  const names = result.mode === 'quick' ? QUICK_OUTPUT_FILES : STANDARD_OUTPUT_FILES;
  for (const name of names) await writeText(path.join(output, name), allFiles[name]);
  result.outputFiles = names;
  if (options.performanceJson) {
    await writeText(path.join(output, 'debug', 'performance.json'), `${JSON.stringify(result.performance, null, 2)}\n`);
  }
  if (options.debug) {
    await writeText(path.join(output, 'masterpiece-os-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  }
  return names;
}
