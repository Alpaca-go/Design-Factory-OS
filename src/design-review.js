import { unique } from './utils.js';

export const RADAR_DIMENSIONS = ['品牌识别', '包装设计', '版式', '字体', '色彩', '摄影', 'VI', '作品集表现'];

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));

function matrixCurrent(result, pattern) {
  return result.gaps.matrix.filter((item) => pattern.test(item.type)).reduce((sum, item) => sum + item.current, 0);
}

function configuredScore(config, dimension, calculated) {
  const value = config.reviewScores?.[dimension];
  return Number.isFinite(value) ? clamp(value) : clamp(calculated);
}

function capability(dimension, score, reason, suggestion, config) {
  return { dimension, score: configuredScore(config, dimension, score), reason, suggestion };
}

function buildRadar(result, config) {
  const brand = result.brandLock;
  const imageCount = result.inventory.imageCount;
  const packagingViews = matrixCurrent(result, /包装|产品特写/);
  const posterViews = matrixCurrent(result, /海报|社交媒体/);
  const viViews = matrixCurrent(result, /品牌标准字|色彩规范|字体规范|图形纹样|图标系统|延展物料/);
  const photoViews = matrixCurrent(result, /包装场景|产品特写/);
  const totalTarget = result.gaps.matrix.reduce((sum, item) => sum + item.target, 0) || 1;
  const totalCurrent = result.gaps.matrix.reduce((sum, item) => sum + Math.min(item.current, item.target), 0);
  const portfolioScore = 25 + (totalCurrent / totalTarget) * 75;
  return [
    capability('品牌识别', 30 + (brand.logo.files.length ? 25 : 0) + (brand.primaryColor ? 20 : 0) + Math.min(20, brand.coreVisualAssets.length * 5) + (brand.brandName ? 5 : 0), `Logo 候选 ${brand.logo.files.length} 个，主色${brand.primaryColor ? `已确认 ${brand.primaryColor}` : '待确认'}，核心视觉资产 ${brand.coreVisualAssets.length} 项。`, '固定 Logo、主色和核心图形的组合规则，并在关键触点重复验证。', config),
    capability('包装设计', 30 + Math.min(30, packagingViews * 8) + (brand.packaging.length ? 20 : 0) + (matrixCurrent(result, /包装正面/) ? 10 : 0), `识别包装形态 ${brand.packaging.length} 种，包装与产品展示证据 ${packagingViews} 项。`, '补齐正背侧、结构开合、工艺细节和统一光线下的系列展示。', config),
    capability('版式', 35 + Math.min(35, posterViews * 8) + Math.min(20, imageCount * 2), `海报/传播类证据 ${posterViews} 项，可解析图片共 ${imageCount} 张。`, '用固定网格、留白比例和信息层级完成至少三张连续版式练习。', config),
    capability('字体', 35 + (brand.fonts.length ? 30 : 0) + (brand.fontTemperament ? 15 : 0) + (matrixCurrent(result, /字体规范|品牌标准字/) ? 15 : 0), `识别字体 ${brand.fonts.length} 种，字体气质为“${brand.fontTemperament}”。`, '建立标题、正文、数字和辅助信息的字号、字重与行距层级。', config),
    capability('色彩', 35 + (brand.primaryColor ? 30 : 0) + Math.min(25, brand.secondaryColors.length * 8) + (matrixCurrent(result, /色彩规范/) ? 10 : 0), `主色${brand.primaryColor ? `为 ${brand.primaryColor}` : '缺失'}，辅助色 ${brand.secondaryColors.length} 个。`, '补充色彩比例、背景适配、可读性和印刷/屏幕转换规范。', config),
    capability('摄影', 30 + Math.min(45, photoViews * 12) + (imageCount >= 6 ? 15 : imageCount * 2), `场景与特写类证据 ${photoViews} 项，当前图片总量 ${imageCount} 张。`, '连续训练 Hero 构图、产品特写与同光位系列摄影。', config),
    capability('VI', 30 + Math.min(35, viViews * 8) + (brand.logo.files.length ? 10 : 0) + (brand.primaryColor ? 10 : 0) + (brand.coreVisualAssets.length ? 10 : 0), `VI 展示证据 ${viViews} 项，已识别 Logo、色彩或核心图形中的 ${[brand.logo.files.length > 0, Boolean(brand.primaryColor), brand.coreVisualAssets.length > 0].filter(Boolean).length}/3 类。`, '把 Logo、色彩、字体和图形语言整理为可复用组件与明确禁用规则。', config),
    capability('作品集表现', portfolioScore, `缺图矩阵目标覆盖 ${totalCurrent}/${totalTarget}，当前项目规划 ${result.imagePlan.count} 张补充图片。`, '按“概念—系统—触点—细节—结果”顺序补齐作品集叙事。', config)
  ];
}

function check(item, status, evidence, suggestion) {
  return { item, status, evidence, suggestion };
}

function reviewModule(score, basis, strengths, problems, suggestions, checks) {
  return { score, basis, strengths, problems, suggestions, checks };
}

function improvement(problem, impact, suggestion, referenceDirection, expectedEffect, priority, category) {
  return { problem, impact, suggestion, referenceDirection, expectedEffect, priority, category };
}

export function buildDesignReview(result, config = {}) {
  const radar = buildRadar(result, config);
  const scoreOf = (name) => radar.find((item) => item.dimension === name).score;
  const missingLogo = result.brandLock.logo.files.length === 0;
  const missingColor = !result.brandLock.primaryColor;
  const topGaps = result.gaps.topThree;
  const automaticImprovements = [
    ...(missingLogo ? [improvement('缺少可用的 Logo 源文件或明确标志证据', '关键触点无法稳定复用品牌识别，生图也容易产生伪造标志。', '补充矢量 Logo，并定义最小尺寸、安全空间和禁用方式。', '研究优秀品牌手册中的 Logo clear space 与小尺寸应用页。', '品牌识别稳定，减少返工和错误资产传播。', 'P0', 'Brand')] : []),
    ...(missingColor ? [improvement('主色尚未得到可靠确认', '系列图片与物料容易出现色彩漂移，削弱统一性。', '由负责人确认主色值，并补充辅助色及使用比例。', '参考同类品牌的主辅色占比和深浅背景适配方式。', '提升跨触点一致性和品牌记忆度。', 'P0', 'Visual System')] : []),
    ...topGaps.map((gap, index) => improvement(`作品集中缺少足够的${gap.type}`, `当前数量 ${gap.current}，低于建议数量 ${gap.target}，导致项目叙事或触点证明不完整。`, `按图片规划优先完成 ${gap.gap} 张${gap.type}，并使用统一验收标准。`, `重点观察对标案例如何用${gap.type}证明概念、材质与使用场景。`, `作品集完整度提高，并让评审者更快理解设计价值。`, index === 0 ? 'P0' : 'P1', 'Portfolio')),
    improvement('字体层级尚未形成可验证的完整规范', '不同页面容易依靠临时排版，信息节奏和可读性不稳定。', '建立标题、正文、注释和数字四级样式，并用三种内容密度压力测试。', '参考编辑设计中的字号比、行长、行距和对齐方式。', '提高信息层级、版式效率和系列一致性。', 'P1', 'Visual System'),
    improvement('包装摄影与 Hero 构图需要形成系列方法', '单张效果即使成立，也难以支撑包装质感和完整作品集叙事。', '固定镜头、光位、背景材质和后期参数，连续完成主视觉、组合与微距三类画面。', '分析优秀包装案例的主光方向、接触阴影、材质高光和镜头高度。', '提升包装质感、摄影一致性和首屏吸引力。', 'P1', 'Packaging')
  ];
  const configuredImprovements = (config.reviewFindings?.improvements || []).map((item) => improvement(
    item.problem || '待确认问题',
    item.impact || '影响待人工确认。',
    item.suggestion || '由项目负责人补充可执行建议。',
    item.referenceDirection || '结合本项目视觉证据与已核验对标案例复核。',
    item.expectedEffect || '预计改善效果待验证。',
    ['P0', 'P1', 'P2'].includes(item.priority) ? item.priority : 'P1',
    item.category || 'Visual System'
  ));
  const replaceAutomatic = config.reviewFindings?.replaceAutomatic === true;
  const improvementPool = replaceAutomatic && configuredImprovements.length
    ? configuredImprovements
    : [...configuredImprovements, ...automaticImprovements];
  const improvements = improvementPool
    .filter((item, index, items) => items.findIndex((candidate) => candidate.problem === item.problem) === index);
  while (improvements.length < 5) improvements.push(improvement('视觉系统的跨触点验证不足', '规则可能只在单张画面成立，扩展时容易失去一致性。', '选择包装、VI 和海报各一个触点，用同一组资产完成连续验证。', '参考优秀案例中核心资产在不同媒介上的尺度与节奏变化。', '增强系统扩展能力和作品集说服力。', 'P2', 'Visual System'));

  const automaticStrengths = [
    { strength: '分析链路完整', reason: `已形成 Brand Lock、${result.benchmarks.cases.length} 个对标案例、缺图矩阵和 ${result.imagePlan.count} 张图片规划。`, keep: '后续迭代继续使用同一证据链，确保建议可追溯。' },
    { strength: result.brandLock.logo.files.length ? '已具备 Logo 识别基础' : '品牌风险被明确暴露', reason: result.brandLock.logo.files.length ? `已识别 ${result.brandLock.logo.files.length} 个 Logo 候选，可继续验证应用一致性。` : '系统没有伪造 Logo，而是把缺失资产列为 P0。', keep: '所有关键品牌事实继续坚持“有证据才确认”。' },
    { strength: result.brandLock.primaryColor ? '色彩方向已有明确锚点' : '色彩决策保持可控', reason: result.brandLock.primaryColor ? `主色 ${result.brandLock.primaryColor} 可作为系列视觉统一的起点。` : '未把低置信度颜色推断包装为最终规范。', keep: '建立主辅色比例和跨媒介测试后再扩大使用范围。' },
    { strength: '图片生产计划可执行', reason: `任务卡覆盖 ${unique(result.imagePlan.cards.map((card) => card.category)).join('、')}，每张包含构图、约束和验收。`, keep: '按队列逐张验收，并记录不通过原因用于下一轮改进。' }
  ].slice(0, 4);
  const configuredStrengths = (config.reviewFindings?.strengths || []).map((item) => ({
    strength: item.strength || '待确认优点',
    reason: item.reason || '依据待人工补充。',
    keep: item.keep || '继续保留并在更多触点验证。'
  }));
  const strengthPool = replaceAutomatic && configuredStrengths.length
    ? configuredStrengths
    : [...configuredStrengths, ...automaticStrengths];
  const strengths = strengthPool
    .filter((item, index, items) => items.findIndex((candidate) => candidate.strength === item.strength) === index)
    .slice(0, Math.max(4, configuredStrengths.length));

  const portfolioPresent = result.gaps.matrix.filter((item) => item.current > 0).map((item) => `${item.type}（${item.current}）`);
  const portfolioMissing = result.gaps.matrix.filter((item) => item.gap > 0).map((item) => `${item.type}（缺 ${item.gap}）`);
  const packagingEvidence = result.inventory.items.filter((item) => /(包装|礼盒|盒|瓶|罐|袋|pack|box|bottle)/i.test(item.name));
  const materialEvidence = result.inventory.items.filter((item) => /(材质|纸|金属|玻璃|塑料|木|material|paper|metal|glass)/i.test(item.name));
  const craftEvidence = result.inventory.items.filter((item) => /(工艺|烫金|压纹|uv|印刷|craft|foil|emboss)/i.test(item.name));
  const currentOf = (pattern) => result.gaps.matrix.filter((item) => pattern.test(item.type)).reduce((sum, item) => sum + item.current, 0);
  const brandChecks = [
    check('品牌识别度', result.brandLock.logo.files.length && result.brandLock.primaryColor ? '有基础' : '待加强', `Logo 候选 ${result.brandLock.logo.files.length} 个；主色${result.brandLock.primaryColor ? `为 ${result.brandLock.primaryColor}` : '待确认'}。`, '用同一 Logo、色彩和核心图形完成三个关键触点测试。'),
    check('Logo 表现', result.brandLock.logo.files.length ? '可评审' : '缺少证据', result.brandLock.logo.files.length ? `已识别：${result.brandLock.logo.files.join('、')}` : '没有可用 Logo 文件。', '检查小尺寸、反白、复杂背景和安全空间。'),
    check('品牌统一性', result.brandLock.primaryColor && result.brandLock.fontTemperament ? '部分建立' : '待建立', `主色、字体气质和核心资产中已有 ${[Boolean(result.brandLock.primaryColor), Boolean(result.brandLock.fontTemperament), result.brandLock.coreVisualAssets.length > 0].filter(Boolean).length}/3 类证据。`, '建立跨包装、VI、海报的统一资产清单与禁用规则。'),
    check('品牌记忆点', result.brandLock.coreVisualAssets.length ? '已发现候选' : '待建立', `核心视觉资产 ${result.brandLock.coreVisualAssets.length} 项。`, '选择一个最具差异性的图形、色彩或构图动作持续重复。')
  ];
  const packagingChecks = [
    check('Hero 图', currentOf(/包装场景|无字海报/) > 0 ? '已有证据' : '缺失', `Hero/场景相关图片 ${currentOf(/包装场景|无字海报/)} 张。`, '完成一张主体明确、尺度有冲击力并保留排版空间的首屏画面。'),
    check('包装结构', result.brandLock.packaging.length ? '已识别候选' : '待确认', result.brandLock.packaging.join('、') || `包装命名证据 ${packagingEvidence.length} 项。`, '补充开合逻辑、正背侧和结构尺寸证据。'),
    check('材质', materialEvidence.length ? '已有线索' : '缺少证据', `材质命名证据 ${materialEvidence.length} 项。`, '明确纸张/容器材质、表面粗糙度、反射和触感。'),
    check('工艺', craftEvidence.length ? '已有线索' : '缺少证据', `工艺命名证据 ${craftEvidence.length} 项。`, '用微距图展示烫印、压纹、UV 或印刷细节，并标注适用范围。'),
    check('包装摄影', currentOf(/包装场景|产品特写/) > 0 ? '已有证据' : '缺失', `场景与特写 ${currentOf(/包装场景|产品特写/)} 张。`, '固定光位、镜头高度和阴影逻辑完成系列摄影。'),
    check('产品展示', currentOf(/包装正面|包装侧面|包装背面|产品特写/) > 0 ? '部分覆盖' : '缺失', `正背侧与特写证据 ${currentOf(/包装正面|包装侧面|包装背面|产品特写/)} 张。`, '补齐单品、组合、结构、细节和使用场景五类展示。')
  ];
  const visualChecks = [
    check('色彩系统', result.brandLock.primaryColor ? '部分建立' : '待确认', `主色 ${result.brandLock.primaryColor || '无'}，辅助色 ${result.brandLock.secondaryColors.length} 个。`, '定义色彩比例、背景适配和可读性规则。'),
    check('字体系统', result.brandLock.fonts.length ? '已有证据' : '待补充', `识别字体 ${result.brandLock.fonts.length} 种。`, '建立标题、正文、注释与数字层级。'),
    check('图形语言', result.brandLock.coreVisualAssets.length ? '已有候选' : '待建立', `核心视觉资产 ${result.brandLock.coreVisualAssets.length} 项。`, '明确图形母题、尺度、组合和禁用方式。'),
    check('留白', currentOf(/海报|社交媒体/) >= 2 ? '可进一步复核' : '证据不足', `传播类画面 ${currentOf(/海报|社交媒体/)} 张，自动分析无法替代人工视觉测量。`, '用固定边距和安全区逐页检查呼吸感。'),
    check('网格', currentOf(/海报|社交媒体/) >= 3 ? '可进一步复核' : '证据不足', '当前仅能依据文件与类型覆盖判断，无法从压缩图片可靠恢复网格。', '标注列数、基线、边距和跨栏规则后做三页压力测试。'),
    check('信息层级', result.brandLock.fonts.length && currentOf(/海报|社交媒体/) ? '部分可评审' : '证据不足', `字体证据 ${result.brandLock.fonts.length} 种，传播画面 ${currentOf(/海报|社交媒体/)} 张。`, '用五秒扫读测试验证主标题、卖点、说明和行动信息的顺序。')
  ];
  const modules = {
    brand: reviewModule(scoreOf('品牌识别'), radar.find((x) => x.dimension === '品牌识别').reason, strengths.filter((x) => /Logo|品牌|色彩/.test(x.strength)), improvements.filter((x) => x.category === 'Brand'), ['把品牌资产写成可验证规则，而不是仅描述气质。'], brandChecks),
    packaging: reviewModule(scoreOf('包装设计'), radar.find((x) => x.dimension === '包装设计').reason, strengths.filter((x) => /图片生产/.test(x.strength)), improvements.filter((x) => x.category === 'Packaging'), ['优先补齐 Hero、正背侧、工艺微距和系列陈列。'], packagingChecks),
    visualSystem: reviewModule(Math.round((scoreOf('版式') + scoreOf('字体') + scoreOf('色彩') + scoreOf('VI')) / 4), '综合色彩、字体、版式和 VI 四项能力评分。', strengths.filter((x) => /色彩/.test(x.strength)), improvements.filter((x) => x.category === 'Visual System'), ['用网格、留白、字体层级和核心图形建立跨触点一致性。'], visualChecks)
  };
  const portfolioCompleteness = scoreOf('作品集表现');
  const benchmarkTraits = result.benchmarks.commonTraits.slice(0, 5);
  const benchmarkGaps = improvements.slice(0, 3).map((item) => `${item.problem}：${item.impact}`);
  const learnTopThree = (benchmarkTraits.length ? benchmarkTraits : ['系统化品牌资产', '一致的包装摄影', '完整的作品集叙事']).slice(0, 3).map((point) => ({
    point,
    why: `优秀案例通过“${point}”把概念转化为可识别、可复用并可展示的设计证据。`,
    action: `选择一个现有页面，按“${point}”重做并与原版并排复盘。`
  }));
  const overallScore = Math.round(radar.reduce((sum, item) => sum + item.score, 0) / radar.length);
  const summary = config.reviewSummary || (overallScore >= 80 ? '项目已形成较完整的视觉系统，下一步应集中强化细节证据与作品集叙事。' : overallScore >= 60 ? '项目方向已建立，但关键资产、系统规范与展示证据仍需按优先级补齐。' : '项目处于基础搭建阶段，应先冻结品牌事实，再补齐核心视觉与展示证据。');
  return {
    overallScore, summary, completion: portfolioCompleteness,
    scoringNote: '评分来自可解析素材、Brand Lock、缺图覆盖和配置证据；它是成长基线，不是审美裁决。人工可在 design-factory.json 的 reviewScores 中覆盖固定维度评分。',
    modules, portfolio: { completeness: portfolioCompleteness, present: portfolioPresent, missing: portfolioMissing, shouldAdd: topGaps.map((item) => `${item.type}：${item.reason}`) },
    benchmark: { commonTraits: benchmarkTraits, gaps: benchmarkGaps, learnTopThree },
    priorities: Object.fromEntries(['P0', 'P1', 'P2'].map((priority) => [priority, improvements.filter((item) => item.priority === priority)])),
    strengths, improvements, radar
  };
}

export function buildActionItems(result, growth) {
  const knowledgeChange = result.knowledgeAnalysis.statistics.new + result.knowledgeAnalysis.statistics.update > 0;
  const promptChange = result.designReview.improvements.some((item) => /构图|摄影/.test(`${item.problem}${item.suggestion}`));
  const repeatedWeakness = growth.historyCount > 0 && growth.trends.some((item) => item.direction === '↓');
  const items = [
    { action: '修改当前项目', selected: result.designReview.improvements.some((item) => item.priority === 'P0'), reason: '存在 P0 时应先修复当前项目；所有修改仍需人工执行。' },
    { action: '更新 Prompt', selected: promptChange, reason: promptChange ? '构图或摄影问题可转化为更明确的生成约束与验收条件。' : '当前问题主要不是 Prompt 表达导致。' },
    { action: '更新 Knowledge', selected: knowledgeChange, reason: knowledgeChange ? 'Knowledge Review 存在 New/Update 候选，需人工审核后决定。' : '本次没有可进入通用知识库的新证据。' },
    { action: '修改系统 Rule', selected: repeatedWeakness, reason: repeatedWeakness ? '历史趋势出现下降项，可人工检查是否需要补充系统级防错规则。' : '尚无跨项目重复证据支持修改系统 Rule。' },
    { action: '修改 Template', selected: false, reason: '当前评审未发现模板结构性缺口；如后续多个项目重复出现同类问题再评估。' },
    { action: '无需修改系统', selected: !knowledgeChange && !repeatedWeakness, reason: !knowledgeChange && !repeatedWeakness ? '当前建议均可在项目层执行，无需改变系统资产。' : '存在待人工审核的系统层候选。' }
  ];
  return items;
}
