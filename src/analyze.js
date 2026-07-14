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
    '核心品牌资产在包装、空间与数字触点中保持一致',
    '视觉表达由清晰的品牌概念驱动，而不是依赖孤立风格元素',
    '信息层级克制，留白、字体和色彩共同服务于品牌识别',
    '真实材质与使用语境提升可信度，品牌体验能够跨触点成立'
  ];
  return { projectType: typeResult, industry: industryResult, search, cases, commonTraits };
}
