import path from 'node:path';
import { ensureDir, mdCell, writeText } from './utils.js';
import { renderCandidateReport, renderKnowledgeAnalysis } from './knowledge-analysis.js';

function header(title, result) {
  return `# ${title}\n\n> Design Factory OS v${result.version} 自动生成  \n> 生成时间：${result.generatedAt}  \n> 项目：${result.brandLock.brandName}\n\n`;
}

function list(values, empty = '暂无') {
  return values?.length ? values.map((x) => `- ${x}`).join('\n') : `- ${empty}`;
}

function inventoryReport(result) {
  const { inventory } = result;
  const rows = inventory.items.map((x) => `| ${mdCell(x.path)} | ${x.type} | ${x.bytes} | ${mdCell(
    x.isImage ? `${x.detail.width || '?'} × ${x.detail.height || '?'}` : x.detail.slides != null ? `${x.detail.slides} 页` : x.detail.pages != null ? `${x.detail.pages} 页` : x.detail.entries != null ? `${x.detail.entries} 项` : '—'
  )} | ${mdCell(x.warning || '')} |`).join('\n');
  return header('素材清单', result) +
    `## 摘要\n\n- 文件总数：${inventory.totalFiles}\n- 图片数量：${inventory.imageCount}\n- 总大小：${inventory.totalBytes} bytes\n\n` +
    `## 类型统计\n\n${Object.entries(inventory.byType).map(([k, v]) => `- ${k}：${v}`).join('\n') || '- 空目录'}\n\n` +
    `## 文件明细\n\n| 路径 | 类型 | 字节 | 解析信息 | 警告 |\n|---|---:|---:|---|---|\n${rows || '| — | — | — | — | — |'}\n`;
}

function brandReport(result) {
  const b = result.brandLock;
  return header('Brand Lock', result) +
    `> 状态说明：自动识别结果是设计约束候选；标记“待确认”的内容不得作为最终品牌规范直接投产。\n\n` +
    `## 品牌名称\n\n${b.brandName}\n\n` +
    `## Logo\n\n- 状态：${b.logo.status}\n- 置信度：${b.logo.confidence}\n${list(b.logo.files)}\n\n` +
    `## 色彩\n\n- 主色：${b.primaryColor || '待人工确认'}\n- 辅助色：${b.secondaryColors.join('、') || '待人工确认'}\n\n` +
    `## 字体气质\n\n- 气质：${b.fontTemperament}\n- 素材中出现的字体：${b.fonts.join('、') || '未识别'}\n\n` +
    `## 包装盒型\n\n${list(b.packaging, '待确认')}\n\n` +
    `## 核心视觉资产\n\n${list(b.coreVisualAssets, '待补充')}\n\n` +
    `## 识别说明\n\n- 来源：${b.source}\n${list(b.notes, '无额外风险提示')}\n`;
}

function optimizationReport(result) {
  const { benchmarks: a, priorities } = result;
  const cases = a.cases.map((x, i) => `| ${i + 1} | ${mdCell(x.name)} | ${mdCell(x.reason)} | ${x.url ? `[查看](${x.url})` : '—'} |`).join('\n');
  return header('视觉方案优化报告', result) +
    `## 项目判断\n\n- 项目类型：${a.projectType.value}\n- 判断依据：${a.projectType.evidence.join('、') || '通用视觉优化需求'}\n- 行业：${a.industry.value}\n- 判断依据：${a.industry.evidence.join('、') || '信息不足，建议人工确认'}\n\n` +
    `## 对标检索\n\n- 联网检索：${a.search.status}\n${a.search.query ? `- 检索词：${a.search.query}\n` : ''}\n` +
    `| # | 案例 | 入选理由 | 来源 |\n|---:|---|---|---|\n${cases}\n\n` +
    `## 优秀案例共性\n\n${list(a.commonTraits)}\n\n` +
    `## 优化优先级\n\n### P0 — 阻塞交付/立刻执行\n\n${list(priorities.P0)}\n\n### P1 — 建立完整系统\n\n${list(priorities.P1)}\n\n### P2 — 持续提升\n\n${list(priorities.P2)}\n\n` +
    `## 执行建议\n\n先冻结 Brand Lock，再依图片规划顺序制作；每批完成后对照同一验收标准复核，避免单张效果优秀但系列失去一致性。\n`;
}

function gapReport(result) {
  const g = result.gaps;
  const rows = g.matrix.map((x) => `| ${x.type} | ${x.current} | ${x.target} | ${x.gap} | ${x.priorityScore} | ${mdCell(x.evidence.slice(0, 3).join('、'))} |`).join('\n');
  return header('缺图分析', result) +
    `## 缺图矩阵\n\n> 对标样本数：${g.benchmarkCaseCount}。优先分 = 缺口 × 业务影响权重。\n\n` +
    `| 图片类型 | 当前 | 建议 | 缺口 | 优先分 | 现有证据 |\n|---|---:|---:|---:|---:|---|\n${rows}\n\n` +
    `## 最值得补充的 3 张\n\n${g.topThree.map((x) => `${x.rank}. **${x.type}**：${x.reason}`).join('\n')}\n`;
}

function taskCard(card) {
  return `### ${card.id}｜${card.title}\n\n- 类别：${card.category}\n- 目标：${card.objective}\n- 场景与构图：${card.scene}\n- 画幅：${card.ratio}\n- 品牌约束：${card.brandConstraints.brandName}；主色 ${card.brandConstraints.primaryColor}；气质 ${card.brandConstraints.temperament}\n- 必须包含：${card.mustHave.join('；')}\n- 禁止出现：${card.avoid.join('；')}\n- 验收：${card.acceptance.join('；')}\n`;
}

function planReport(result) {
  const p = result.imagePlan;
  return header('图片规划', result) +
    `## 队列说明\n\n- 图片总数：${p.count}\n- 排序规则：${p.sequenceRule}\n\n` +
    `| 顺序 | 编号 | 类别 | 图片 | 画幅 |\n|---:|---|---|---|---|\n${p.cards.map((x, i) => `| ${i + 1} | ${x.id} | ${x.category} | ${x.title} | ${x.ratio} |`).join('\n')}\n\n` +
    `## 图片任务卡\n\n${p.cards.map(taskCard).join('\n')}\n`;
}

function chatPackage(result) {
  const b = result.brandLock;
  const p = result.imagePlan;
  return header('Chat 生图任务包', result) +
    `> 本文件为自包含执行包。执行者无需读取项目其他文件；遇到“待确认”项必须暂停该图并请求确认，不得自行发明品牌资产。\n\n` +
    `## 1. Brand Lock\n\n- 品牌：${b.brandName}\n- Logo：${b.logo.files.join('、') || '待提供，不得虚构'}\n- 主色：${b.primaryColor || '待确认'}\n- 辅助色：${b.secondaryColors.join('、') || '待确认'}\n- 字体气质：${b.fontTemperament}\n- 包装盒型：${b.packaging.join('、') || '待确认，不得擅自改变结构'}\n- 核心视觉资产：${b.coreVisualAssets.join('、') || '暂无已确认资产'}\n\n` +
    `## 2. Chat 执行规则\n\n1. 严格按图片队列顺序执行，一次只处理一张图。\n2. 每次生成前复述该任务卡的目标、画幅和品牌约束。\n3. 不生成可读品牌文字；需要文字的区域只保留安全留白，后期排版。\n4. Logo 仅能使用已提供源文件，不得由模型重绘、变形或猜测。\n5. 保持整个系列的包装结构、材质、主辅色、光线逻辑一致。\n6. 每张图完成后按任务卡验收；未通过则记录原因并重做，不跳过。\n7. 输出文件以“编号-图片名称”命名，并在执行日志中记录版本。\n\n` +
    `## 3. 图片队列\n\n${p.cards.map((x, i) => `${i + 1}. ${x.id}｜${x.title}｜${x.ratio}`).join('\n')}\n\n` +
    `## 4. 图片任务卡\n\n${p.cards.map(taskCard).join('\n')}\n` +
    `## 5. 全局验收标准\n\n- [ ] 共输出 ${p.count} 张，编号、顺序和文件名完整\n- [ ] 每张图均符合对应画幅，主体未被裁断\n- [ ] Logo、包装结构、主辅色与 Brand Lock 一致\n- [ ] 系列光线、材质、镜头语言和后期质感一致\n- [ ] 无伪文字、水印、畸形结构、多余肢体或悬浮穿模\n- [ ] 重点缺图真正补齐缺图矩阵，不与现有素材重复\n- [ ] 所有“待确认”项已由项目负责人确认并回填\n`;
}

export async function renderAll(result, output) {
  await ensureDir(output);
  const files = {
    '00-素材清单.md': inventoryReport(result), '01-Brand-Lock.md': brandReport(result),
    '02-视觉方案优化报告.md': optimizationReport(result), '03-缺图分析.md': gapReport(result),
    '04-图片规划.md': planReport(result), 'Chat生图任务包.md': chatPackage(result),
    'Knowledge-Candidate.md': renderCandidateReport(result.knowledgeCandidates, result),
    'Knowledge-Analysis.md': renderKnowledgeAnalysis(result.knowledgeAnalysis, result)
  };
  for (const [name, content] of Object.entries(files)) await writeText(path.join(output, name), content);
  await writeText(path.join(output, 'design-factory-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}
