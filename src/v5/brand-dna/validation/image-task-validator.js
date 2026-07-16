export const GPT_IMAGE_TASK_ROLES = Object.freeze([
  'anchor-image',
  'brand-poster',
  'product-or-service-scene',
  'packaging-concept',
  'visual-system',
  'application-scene',
  'detail-craft',
  'custom'
]);

export class StructuredValidationError extends Error {
  constructor(message, jsonPathOrPaths, code = 'SCHEMA_VALIDATION_FAILED') {
    super(message);
    this.name = 'StructuredValidationError';
    this.code = code;
    this.jsonPaths = [
      ...new Set(
        (Array.isArray(jsonPathOrPaths) ? jsonPathOrPaths : [jsonPathOrPaths])
          .filter(Boolean)
          .map(String)
      )
    ];
    this.jsonPath = this.jsonPaths[0] || null;
  }
}

function fail(message, jsonPath) {
  throw new StructuredValidationError(message, jsonPath);
}

function requireArray(value, jsonPath, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) {
    fail(`${jsonPath} 必须至少包含 ${minimum} 项。`, jsonPath);
  }
  return value;
}

function requireString(value, jsonPath) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${jsonPath} 不能为空。`, jsonPath);
  }
  return value.trim();
}

function require(condition, message, jsonPath) {
  if (!condition) fail(message, jsonPath);
}

const NO_TEXT_POLICY = /(?:^|\b)no[- ]?text(?:\b|$)|无文字|不生成(?:正式品牌)?文字|禁止文字|不得出现文字/i;
const REQUIRES_READABLE_TEXT = /可读|文字|数字|标签|标识|10\s*[–—-]\s*25\s*℃|temperature/i;
const NO_LOGO_POLICY = /no[- ]?logo|无\s*logo|不(?:得|生成|使用).{0,8}logo/i;
const REQUIRES_LOGO = /(?:展示|出现|使用|放置|包含).{0,8}logo/i;
const LIMITED_TEXT_POLICY = /limited[- ]?verified[- ]?text|仅限.{0,8}(?:已确认|核验).{0,8}(?:文字|数字)/i;
const VAGUE_DIFFERENCE = /^(?:(?:承担)?独立(?:验证)?职责|与其他图片不同|避免重复(?:前图|其他图片)?)$/i;
const DIFFERENCE_PROOF = /新增|证明|验证|负责|呈现|表达|关系|事实|信息|价值/i;
const DIFFERENCE_VIEWPOINT = /视角|镜头|构图|景别|角度|场景|透视|细节|特写|全景|俯拍|平视|仰拍/i;
const DIFFERENCE_NON_REPEAT = /避免|不得|不与|区别|区分|不重复|重复/i;
const NEGATION = /不得|禁止|不可|不要|避免|不生成|不展示|不出现|no\b|without|do not|don't|never/i;
const POSITIVE_REQUIREMENT = /必须|需要|要求|展示|生成|绘制|使用|放置|包含|呈现|\b(?:show|display|include|render|use)\b/i;
const CERTIFICATION_MARK = /GSP.{0,16}(?:认证|证书|徽章|标识|mark|badge|certificate)|认证(?:证书|徽章|标识)|certification badge|certificate seal|certified badge/i;

function positivelyRequires(text, target) {
  return String(text || '')
    .split(/[。；;.!?\n]+/)
    .some((sentence) =>
      target.test(sentence)
      && POSITIVE_REQUIREMENT.test(sentence)
      && !NEGATION.test(sentence)
    );
}

function containsUnnegated(text, target) {
  return String(text || '')
    .split(/[。；;.!?\n]+/)
    .some((sentence) => target.test(sentence) && !NEGATION.test(sentence));
}

function crossFieldProblems(task, index, imageSystem) {
  const base = `imageTasks[${index}]`;
  const required = Array.isArray(task.requiredElements) ? task.requiredElements.join('；') : '';
  const allowedText = Array.isArray(task.allowedText) ? task.allowedText.join('；') : '';
  const prompt = String(task.finalPrompt || '');
  const problems = [];
  if (
    NO_TEXT_POLICY.test(task.textPolicy)
    && (REQUIRES_READABLE_TEXT.test(required) || allowedText || (
      REQUIRES_READABLE_TEXT.test(prompt)
      && !/(?:no|without).{0,12}(?:text|number|label)|不(?:生成|得出现).{0,12}(?:文字|数字|标签)|无文字/i.test(prompt)
    ))
  ) {
    problems.push({
      path: `${base}.textPolicy`,
      message: `${base}.textPolicy 与必须文字、数字或 allowedText 冲突`
    });
  }
  if (LIMITED_TEXT_POLICY.test(task.textPolicy) && !allowedText) {
    problems.push({
      path: `${base}.allowedText`,
      message: `${base}.allowedText 在 limited-verified-text 模式下必须列出允许文字`
    });
  }
  if (
    NO_LOGO_POLICY.test(task.logoPolicy)
    && (REQUIRES_LOGO.test(required) || (
      REQUIRES_LOGO.test(prompt)
      && !/(?:no|without|do not|don't).{0,12}logo|不(?:生成|得|使用).{0,12}logo|无\s*logo/i.test(prompt)
    ))
  ) {
    problems.push({
      path: `${base}.logoPolicy`,
      message: `${base}.logoPolicy 与 Logo 必须元素或 finalPrompt 冲突`
    });
  }
  const lighting = `${task.lighting || ''} ${prompt}`;
  if (/无阴影|no shadows?/i.test(lighting) && /强烈|戏剧性|dramatic|hard shadows?/i.test(lighting)) {
    problems.push({
      path: `${base}.lighting`,
      message: `${base}.lighting 同时要求无阴影与强戏剧性阴影`
    });
  }
  if (/(?:低于|under|below)\s*3000\s*k.{0,12}(?:冷|cool|cold)/i.test(lighting)) {
    problems.push({
      path: `${base}.lighting`,
      message: `${base}.lighting 错误地把低色温描述为冷光`
    });
  }
  const prohibitions = Array.isArray(imageSystem?.globalProhibitions)
    ? imageSystem.globalProhibitions.join('；')
    : '';
  if (/黑金/.test(prohibitions) && containsUnnegated(`${task.materialAndTexture || ''} ${prompt}`, /黑金|black gold/i)) {
    problems.push({
      path: `${base}.materialAndTexture`,
      message: `${base}.materialAndTexture 与全局黑金风格禁令冲突`
    });
  }
  if (containsUnnegated(prompt, /医生手术|手术过程|术前术后|before.?and.?after|surgical procedure/i)) {
    problems.push({
      path: `${base}.finalPrompt`,
      message: `${base}.finalPrompt 包含禁止的医疗手术或术前术后场景`
    });
  }
  const approvedAssets = [
    ...(Array.isArray(imageSystem?.knownAssets) ? imageSystem.knownAssets : []),
    ...(Array.isArray(imageSystem?.generationBoundary?.lockedAssets)
      ? imageSystem.generationBoundary.lockedAssets
      : [])
  ].join('；');
  if (
    !/GSP|认证|证书|徽章|标识/i.test(approvedAssets)
    && positivelyRequires(prompt, CERTIFICATION_MARK)
  ) {
    problems.push({
      path: `${base}.finalPrompt`,
      message: `${base}.finalPrompt 要求生成未提供的认证资产`
    });
  }
  if (
    !/药械标签|医疗器械标签|drug label|device label/i.test(approvedAssets)
    && positivelyRequires(prompt, /药械标签|医疗器械标签|drug label|device label/i)
  ) {
    problems.push({
      path: `${base}.finalPrompt`,
      message: `${base}.finalPrompt 要求生成未提供的药械标签资产`
    });
  }
  if (
    /疗效|功效|未证实/i.test(prohibitions)
    && positivelyRequires(prompt, /疗效|功效|治疗效果|治愈|efficacy|treatment result|cure/i)
  ) {
    problems.push({
      path: `${base}.finalPrompt`,
      message: `${base}.finalPrompt 要求表现未证实的疗效或功效`
    });
  }
  if (
    /不是.{0,8}医疗机构|不得.{0,12}医疗机构|B2B/i.test(prohibitions)
    && positivelyRequires(prompt, /医疗机构|医院|诊所|clinic|hospital|medical institution/i)
  ) {
    problems.push({
      path: `${base}.finalPrompt`,
      message: `${base}.finalPrompt 把平台业务表现成了医疗机构`
    });
  }
  const difference = Array.isArray(task.intentionalDifferenceFromPreviousTasks)
    ? task.intentionalDifferenceFromPreviousTasks.join('；').trim()
    : '';
  if (
    index > 0
    && (
      !difference
      || VAGUE_DIFFERENCE.test(difference)
      || !DIFFERENCE_PROOF.test(difference)
      || !DIFFERENCE_VIEWPOINT.test(difference)
      || !DIFFERENCE_NON_REPEAT.test(difference)
    )
  ) {
    problems.push({
      path: `${base}.intentionalDifferenceFromPreviousTasks`,
      message: `${base}.intentionalDifferenceFromPreviousTasks 必须同时说明新增证明、不同视角和避免重复项`
    });
  }
  return problems;
}

export function validateTaskConsistency(task, index) {
  const base = `imageTasks[${index}]`;
  requireArray(task.consistencyWithGlobalSystem, `${base}.consistencyWithGlobalSystem`, 1);
  requireArray(task.consistencyWithPreviousTasks, `${base}.consistencyWithPreviousTasks`, 0);

  if (index === 0) {
    require(task.role === 'anchor-image', 'imageTasks[0].role 必须为 anchor-image。', 'imageTasks[0].role');
    require(task.sequence === 1, 'imageTasks[0].sequence 必须为 1。', 'imageTasks[0].sequence');
    require(
      task.consistencyWithPreviousTasks.length === 0,
      '第一张 anchor-image 不得引用前序任务。',
      'imageTasks[0].consistencyWithPreviousTasks'
    );
    return;
  }

  require(
    task.role !== 'anchor-image',
    `${base}.role 不得再次使用 anchor-image。`,
    `${base}.role`
  );
  requireArray(task.consistencyWithPreviousTasks, `${base}.consistencyWithPreviousTasks`, 1);
}

export function validateImageTasksV2(output, imageSystem, geneIds = new Set()) {
  const tasks = requireArray(output?.imageTasks, 'imageTasks', 4);
  require(tasks.length <= 8, 'imageTasks 不得超过 8 项。', 'imageTasks');
  const ids = new Set();
  const problems = [];

  for (const [index, task] of tasks.entries()) {
    const base = `imageTasks[${index}]`;
    const id = requireString(task?.id, `${base}.id`);
    require(!ids.has(id), `${base}.id 与其他任务重复。`, `${base}.id`);
    ids.add(id);

    require(
      Number.isInteger(task.sequence) && task.sequence === index + 1,
      `${base}.sequence 必须按任务顺序连续编号。`,
      `${base}.sequence`
    );
    require(
      GPT_IMAGE_TASK_ROLES.includes(task.role),
      `${base}.role 不是受支持的图片任务角色。`,
      `${base}.role`
    );
    require(
      task.systemId === imageSystem?.systemId,
      `${base}.systemId 必须等于全局 imageSystem.systemId。`,
      `${base}.systemId`
    );

    for (const key of [
      'objective',
      'viewerTakeaway',
      'subject',
      'environment',
      'composition',
      'focalHierarchy',
      'colorDirection',
      'materialAndTexture',
      'lighting',
      'textPolicy',
      'logoPolicy',
      'aspectRatio',
      'finalPrompt'
    ]) {
      requireString(task[key], `${base}.${key}`);
    }

    const basis = requireArray(task.brandDnaBasis, `${base}.brandDnaBasis`, 1);
    if (basis.some((idValue) => !geneIds.has(idValue))) {
      fail(`${base}.brandDnaBasis 引用了不存在的 DNA 基因。`, `${base}.brandDnaBasis`);
    }
    requireArray(task.prohibitedElements, `${base}.prohibitedElements`, 1);
    validateTaskConsistency(task, index);
    problems.push(...crossFieldProblems(task, index, imageSystem));
  }
  if (problems.length) {
    throw new StructuredValidationError(
      problems.map((problem) => problem.message).join('；'),
      problems.map((problem) => problem.path)
    );
  }

  return tasks;
}

export function validationErrorPaths(error) {
  if (Array.isArray(error?.jsonPaths) && error.jsonPaths.length) {
    return [...new Set(error.jsonPaths.map(String))];
  }
  if (error?.jsonPath) return [String(error.jsonPath)];
  const message = String(error?.message || '');
  const bracketPath = message.match(/([A-Za-z][A-Za-z0-9_.]*(?:\[\d+\])(?:\.[A-Za-z0-9_]+)*)/)?.[1];
  if (bracketPath) return [bracketPath];
  const rootPath = message.match(/^([A-Za-z][A-Za-z0-9_.]*)/)?.[1];
  return rootPath ? [rootPath] : [];
}
