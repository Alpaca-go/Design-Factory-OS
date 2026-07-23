import { VISUAL_RULE_CATEGORIES } from './types.js';

const CATEGORY_PATTERNS = Object.freeze([
  ['compositionRules', /构图|版式|网格|留白|对齐|层级|比例|布局|空间关系/iu],
  ['graphicGrammar', /图形|符号|母题|线条|几何|插画|图标|纹样|形态/iu],
  ['colorLogic', /颜色|色彩|主色|辅色|配色|明度|饱和|对比色/iu],
  ['typographyLogic', /字体|字形|字号|字重|排版|标题|文字|信息层级/iu],
  ['materialAndLighting', /材质|材料|肌理|纹理|光线|光影|摄影|反射|透明|触感/iu],
  ['extensionMechanism', /系列|延展|复用|变化|触点|包装|海报|页面|应用|节奏/iu],
  ['visualTemperament', /气质|氛围|节奏|秩序|精密|克制|张力|轻盈|厚重|高级|现代|极简/iu]
]);

const FIELD_CATEGORY = Object.freeze({
  logo: 'graphicGrammar',
  color: 'colorLogic',
  typography: 'typographyLogic',
  graphic_assets: 'graphicGrammar',
  photography: 'materialAndLighting',
  layout: 'compositionRules',
  packaging_structure: 'extensionMechanism',
  reusable_assets: 'extensionMechanism',
  materials: 'materialAndLighting',
  composition: 'compositionRules'
});

const emptyDna = () => Object.fromEntries(VISUAL_RULE_CATEGORIES.map((key) => [key, []]));
const unique = (values) => [...new Set(values.filter(Boolean))];

function leafObservations(value, path = '', out = []) {
  if (typeof value === 'string' && value.trim()) {
    out.push({ path, text: value.trim(), source: path });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => leafObservations(item, `${path}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    const observation = value.observation || value.description || value.visual_description || value.finding;
    if (typeof observation === 'string' && observation.trim()) {
      out.push({
        path,
        text: observation.trim(),
        source: value.source || value.source_file || value.asset_id || value.evidence_id || path,
        confidence: value.confidence
      });
    }
    for (const [key, child] of Object.entries(value)) {
      if ([
        'observation', 'description', 'visual_description', 'finding',
        'source', 'source_file', 'asset_id', 'evidence_id', 'confidence',
        'authorization', 'authorization_status', 'owner'
      ].includes(key)) continue;
      leafObservations(child, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
}

function categoryFor(observation) {
  const topField = observation.path.split(/[.[\]]/u).filter(Boolean).at(-2)
    || observation.path.split(/[.[\]]/u).filter(Boolean)[0];
  if (FIELD_CATEGORY[topField]) return FIELD_CATEGORY[topField];
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(`${observation.path} ${observation.text}`))?.[0]
    || 'visualTemperament';
}

function mechanismFor(category, text) {
  const prefixes = {
    visualTemperament: '通过可重复的节奏、密度和对比关系形成',
    compositionRules: '通过网格、留白与信息区之间的稳定关系组织',
    graphicGrammar: '将可识别形态抽象为可缩放、裁切和组合的图形语法',
    colorLogic: '通过主辅色面积、明度和对比层级控制',
    typographyLogic: '通过标题、正文和注释的字号字重层级组织',
    materialAndLighting: '通过材质表面、光线方向与影像景深共同形成',
    extensionMechanism: '通过母版结构与变量替换在不同触点延展'
  };
  return `${prefixes[category]}“${text.slice(0, 100)}”`;
}

function functionFor(category) {
  return {
    visualTemperament: '建立跨图片稳定的感知气质，而非依赖单个风格词。',
    compositionRules: '建立秩序、阅读路径和系列一致性。',
    graphicGrammar: '形成可识别且可跨触点复用的视觉语言。',
    colorLogic: '建立品牌识别、信息优先级和情绪温度。',
    typographyLogic: '控制阅读效率、信息权重和品牌语气。',
    materialAndLighting: '建立真实感、品质感与主体层次。',
    extensionMechanism: '保证不同载体属于同一系统且不机械重复。'
  }[category];
}

function touchpointsFrom(observations) {
  const catalog = ['包装', '海报', 'VI', '空间', '网站', '页面', '短视频', '手册', '社交媒体', '电商'];
  return catalog.filter((touchpoint) => observations.some((item) => item.text.includes(touchpoint) || item.path.includes(touchpoint)));
}

export function synthesizeReferenceVisualDNA(visualAnalysis = {}) {
  const source = visualAnalysis.visualAssetEvidence || visualAnalysis.referenceVisualAnalysis
    || visualAnalysis.visual_analysis || visualAnalysis;
  const observations = leafObservations(source).filter((item) =>
    !/authorization|owner|weak_assets|replaceable_assets|audit|problem|delete/iu.test(item.path));
  const dna = emptyDna();
  const seen = new Set();
  for (const observation of observations) {
    const category = categoryFor(observation);
    const key = `${category}|${observation.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dna[category].push(Object.freeze({
      name: observation.text.slice(0, 36),
      evidence: Object.freeze(unique([String(observation.source), observation.path]).slice(0, 2)),
      mechanism: mechanismFor(category, observation.text),
      function: functionFor(category),
      confidence: Math.max(0.2, Math.min(1, Number(observation.confidence ?? 0.72)))
    }));
  }
  const assetSources = unique(observations.map((item) => String(item.source)).filter((item) => item && !item.includes('.')));
  const fallbackAssetCount = Number(visualAnalysis.assetCount || visualAnalysis.referenceIdentity?.assetCount || 0);
  const assetCount = Math.max(assetSources.length, fallbackAssetCount);
  const touchpoints = unique([
    ...(visualAnalysis.touchpoints || visualAnalysis.referenceIdentity?.touchpoints || []),
    ...touchpointsFrom(observations)
  ]);
  return Object.freeze({
    observations: Object.freeze(observations),
    referenceIdentity: Object.freeze({
      detectedIndustry: visualAnalysis.detectedIndustry || visualAnalysis.industry,
      touchpoints: Object.freeze(touchpoints),
      assetCount,
      completeness: assetCount < 3 ? 'low' : assetCount < 6 ? 'medium' : 'high',
      consistency: observations.length < 4 ? 'low' : Object.values(dna).filter((items) => items.length).length >= 4 ? 'high' : 'medium',
      missingEvidence: Object.freeze([
        ...(assetCount < 3 ? ['参考图片少于 3 张，稳定规律只能作为低置信度推断。'] : []),
        ...(!touchpoints.length ? ['缺少可识别的实际设计触点。'] : [])
      ])
    }),
    referenceVisualDNA: Object.freeze(Object.fromEntries(
      Object.entries(dna).map(([key, items]) => [key, Object.freeze(items.slice(0, 6))])
    ))
  });
}
