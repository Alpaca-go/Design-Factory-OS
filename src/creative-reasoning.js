import { unique } from './utils.js';

const PENDING = '待确认（需完整查看视觉素材后补充）';

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function strings(value) {
  return unique((Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => clean(item))
    .filter(Boolean));
}

function section(value, fallbackStatement, fallbackEvidence = []) {
  if (typeof value === 'string') return { statement: value.trim(), evidence: strings(fallbackEvidence) };
  return {
    statement: clean(value?.statement || value?.summary || value?.type || value?.direction) || fallbackStatement,
    evidence: strings(value?.evidence || value?.rationale || fallbackEvidence)
  };
}

function inspectionStatus(inventory, config) {
  const inspection = config.visualInspection || {};
  const inspectedImages = strings(inspection.inspectedImages || inspection.files);
  const inspectedImageCount = Math.max(0, Number(inspection.inspectedImageCount) || inspectedImages.length);
  const verified = inspection.verified === true && inventory.imageCount > 0 && inspectedImageCount >= inventory.imageCount;
  return {
    verified,
    inspectedImageCount,
    inspectedImages,
    totalImages: inventory.imageCount,
    findings: strings(inspection.findings || inspection.notes),
    status: verified
      ? `已记录逐张画面核验：${inspectedImageCount}/${inventory.imageCount} 张图片。`
      : `视觉核验未闭环：已记录 ${inspectedImageCount}/${inventory.imageCount} 张；构图、摄影、材质与工艺等信息不得仅凭文件名、OCR、尺寸或元数据补写。`
  };
}

function oldKeywordPrinciples(supplied) {
  if (!Array.isArray(supplied.keywords)) return [];
  return supplied.keywords.map((item) => typeof item === 'string'
    ? item
    : `${clean(item.keyword || item.name) || '待确认'}：${clean(item.reason) || '依据待确认'}`);
}

function dnaValue(value, fallback) {
  return clean(typeof value === 'string' ? value : value?.direction || value?.summary) || fallback;
}

function normalizeRisk(item) {
  return {
    problem: clean(item?.problem) || '待确认的设计风险',
    reason: clean(item?.reason) || '当前视觉证据不足，原因待确认。',
    prevention: clean(item?.prevention || item?.avoid || item?.solution) || '补充视觉证据并由设计负责人确认边界。'
  };
}

function fallbackRisks(inspection, brand) {
  const risks = [];
  if (!inspection.verified) risks.push(normalizeRisk({
    problem: '品牌理解缺少完整逐张视觉核验',
    reason: inspection.status,
    prevention: '完整查看每张图片并记录画面事实后，再冻结 Creative Brief。'
  }));
  if (!brand.logo.files.length) risks.push(normalizeRisk({
    problem: '品牌识别可能被重新发明',
    reason: '当前没有已确认的 Logo 素材。',
    prevention: '在获得授权文件前保留置入区域，不重绘、不猜测标志。'
  }));
  if (!brand.primaryColor) risks.push(normalizeRisk({
    problem: '跨触点色彩容易漂移',
    reason: 'Brand Lock 尚未确认主色。',
    prevention: '先确认主辅色值、比例和背景适配，再扩展视觉系统。'
  }));
  if (brand.packaging.some((item) => /待确认/.test(item))) risks.push(normalizeRisk({
    problem: '包装结构可能被效果图反向发明',
    reason: '现有包装描述包含待确认的结构、材质或用途。',
    prevention: '未确认结构不得进入正式设计；先冻结盒型、尺寸、材质与开合逻辑。'
  }));
  risks.push(normalizeRisk({
    problem: '单个创意表现可能脱离品牌长期资产',
    reason: '摄影、材质和场景变化时，Logo、色彩、排版与情绪容易各自发展。',
    prevention: '所有创意探索均以 Visual DNA 和 Must Keep 为边界，并在跨触点环境中验证。'
  }));
  return risks.slice(0, 5);
}

function inferIdentity(brand, benchmarks, supplied) {
  const oldPosition = section(supplied.positioning, '', []).statement;
  const temperament = section(supplied.temperament, brand.fontTemperament || '', []).statement;
  const essence = temperament && temperament !== PENDING ? temperament : '品牌体验';
  const position = oldPosition ? `它希望以“${oldPosition}”进入受众生活，` : '';
  return `${brand.brandName} 是一个以“${essence}”建立认知与关系的品牌。${position}而不只是“${benchmarks.industry.value}”品类中的产品提供者。`;
}

export function buildCreativeReasoning(inventory, brand, benchmarks, config = {}) {
  const supplied = config.creativeReasoning || config.creativeBrief || {};
  const inspection = inspectionStatus(inventory, config);
  const oldPositioning = supplied.positioning;
  const brandIdentity = section(supplied.brandIdentity, inferIdentity(brand, benchmarks, supplied), inspection.findings.slice(0, 4));
  const brandPositioning = section(supplied.brandPositioning || oldPositioning,
    benchmarks.projectType.value || PENDING,
    [`行业：${benchmarks.industry.value}`, `项目类型：${benchmarks.projectType.value}`, ...inspection.findings.slice(0, 3)]);

  const oldTemperament = section(supplied.temperament, brand.fontTemperament || PENDING, inspection.findings.slice(0, 3));
  const designLanguageInput = supplied.designLanguage || {};
  const keywordPrinciples = oldKeywordPrinciples(supplied);
  const designLanguage = {
    statement: clean(typeof designLanguageInput === 'string' ? designLanguageInput : designLanguageInput.statement || designLanguageInput.summary)
      || oldTemperament.statement,
    rationale: strings(designLanguageInput.rationale || designLanguageInput.evidence || oldTemperament.evidence),
    principles: strings(designLanguageInput.principles || keywordPrinciples)
  };

  const emotionalInput = supplied.emotionalDirection || {};
  const emotionalDirection = {
    statement: clean(typeof emotionalInput === 'string' ? emotionalInput : emotionalInput.statement || emotionalInput.summary)
      || oldTemperament.statement,
    desiredFeelings: strings(emotionalInput.desiredFeelings || emotionalInput.desired || oldTemperament.statement.split(/[、，,；;]/)),
    avoidFeelings: strings(emotionalInput.avoidFeelings || emotionalInput.avoid),
    evidence: strings(emotionalInput.evidence || oldTemperament.evidence)
  };

  const dna = supplied.visualDNA || {};
  const colors = [brand.primaryColor, ...brand.secondaryColors].filter(Boolean);
  const visualDNA = {
    logo: dnaValue(dna.logo, brand.logo.files.length ? `只使用已确认标志文件：${brand.logo.files.join('、')}。` : 'Logo 待确认，不得重绘或猜测。'),
    color: dnaValue(dna.color, colors.length ? `以 ${colors.join('、')} 为已确认色彩锚点，并保持主辅层级。` : PENDING),
    typography: dnaValue(dna.typography, clean(config.brand?.typographyNotes || brand.fontTemperament) || PENDING),
    composition: dnaValue(dna.composition, clean(config.brand?.layoutStyle) || PENDING),
    whitespace: dnaValue(dna.whitespace, clean(config.brand?.whitespaceStyle) || PENDING),
    photography: dnaValue(dna.photography, clean(config.brand?.photographyStyle) || PENDING),
    materials: dnaValue(dna.materials || dna.material, '真实材质及触感关系待视觉与实物证据确认。'),
    packaging: dnaValue(dna.packaging, brand.packaging.length ? `只沿用已确认包装：${brand.packaging.join('、')}。` : '包装结构待确认，不得自行发明。'),
    craft: dnaValue(dna.craft, clean(config.brand?.craftLanguage) || '工艺证据待确认，不得凭效果图推断。')
  };

  const photo = supplied.photographyDirection || supplied.photographyLanguage || {};
  const photographyDirection = {
    lighting: clean(photo.lighting || photo.light) || '光线方向、软硬和色温待逐张视觉确认。',
    framing: clean(photo.framing || photo.composition || photo.lens) || '镜头、机位、景别与主体尺度待逐张视觉确认。',
    depth: clean(photo.depth || photo.depthOfField) || '景深关系应服务主体和品牌情绪，具体方式待确认。',
    materials: clean(photo.materials || photo.material) || visualDNA.materials,
    atmosphere: clean(photo.atmosphere || photo.mood) || `整体氛围应服务“${emotionalDirection.statement}”。`
  };

  const mustKeep = strings(supplied.mustKeep || dna.mustKeep).length
    ? strings(supplied.mustKeep || dna.mustKeep)
    : unique([brand.primaryColor ? `主色 ${brand.primaryColor}` : null, ...brand.coreVisualAssets, ...brand.logo.files.map((file) => `授权 Logo：${file}`)].filter(Boolean));
  const canExplore = strings(supplied.canExplore).length
    ? strings(supplied.canExplore)
    : ['在不改变品牌识别的前提下探索摄影场景与光线', '探索真实材质、空间尺度和触点组合', '探索符合品牌情绪的构图节奏与叙事视角'];
  const designGoal = clean(supplied.designGoal || supplied.creativeDirection)
    || `建立一套能够长期保持“${brandIdentity.statement}”核心认知，并在不同触点中稳定表达的完整品牌视觉体系。`;
  const configuredRisks = Array.isArray(supplied.designRisks) ? supplied.designRisks.map(normalizeRisk) : [];
  const designRisks = configuredRisks.length ? configuredRisks : fallbackRisks(inspection, brand);

  return {
    evidenceStatus: inspection.status,
    visualInspection: inspection,
    brandIdentity,
    brandPositioning,
    designLanguage,
    emotionalDirection,
    visualDNA,
    photographyDirection,
    designRisks,
    mustKeep,
    canExplore,
    designGoal,
    // v3.0 compatibility aliases for callers migrating to the Creative Brief contract.
    positioning: { summary: brandPositioning.statement, evidence: brandPositioning.evidence },
    temperament: { summary: emotionalDirection.statement, evidence: emotionalDirection.evidence },
    photographyLanguage: {
      lighting: photographyDirection.lighting,
      lens: photographyDirection.framing,
      materials: photographyDirection.materials,
      atmosphere: photographyDirection.atmosphere
    },
    creativeDirection: designGoal
  };
}
