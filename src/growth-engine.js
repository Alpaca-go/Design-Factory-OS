import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, slug, writeText } from './utils.js';

const TREND_DIMENSIONS = ['品牌识别', '包装设计', '字体', '版式', '摄影', 'VI', '作品集表现'];

export function reviewRecordId(projectName, generatedAt) {
  const date = new Date(generatedAt);
  const localDate = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  return `${localDate}-${slug(projectName)}`;
}

export async function loadReviewHistory(historyDir, excludeRecordId = null) {
  await ensureDir(historyDir);
  const entries = await fs.readdir(historyDir, { withFileTypes: true });
  const records = [];
  const warnings = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
    if (!entry.isFile() || !entry.name.endsWith('.review.json')) continue;
    try {
      const record = JSON.parse(await fs.readFile(path.join(historyDir, entry.name), 'utf8'));
      if (!record.recordId || !Array.isArray(record.radar)) throw new Error('缺少 recordId 或 radar');
      if (record.recordId !== excludeRecordId) records.push(record);
    } catch (error) {
      warnings.push(`${entry.name}：${error.message}`);
    }
  }
  return { records, warnings };
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function trendDirection(delta) {
  if (delta >= 3) return '↑';
  if (delta <= -3) return '↓';
  return '→';
}

export function buildGrowthAnalysis(review, history) {
  const historyCount = history.records.length;
  const current = new Map(review.radar.map((item) => [item.dimension, item]));
  const trends = TREND_DIMENSIONS.map((dimension) => {
    const currentScore = current.get(dimension)?.score ?? 0;
    const pastScores = history.records.map((record) => record.radar.find((item) => item.dimension === dimension)?.score).filter(Number.isFinite);
    const historicalAverage = average(pastScores);
    const delta = historicalAverage == null ? null : Math.round((currentScore - historicalAverage) * 10) / 10;
    return { dimension, currentScore, historicalAverage: historicalAverage == null ? null : Math.round(historicalAverage * 10) / 10, delta, direction: delta == null ? '—' : trendDirection(delta) };
  });
  const training = [...review.radar].sort((a, b) => a.score - b.score).slice(0, 3).map((item, index) => ({
    rank: index + 1,
    direction: ({ '摄影': 'Hero 构图与产品摄影', 'VI': 'VI 系统', '字体': '字体层级', '作品集表现': '作品集叙事', '包装设计': '包装结构与展示', '品牌识别': '品牌识别系统', '版式': '网格与信息层级', '色彩': '色彩系统' })[item.dimension] || item.dimension,
    reason: `${item.dimension}当前为 ${item.score} 分，是能力雷达中较需要加强的维度。`,
    improves: [item.dimension, item.dimension === '摄影' ? '包装设计' : '作品集表现'],
    recommendedProjects: item.score < 55 ? 3 : 2
  }));
  const firstProject = historyCount === 0;
  return {
    historyCount,
    status: firstProject ? '首次项目，暂无历史数据。' : `已读取 ${historyCount} 个历史项目记录，并与本次评分比较。`,
    warnings: history.warnings,
    trends,
    nextStage: { focus: training[0].direction, why: training[0].reason, improves: training[0].improves },
    training
  };
}

function historyMarkdown(record) {
  return `# ${record.projectName}｜Design Review 历史记录\n\n- 记录 ID：${record.recordId}\n- 生成时间：${record.generatedAt}\n- 总体评分：${record.overallScore}\n- 项目完成度：${record.completion}%\n\n## 模块评分\n\n${Object.entries(record.moduleScores).map(([name, score]) => `- ${name}：${score}`).join('\n')}\n\n## 能力雷达\n\n${record.radar.map((item) => `- ${item.dimension}：${item.score}｜${item.reason}`).join('\n')}\n\n## 成长建议\n\n- 下一阶段：${record.growthAdvice.focus}\n- 原因：${record.growthAdvice.why}\n- 预计提升：${record.growthAdvice.improves.join('、')}\n\n## Action Items\n\n${record.actionItems.map((item) => `- [${item.selected ? 'x' : ' '}] ${item.action}：${item.reason}`).join('\n')}\n`;
}

export async function saveReviewHistory(result, historyDir) {
  const recordId = reviewRecordId(result.brandLock.brandName, result.generatedAt);
  const record = {
    schemaVersion: 1,
    recordId,
    projectName: result.brandLock.brandName,
    generatedAt: result.generatedAt,
    overallScore: result.designReview.overallScore,
    completion: result.designReview.completion,
    moduleScores: Object.fromEntries(Object.entries(result.designReview.modules).map(([name, module]) => [name, module.score])),
    radar: result.designReview.radar,
    growthAdvice: result.growth.nextStage,
    actionItems: result.actionItems
  };
  await ensureDir(historyDir);
  await writeText(path.join(historyDir, `${recordId}.review.json`), `${JSON.stringify(record, null, 2)}\n`);
  await writeText(path.join(historyDir, `${recordId}.review.md`), historyMarkdown(record));
  return record;
}
