import { buildStagePrompt } from './shared.js';

export function buildImageTaskPrompt(context, industryRules) {
  return buildStagePrompt(
    'gpt-image-task-compiler',
    '仅把已批准的 DNA、创意命题和全局视觉系统编译为 4～8 个可独立执行又互相一致的 GPT 生图任务。首张必须是 anchor-image；不同任务职责不可重复。',
    context,
    `{"imageTasks":[{"id":"task-N","systemId":"必须等于全局 imageSystem.systemId","sequence":1,"title":"string","role":"anchor-image|brand-poster|product-or-service-scene|packaging-concept|visual-system|application-scene|detail-craft|custom","objective":"string","brandDnaBasis":["gene-N"],"viewerTakeaway":"string","subject":"有证据支持或明确为概念的主体","environment":"string","narrativeMoment":"string","composition":"string","focalHierarchy":"string","cameraAndPerspective":"string","colorDirection":"string","materialAndTexture":"string","lighting":"string","atmosphere":"string","requiredElements":["string"],"optionalElements":["string"],"prohibitedElements":["string"],"lockedAssetInstructions":["string"],"textPolicy":"string","logoPolicy":"string","consistencyWithPreviousTasks":["string"],"intentionalDifferenceFromPreviousTasks":["string"],"aspectRatio":"string","outputResponsibility":"string","finalPrompt":"至少 120 字的完整自然语言设计指令"}]}`,
    industryRules.imageProhibitions.join('\n- ')
  );
}
