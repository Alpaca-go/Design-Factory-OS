import { arrayValue, enumValue, objectValue, stringArray, stringValue } from '../../runtime-contracts.js';

const NO_TEXT_SUFFIX = 'No readable text, numbers, logos, certification marks, status labels, or performance claims.';

function enforceNoTextPrompt(value) {
  let result = value
    .replace(/'[^']*'|"[^"]*"/g, 'abstract interface forms')
    .replace(/\b(?:verified|confirmed|certified|approved|guaranteed|unlabeled)\b/gi, 'subtle')
    .replace(/\b(?:unquantified indicator|non-quantified setting)\b/gi, 'subtle visual rhythm')
    .replace(/\b\d+(?:\.\d+)?\s*%/g, 'a subtle visual rhythm')
    .replace(/\b\d+(?:\.\d+)?\s*(?:hz|fps|°c|mm|cm|km)\b/gi, 'a subtle visual rhythm')
    .replace(/\bGSP(?:-controlled)?\b/gi, 'regulated')
    .trim();
  if (!result.toLowerCase().includes(NO_TEXT_SUFFIX.toLowerCase())) result = `${result} ${NO_TEXT_SUFFIX}`;
  const words = result.split(/\s+/);
  return words.length > 350 ? [...words.slice(0, 338), ...NO_TEXT_SUFFIX.split(' ')].join(' ') : result;
}

export function validateCompiledImageTasks(value, visual) {
  const planned = new Map(visual.taskPlan.map((task) => [task.taskId, task]));
  const forceNoText = !(visual.generationBoundary.lockedAssets || []).length;
  const rawTasks = value?.compiledImageTasks || value;
  if (!Array.isArray(rawTasks) || rawTasks.length !== visual.taskPlan.length) {
    throw Object.assign(new Error(`compiledImageTasks 必须逐一覆盖 ${visual.taskPlan.length} 个任务，当前 ${Array.isArray(rawTasks) ? rawTasks.length : 0} 项`), { code: 'COMPILED_TASK_COUNT_MISMATCH', expected: visual.taskPlan.length, received: Array.isArray(rawTasks) ? rawTasks.length : 0 });
  }
  const tasks = arrayValue(rawTasks, 'compiledImageTasks', { min: visual.taskPlan.length, max: visual.taskPlan.length }).map((raw, index) => {
    const path = `compiledImageTasks[${index}]`;
    const item = objectValue(raw, path);
    const taskId = stringValue(item.taskId, `${path}.taskId`);
    const skeleton = planned.get(taskId);
    if (!skeleton) throw new Error(`${path}.taskId 未在任务骨架中定义`);
    const previous = stringArray(item.consistencyWithPreviousTasks || [], `${path}.consistencyWithPreviousTasks`, { min: skeleton.role === 'anchor-image' ? 0 : 1 });
    if (skeleton.role === 'anchor-image' && previous.length) throw new Error(`${path}.consistencyWithPreviousTasks Anchor 必须为空`);
    const rawTextPolicy = objectValue(item.textPolicy, `${path}.textPolicy`);
    const logoPolicy = objectValue(item.logoPolicy, `${path}.logoPolicy`);
    const finalPrompt = forceNoText ? enforceNoTextPrompt(stringValue(item.finalPrompt, `${path}.finalPrompt`)) : stringValue(item.finalPrompt, `${path}.finalPrompt`);
    const words = finalPrompt.trim().split(/\s+/).length;
    if (words < 180 || words > 350) throw new Error(`${path}.finalPrompt 必须为 180～350 个英文词，当前 ${words}`);
    const textPolicy = forceNoText
      ? { mode: 'no-text', allowedText: [] }
      : { mode: enumValue(rawTextPolicy.mode, ['no-text', 'limited-verified-text', 'use-provided-text'], `${path}.textPolicy.mode`), allowedText: stringArray(rawTextPolicy.allowedText || [], `${path}.textPolicy.allowedText`) };
    return {
      taskId,
      subject: stringValue(item.subject, `${path}.subject`),
      environment: stringValue(item.environment, `${path}.environment`),
      narrativeMoment: stringValue(item.narrativeMoment, `${path}.narrativeMoment`),
      requiredElements: stringArray(item.requiredElements, `${path}.requiredElements`, { min: 1 }),
      optionalElements: stringArray(item.optionalElements || [], `${path}.optionalElements`),
      prohibitedElements: stringArray(item.prohibitedElements, `${path}.prohibitedElements`, { min: 1 }),
      composition: stringValue(item.composition, `${path}.composition`), focus: stringValue(item.focus, `${path}.focus`), camera: stringValue(item.camera, `${path}.camera`), color: stringValue(item.color, `${path}.color`), material: stringValue(item.material, `${path}.material`), lighting: stringValue(item.lighting, `${path}.lighting`), atmosphere: stringValue(item.atmosphere, `${path}.atmosphere`),
      lockedAssets: stringArray(item.lockedAssets || [], `${path}.lockedAssets`), textPolicy,
      logoPolicy: { mode: enumValue(logoPolicy.mode, ['use-provided-logo', 'reserve-placeholder', 'no-logo'], `${path}.logoPolicy.mode`) },
      consistencyWithGlobalSystem: stringArray(item.consistencyWithGlobalSystem, `${path}.consistencyWithGlobalSystem`, { min: 1 }),
      consistencyWithPreviousTasks: previous,
      differenceFromOtherTasks: stringArray(item.differenceFromOtherTasks, `${path}.differenceFromOtherTasks`, { min: 1 }),
      aspectRatio: stringValue(item.aspectRatio, `${path}.aspectRatio`), finalPrompt
    };
  });
  if (new Set(tasks.map((task) => task.taskId)).size !== planned.size) throw new Error('compiledImageTasks 存在重复或缺失任务');
  return tasks.sort((a, b) => visual.taskPlan.findIndex((item) => item.taskId === a.taskId) - visual.taskPlan.findIndex((item) => item.taskId === b.taskId));
}
