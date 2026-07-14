import path from 'node:path';
import { decodeEntities, normalizeHex, unique } from './utils.js';

const INDUSTRIES = [
  ['美妆个护', ['美妆', '护肤', '面膜', '精华', '香水', 'beauty', 'cosmetic', 'skincare']],
  ['食品饮料', ['食品', '饮料', '茶', '咖啡', '烘焙', '零食', '酒', 'food', 'coffee', 'tea']],
  ['文创生活', ['文创', '工坊', '手作', '礼品', '家居', '生活方式', 'craft', 'studio']],
  ['文化旅游', ['文旅', '旅游', '景区', '城市', '博物馆', '非遗', '文化', 'tourism']],
  ['餐饮', ['餐厅', '餐饮', '火锅', '小吃', '料理', 'restaurant']],
  ['科技互联网', ['科技', '软件', '平台', '智能', 'ai', 'app', 'saas', 'tech']],
  ['服饰时尚', ['服装', '服饰', '时尚', '鞋', '包', 'fashion']],
  ['教育', ['教育', '学校', '课程', '学院', 'education']]
];

const TYPE_KEYWORDS = [
  ['品牌视觉升级', ['升级', '焕新', 'rebrand']], ['包装设计', ['包装', '礼盒', '瓶', '罐', '盒型']],
  ['品牌全案', ['品牌', 'vi', 'logo', '视觉识别']], ['营销视觉', ['海报', '活动', 'campaign', '营销']]
];

const IMAGE_TYPES = [
  ['logo', ['logo', '标志', '标识']], ['包装正面', ['包装正面', '正面', 'front']],
  ['包装侧面', ['包装侧面', '侧面', 'side']], ['包装背面', ['包装背面', '背面', 'back']],
  ['包装场景', ['包装场景', '场景', 'scene', 'mockup']], ['产品特写', ['特写', 'detail', 'closeup']],
  ['品牌标准字', ['标准字', 'wordmark']], ['色彩规范', ['色彩', '颜色', 'color']],
  ['字体规范', ['字体', 'font', 'typography']], ['图形纹样', ['图形', '纹样', 'pattern']],
  ['图标系统', ['图标', 'icon']], ['无字海报', ['无字', '海报', 'poster']],
  ['社交媒体', ['社交', 'social', '小红书', '公众号']], ['延展物料', ['名片', '手提袋', '物料', '周边']]
];

const BENCHMARK_LIBRARY = {
  '美妆个护': [
    { name: 'Aesop', url: 'https://www.aesop.com/', reason: '克制的信息层级与高一致性包装系统' },
    { name: 'Glossier', url: 'https://www.glossier.com/', reason: '产品特写、人物场景与社交传播协同' },
    { name: 'Fenty Beauty', url: 'https://fentybeauty.com/', reason: '包容性人物表达与高辨识度产品阵列' }
  ],
  '食品饮料': [
    { name: 'Oatly', url: 'https://www.oatly.com/', reason: '包装即媒介，语气与插画系统统一' },
    { name: 'Blue Bottle Coffee', url: 'https://bluebottlecoffee.com/', reason: '极简品牌资产与高品质产品摄影' },
    { name: 'Noma Projects', url: 'https://nomaprojects.com/', reason: '编辑感内容与实验性食品包装' }
  ],
  '文创生活': [
    { name: 'MUJI', url: 'https://www.muji.com/', reason: '克制系统、材质表达与生活场景一致' },
    { name: 'HAY', url: 'https://www.hay.com/', reason: '高饱和色彩与现代家居场景组合' },
    { name: 'Kinfolk', url: 'https://www.kinfolk.com/', reason: '编辑式构图与安静的人文气质' }
  ],
  '文化旅游': [
    { name: 'Visit Copenhagen', url: 'https://www.visitcopenhagen.com/', reason: '城市内容分类与在地体验叙事' },
    { name: 'Japan National Tourism Organization', url: 'https://www.japan.travel/', reason: '主题化目的地图片与清晰旅程入口' },
    { name: 'The Met', url: 'https://www.metmuseum.org/', reason: '文化资产的现代编辑与数字延展' }
  ],
  default: [
    { name: 'Pentagram', url: 'https://www.pentagram.com/work', reason: '跨行业品牌系统与案例呈现完整' },
    { name: 'Landor', url: 'https://landor.com/', reason: '品牌策略到触点落地的系统性' },
    { name: 'Collins', url: 'https://www.wearecollins.com/', reason: '鲜明概念驱动的动态品牌表达' }
  ]
};

function allText(inventory) {
  return inventory.items.map((x) => `${x.path} ${x.detail?.text || ''} ${JSON.stringify(x.detail?.metadata || {})}`).join(' ').toLowerCase();
}

function detectByKeywords(text, candidates, fallback) {
  let best = { value: fallback, score: 0, evidence: [] };
  for (const [value, keywords] of candidates) {
    const hits = keywords.filter((word) => text.includes(word.toLowerCase()));
    if (hits.length > best.score) best = { value, score: hits.length, evidence: hits };
  }
  return best;
}

function nameFromFiles(inventory) {
  const titles = inventory.items.map((x) => x.detail?.metadata?.title).filter(Boolean);
  if (titles.length) return titles[0].split(/[-_|]/)[0].trim();
  const base = path.basename(inventory.root).replace(/[-_](素材|资料|项目|design|brand).*$/i, '').trim();
  return base || '未命名品牌';
}

function extractColors(inventory, configured = []) {
  const colors = configured.map(normalizeHex).filter(Boolean);
  for (const item of inventory.items) colors.push(...(item.detail?.colors || []).map(normalizeHex).filter(Boolean));
  const counts = new Map();
  for (const color of colors) {
    if (['#FFFFFF', '#000000'].includes(color) && colors.length > 2) continue;
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color);
}

export function buildBrandLock(inventory, config = {}) {
  const text = allText(inventory);
  const name = config.brand?.name || config.projectName || nameFromFiles(inventory);
  const logos = unique([...(config.brand?.logoFiles || []), ...inventory.items.filter((x) => /(logo|标志|标识|品牌标)/i.test(x.name)).map((x) => x.path)]);
  const extractedColors = extractColors(inventory, [config.brand?.primaryColor, ...(config.brand?.secondaryColors || [])]);
  const industry = config.industry || detectByKeywords(`${name} ${text}`, INDUSTRIES, '综合/待确认').value;
  const temperament = config.brand?.fontTemperament || ({
    '美妆个护': '精致、克制、现代', '食品饮料': '亲和、自然、易读', '文创生活': '人文、温暖、有手作感',
    '文化旅游': '文化感、开放、具叙事性', '科技互联网': '理性、清晰、现代'
  }[industry] || '现代、清晰、具品牌识别度');
  const packages = unique(inventory.items.filter((x) => /(包装|礼盒|盒型|瓶|罐|袋|box|bottle|pack)/i.test(x.name)).map((x) => {
    const match = x.name.match(/(天地盖|抽屉盒|翻盖盒|书型盒|瓶装|罐装|袋装|礼盒|包装盒)/);
    return match?.[1] || '盒/容器形态待确认';
  }));
  const assets = unique(inventory.items.filter((x) => /(纹样|插画|摄影|图形|icon|图标|pattern|illustration|mascot|吉祥物)/i.test(x.name)).map((x) => x.path));
  const configuredPrimary = normalizeHex(config.brand?.primaryColor);
  return {
    brandName: name,
    logo: { files: logos, status: logos.length ? '已识别候选' : '缺失/待提供', confidence: logos.length ? '高' : '低' },
    primaryColor: configuredPrimary || extractedColors[0] || null,
    secondaryColors: unique((config.brand?.secondaryColors || []).map(normalizeHex).concat(extractedColors.filter((x) => x !== (configuredPrimary || extractedColors[0])))).slice(0, 5),
    fontTemperament: temperament,
    fonts: unique([...(config.brand?.fonts || []), ...inventory.items.flatMap((x) => x.detail?.fonts || [])]).slice(0, 8),
    packaging: unique([...(config.brand?.packaging || []), ...packages]),
    coreVisualAssets: unique([...(config.brand?.coreVisualAssets || []), ...assets]).slice(0, 12),
    source: config.brand ? '项目配置 + 素材识别' : '素材启发式识别',
    notes: [
      !configuredPrimary && !extractedColors.length ? '未从可解析素材中取得可靠色值，需人工确认主色。' : null,
      !logos.length ? '未找到文件名含 Logo/标志/标识的素材。' : null,
      !packages.length ? '未从文件名识别到明确包装盒型。' : null
    ].filter(Boolean)
  };
}

async function onlineBenchmarks(query) {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'user-agent': 'Mozilla/5.0 Design-Factory-OS/1.0' }, signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`搜索服务返回 HTTP ${response.status}`);
  const html = await response.text();
  return [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 5).map((m) => ({
    name: decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim(), url: decodeEntities(m[1]), reason: '联网检索到的相关优秀案例候选，建议人工复核'
  }));
}

export async function analyzeBenchmarks(inventory, brandLock, config = {}, options = {}) {
  const text = `${brandLock.brandName} ${allText(inventory)}`;
  const industryResult = config.industry
    ? { value: config.industry, score: 99, evidence: ['项目配置'] }
    : detectByKeywords(text, INDUSTRIES, '综合/待确认');
  const typeResult = config.projectType
    ? { value: config.projectType, score: 99, evidence: ['项目配置'] }
    : detectByKeywords(text, TYPE_KEYWORDS, '品牌视觉优化');
  let cases = (config.benchmarks || []).map((x) => typeof x === 'string' ? { name: x, url: '', reason: '项目指定案例' } : x);
  const verifiedResearch = config.benchmarkResearch?.verified === true;
  let search = verifiedResearch
    ? { enabled: true, status: config.benchmarkResearch.status || `已通过外部联网检索核验 ${cases.length} 个案例`, query: config.benchmarkResearch.query || null, verifiedAt: config.benchmarkResearch.verifiedAt || null }
    : { enabled: Boolean(options.online), status: '未启用（使用内置策展案例库）', query: null };
  if (options.online && !verifiedResearch) {
    search.query = `${industryResult.value} ${typeResult.value} 优秀品牌设计案例`;
    try {
      const found = await onlineBenchmarks(search.query);
      cases = [...cases, ...found];
      search.status = `成功，取得 ${found.length} 个候选`;
    } catch (error) { search.status = `失败，已回退内置案例库：${error.message}`; }
  }
  const library = BENCHMARK_LIBRARY[industryResult.value] || BENCHMARK_LIBRARY.default;
  for (const item of library) {
    if (cases.length >= 3) break;
    if (!cases.some((x) => x.name === item.name)) cases.push(item);
  }
  cases = cases.slice(0, Math.max(3, config.benchmarkLimit || 5));
  const commonTraits = config.commonTraits?.length ? config.commonTraits : [
    '核心品牌资产在包装、海报与数字触点中保持一致',
    '用成组的产品图、场景图与细节图建立完整叙事',
    '信息层级克制，留白、字体和色彩服务于识别而非装饰',
    '真实材质与使用场景提升可信度，避免纯效果图堆叠'
  ];
  return { projectType: typeResult, industry: industryResult, search, cases, commonTraits };
}

function classifyExistingImages(inventory) {
  const counts = Object.fromEntries(IMAGE_TYPES.map(([type]) => [type, 0]));
  const evidence = Object.fromEntries(IMAGE_TYPES.map(([type]) => [type, []]));
  for (const item of inventory.items.filter((x) => x.isImage)) {
    let hit = false;
    for (const [type, words] of IMAGE_TYPES) {
      if (words.some((word) => item.path.toLowerCase().includes(word.toLowerCase()))) {
        counts[type]++; evidence[type].push(item.path); hit = true;
      }
    }
    if (!hit) { counts['延展物料']++; evidence['延展物料'].push(item.path); }
  }
  return { counts, evidence };
}

export function buildGapAnalysis(inventory, benchmarks, config = {}) {
  const existing = classifyExistingImages(inventory);
  for (const [type, count] of Object.entries(config.existingImageTypes || {})) {
    existing.counts[type] = Math.max(0, Number(count) || 0);
  }
  for (const [type, evidence] of Object.entries(config.existingImageEvidence || {})) {
    existing.evidence[type] = Array.isArray(evidence) ? evidence : [String(evidence)];
  }
  const benchmarkNeeds = config.imageTargets || {
    'logo': 1, '包装正面': 1, '包装侧面': 1, '包装背面': 1, '包装场景': 3, '产品特写': 2,
    '品牌标准字': 1, '色彩规范': 1, '字体规范': 1, '图形纹样': 2, '图标系统': 1,
    '无字海报': 4, '社交媒体': 3, '延展物料': 2
  };
  const matrix = Object.entries(benchmarkNeeds).map(([type, target]) => {
    const current = existing.counts[type] || 0;
    const gap = Math.max(0, target - current);
    const impact = ['包装场景', '产品特写', '无字海报', '包装正面'].includes(type) ? 3 : ['图形纹样', '色彩规范', '字体规范'].includes(type) ? 2 : 1;
    return { type, current, target, gap, priorityScore: gap * impact, evidence: existing.evidence[type] || [] };
  }).sort((a, b) => b.priorityScore - a.priorityScore || b.gap - a.gap || a.type.localeCompare(b.type, 'zh-CN'));
  const topThree = matrix.filter((x) => x.gap > 0).slice(0, 3).map((x, index) => ({ rank: index + 1, type: x.type, reason: `当前 ${x.current} 张，对标建议 ${x.target} 张；补齐后可显著改善${x.type.includes('包装') ? '产品可信度与商业呈现' : x.type.includes('海报') ? '传播延展能力' : '品牌叙事完整度'}。` }));
  while (topThree.length < 3) topThree.push({ rank: topThree.length + 1, type: ['包装场景', '产品特写', '无字海报'][topThree.length], reason: '作为视觉系统的基础补充项，建议创建不同构图版本。' });
  return { existing, benchmarkNeeds, matrix, topThree, benchmarkCaseCount: benchmarks.cases.length };
}

function task(id, category, title, objective, scene, ratio = '4:5') {
  return { id, category, title, objective, scene, ratio, mustHave: [], avoid: ['未经 Brand Lock 允许的新 Logo', '不可读的伪文字', '破坏主辅色关系的高饱和杂色'], acceptance: ['主体清晰且构图完整', '品牌气质、材质与色彩符合 Brand Lock', '无水印、无错别字、无畸变', `可按 ${ratio} 安全裁切`] };
}

export function buildImagePlan(gaps, brandLock, config = {}) {
  const top = gaps.topThree;
  const cards = [
    task('GAP-01', '重点缺图', `${top[0].type}补充图`, top[0].reason, '以最能体现品牌价值的主场景补齐关键叙事'),
    task('GAP-02', '重点缺图', `${top[1].type}补充图`, top[1].reason, '建立与主图差异明显的第二视觉视角'),
    task('GAP-03', '重点缺图', `${top[2].type}补充图`, top[2].reason, '补充适合社交传播的强记忆点画面'),
    task('PKG-01', '包装', '包装标准正面', '清楚呈现包装结构、品牌识别与产品名区域', '中性背景，正面平视，商业产品摄影'),
    task('PKG-02', '包装', '包装三分之四视角', '呈现盒型厚度、侧面信息与材质', '轻微俯拍，柔和侧光，保留自然投影'),
    task('PKG-03', '包装', '包装使用场景', '把产品放入真实使用语境，提升购买想象', '符合目标人群的真实桌面或生活环境'),
    task('VI-01', 'VI', 'Logo 与安全空间', '展示标志的正确比例和留白原则', '干净平面系统展示', '16:9'),
    task('VI-02', 'VI', '品牌色彩与材质', '建立主色、辅助色与物理材质的关系', '色卡、纸张、印刷或表面工艺组合', '16:9'),
    task('VI-03', 'VI', '核心图形延展', '验证核心视觉资产可形成可扩展系统', '图形在卡片、包装与数字界面上的组合', '16:9'),
    task('POS-01', '无字海报', '品牌主视觉海报', '形成第一张具有强识别度的封面画面', '英雄式主体、充足留白、无文字'),
    task('POS-02', '无字海报', '产品细节海报', '用微距细节表达品质和材质', '近景或微距，强调纹理、光泽与工艺'),
    task('POS-03', '无字海报', '情绪场景海报', '传达品牌世界观与目标用户情绪', '叙事化环境、自然动作、电影感光线'),
    task('POS-04', '无字海报', '系列陈列海报', '展示系统感并适配活动传播', '多个产品或物料有节奏地成组陈列')
  ];
  for (const card of cards) {
    card.brandConstraints = {
      brandName: brandLock.brandName, primaryColor: brandLock.primaryColor || '待确认',
      secondaryColors: brandLock.secondaryColors, temperament: brandLock.fontTemperament,
      packaging: brandLock.packaging
    };
    card.mustHave = ['主体与品牌资产关系明确', brandLock.primaryColor ? `主色 ${brandLock.primaryColor} 得到合理体现` : '使用经人工确认的品牌主色', '为后续排版保留安全留白'];
    const override = config.imagePlanOverrides?.[card.id];
    if (override) {
      for (const key of ['title', 'objective', 'scene', 'ratio']) {
        if (typeof override[key] === 'string' && override[key].trim()) card[key] = override[key].trim();
      }
      for (const key of ['mustHave', 'avoid', 'acceptance']) {
        if (Array.isArray(override[key]) && override[key].length) card[key] = override[key].map(String);
      }
    }
  }
  return { count: cards.length, sequenceRule: '先补关键叙事，再确认包装形态与 VI 系统，最后扩展传播海报。', cards };
}

export function buildPriorities(brandLock, gaps) {
  const p0 = [
    ...(!brandLock.primaryColor ? ['人工确认主色与可用色值'] : []),
    ...(brandLock.logo.files.length === 0 ? ['补充可用的矢量 Logo 文件'] : []),
    ...gaps.topThree.map((x) => `制作：${x.type}`)
  ];
  return {
    P0: unique(p0).slice(0, 5),
    P1: ['统一包装各视角的光线、比例与材质表现', '建立标准字、色彩、字体和核心图形的 VI 展示', '形成四张无字传播海报系列'],
    P2: ['扩展社交媒体尺寸与动态版本', '建立可复用的摄影和生图提示词资产库', '按季度复盘对标案例与品牌资产使用情况']
  };
}
