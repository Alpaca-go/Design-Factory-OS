import { cleanText, uniqueText } from './markdown-sanitizer.js';

const GENERIC_VISUAL_WORDS = /医疗蓝|生态绿|网格|流线|玻璃|实验室|科技感|高级感|medical blue|grid|flow line|glass/gi;
const CERTIFICATION_ASSET = /(?:展示|生成|绘制|使用).{0,12}(?:GSP|认证|证书|徽章|标识)/i;
const NO_TEXT = /(?:no[- ]?text|无文字|不生成(?:正式品牌)?文字|禁止文字|不得出现文字)/i;
const REQUIRED_TEXT = /(?:可读|文字|数字|标识|标签|10\s*[–—-]\s*25\s*℃|temperature)/i;
const LIMITED_TEXT = /limited[- ]?verified[- ]?text|仅限.{0,8}(?:已确认|核验).{0,8}(?:文字|数字)/i;
const NO_LOGO = /no[- ]?logo|无\s*logo|不(?:得|生成|使用).{0,8}logo/i;
const REQUIRED_LOGO = /(?:展示|出现|使用|放置|包含).{0,8}logo/i;
const VAGUE_TASK_DIFFERENCE = /^(?:(?:承担)?独立(?:验证)?职责|与其他图片不同|避免重复(?:前图|其他图片)?)$/i;
const DIFFERENCE_PROOF = /新增|证明|验证|负责|呈现|表达|关系|事实|信息|价值/i;
const DIFFERENCE_VIEWPOINT = /视角|镜头|构图|景别|角度|场景|透视|细节|特写|全景|俯拍|平视|仰拍/i;
const DIFFERENCE_NON_REPEAT = /避免|不得|不与|区别|区分|不重复|重复/i;
const NEGATION = /不得|禁止|不可|不要|避免|不生成|不展示|不出现|no\b|without|do not|don't|never/i;
const POSITIVE_REQUIREMENT = /必须|需要|要求|展示|生成|绘制|使用|放置|包含|呈现|\b(?:show|display|include|render|use)\b/i;
const CERTIFICATION_MARK = /GSP.{0,16}(?:认证|证书|徽章|标识|mark|badge|certificate)|认证(?:证书|徽章|标识)|certification badge|certificate seal|certified badge/i;

function positivelyRequires(text, target) {
  return cleanText(text)
    .split(/[。；;.!?\n]+/)
    .some((sentence) =>
      target.test(sentence)
      && POSITIVE_REQUIREMENT.test(sentence)
      && !NEGATION.test(sentence)
    );
}

function containsUnnegated(text, target) {
  return cleanText(text)
    .split(/[。；;.!?\n]+/)
    .some((sentence) => target.test(sentence) && !NEGATION.test(sentence));
}

function bigrams(value) {
  const normalized = cleanText(value).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  return new Set([...normalized].slice(0, -1).map((character, index) => `${character}${normalized[index + 1]}`));
}

function similarity(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((item) => b.has(item)).length;
  return overlap / new Set([...a, ...b]).size;
}

export function validateGeneDistinctiveness(genes = []) {
  const functional = genes.find((gene) => String(gene.type).toLowerCase() === 'functional');
  const capability = genes.find((gene) => String(gene.type).toLowerCase() === 'capability');
  if (!functional || !capability) return [];
  const score = similarity(functional.statement, capability.statement);
  return score >= 0.55
    ? [{
        code: 'GENE_FUNCTION_CAPABILITY_OVERLAP',
        severity: 'major',
        message: '功能基因与能力基因表述高度重叠，应分别回答“用户获得什么”和“品牌凭什么交付”。'
      }]
    : [];
}

export function validateTextPolicyConsistency(task, index) {
  const findings = [];
  const textPolicy = cleanText(task?.textPolicy);
  const required = uniqueText(task?.requiredElements || []).join('；');
  const allowedText = uniqueText(task?.allowedText || []).join('；');
  const prompt = cleanText(task?.finalPrompt || task?.prompt);
  if (
    NO_TEXT.test(textPolicy)
    && (
      REQUIRED_TEXT.test(required)
      || allowedText
      || containsUnnegated(prompt, REQUIRED_TEXT)
    )
  ) {
    findings.push({
      code: 'TEXT_POLICY_CONFLICT',
      severity: 'hard',
      message: `图片任务 ${index + 1} 的无文字政策与必须文字或数字要求冲突。`
    });
  }
  if (LIMITED_TEXT.test(textPolicy) && !allowedText) {
    findings.push({
      code: 'ALLOWED_TEXT_MISSING',
      severity: 'hard',
      message: `图片任务 ${index + 1} 使用有限核验文字模式，但没有列出 allowedText。`
    });
  }
  const logoPolicy = cleanText(task?.logoPolicy);
  if (
    NO_LOGO.test(logoPolicy)
    && (
      REQUIRED_LOGO.test(required)
      || positivelyRequires(prompt, /logo/i)
    )
  ) {
    findings.push({
      code: 'LOGO_POLICY_CONFLICT',
      severity: 'hard',
      message: `图片任务 ${index + 1} 的 Logo Policy 与必须元素或 Prompt 冲突。`
    });
  }
  const difference = uniqueText(task?.intentionalDifferenceFromPreviousTasks || []).join('；');
  if (
    index > 0
    && (
      !difference
      || VAGUE_TASK_DIFFERENCE.test(difference)
      || !DIFFERENCE_PROOF.test(difference)
      || !DIFFERENCE_VIEWPOINT.test(difference)
      || !DIFFERENCE_NON_REPEAT.test(difference)
    )
  ) {
    findings.push({
      code: 'TASK_DIFFERENCE_VAGUE',
      severity: 'major',
      message: `图片任务 ${index + 1} 必须同时说明新增证明、不同视角和避免重复项。`
    });
  }
  return findings;
}

export function validateVisualTechnicalParameters(task, index, boundaries = {}) {
  const findings = [];
  const prompt = cleanText(task?.finalPrompt || task?.prompt);
  const lighting = `${cleanText(task?.lighting)} ${prompt}`;
  if (/(?:低于|under|below)\s*3000\s*k.{0,12}(?:冷|cool|cold)/i.test(lighting)) {
    findings.push({
      code: 'COLOR_TEMPERATURE_INCORRECT',
      severity: 'hard',
      message: `图片任务 ${index + 1} 错误地把低色温描述为冷光。`
    });
  }
  if (/无阴影|no shadows?/i.test(lighting) && /强烈|戏剧性|dramatic|hard shadows?/i.test(lighting)) {
    findings.push({
      code: 'LIGHTING_CONTRADICTION',
      severity: 'hard',
      message: `图片任务 ${index + 1} 同时要求无阴影和强戏剧性阴影。`
    });
  }
  const prohibited = uniqueText(boundaries.prohibitedElements || []).join('；');
  if (/黑金/.test(prohibited) && containsUnnegated(`${task?.materialAndTexture || ''} ${prompt}`, /黑金|black gold/i)) {
    findings.push({
      code: 'MATERIAL_POLICY_CONFLICT',
      severity: 'hard',
      message: `图片任务 ${index + 1} 的黑金材质与全局禁止项冲突。`
    });
  }
  if (containsUnnegated(prompt, /医生手术|手术过程|术前术后|before.?and.?after|surgical procedure/i)) {
    findings.push({
      code: 'MEDICAL_COMPLIANCE_CONFLICT',
      severity: 'hard',
      message: `图片任务 ${index + 1} 包含禁止的医疗手术或术前术后场景。`
    });
  }
  const allProhibitions = uniqueText([
    ...(boundaries.prohibitedElements || []),
    ...(boundaries.prohibitedClaims || [])
  ]).join('；');
  if (
    !uniqueText(boundaries.lockedAssets || []).some((item) => /GSP|认证|证书|徽章|标识/i.test(item))
    && positivelyRequires(prompt, CERTIFICATION_MARK)
  ) {
    findings.push({
      code: 'CERTIFICATION_PROMPT_CONFLICT',
      severity: 'hard',
      message: `图片任务 ${index + 1} 要求生成未提供的认证资产。`
    });
  }
  if (
    /疗效|功效|未证实/i.test(allProhibitions)
    && positivelyRequires(prompt, /疗效|功效|治疗效果|治愈|efficacy|treatment result|cure/i)
  ) {
    findings.push({
      code: 'UNVERIFIED_EFFICACY_CONFLICT',
      severity: 'hard',
      message: `图片任务 ${index + 1} 要求表现未证实的疗效或功效。`
    });
  }
  if (
    /不是.{0,8}医疗机构|不得.{0,12}医疗机构|B2B/i.test(allProhibitions)
    && positivelyRequires(prompt, /医疗机构|医院|诊所|clinic|hospital|medical institution/i)
  ) {
    findings.push({
      code: 'BUSINESS_IDENTITY_CONFLICT',
      severity: 'hard',
      message: `图片任务 ${index + 1} 把平台业务表现成了医疗机构。`
    });
  }
  return findings;
}

export function validateCreativeThesisCoverage(coverage) {
  if (!coverage || typeof coverage !== 'object') return [];
  const weakDimensions = ['capability', 'relationship', 'emotion', 'differentiation']
    .filter((key) => !Number.isFinite(Number(coverage[key])) || Number(coverage[key]) < 3);
  return weakDimensions.length
    ? [{
        code: 'CREATIVE_THESIS_COVERAGE_WEAK',
        severity: 'major',
        message: `创意命题未充分覆盖：${weakDimensions.join('、')}。`
      }]
    : [];
}

export function runContentQualityPass({
  identity,
  genes,
  creativeThesis,
  visualSystem,
  boundaries,
  tasks,
  mappings
}) {
  const findings = [...validateGeneDistinctiveness(genes)];
  if (identity.projectName === '待确认' || /品牌\s*DNA|分析报告|策划案/i.test(identity.projectName)) {
    findings.push({ code: 'PROJECT_IDENTITY_UNCERTAIN', severity: 'hard', message: '项目名称仍包含任务词或无法确认。' });
  }
  const geneIds = new Set(genes.map((gene) => gene.id));
  if ((mappings || []).some((mapping) => !geneIds.has(mapping.dnaGeneId))) {
    findings.push({ code: 'GENE_ID_UNDEFINED', severity: 'hard', message: '视觉映射引用了未定义的 Gene ID。' });
  }
  if ((tasks || []).some((task) => (task.brandDnaBasis || []).some((id) => !geneIds.has(id)))) {
    findings.push({ code: 'TASK_GENE_ID_UNDEFINED', severity: 'hard', message: '图片任务引用了未定义的 Gene ID。' });
  }
  findings.push(...validateCreativeThesisCoverage(creativeThesis?.coverage));
  const assets = uniqueText(visualSystem.distinctiveAssets || []);
  if (!assets.length || assets.every((asset) => !cleanText(asset).replace(GENERIC_VISUAL_WORDS, '').trim())) {
    findings.push({ code: 'DISTINCTIVE_ASSET_MISSING', severity: 'major', message: '视觉系统尚未形成可追溯的品牌专属视觉资产机制。' });
  }
  if (!boundaries.lockedAssets.length && !boundaries.prohibitedElements.some((item) => /Logo/i.test(item))) {
    findings.push({ code: 'LOGO_POLICY_UNSAFE', severity: 'hard', message: '未提供已批准 Logo 时，必须明确禁止模型自行设计或伪造 Logo。' });
  }
  if (boundaries.prohibitedElements.some((item) =>
    CERTIFICATION_ASSET.test(item) && !/(?:不得|禁止|不可|避免)/.test(item)
  )) {
    findings.push({ code: 'CERTIFICATION_POLICY_CONFLICT', severity: 'hard', message: '认证边界存在要求生成认证资产的风险。' });
  }
  tasks.forEach((task, index) => findings.push(
    ...validateTextPolicyConsistency(task, index),
    ...validateVisualTechnicalParameters(task, index, boundaries)
  ));
  return findings;
}
