import { buildStagePrompt } from './shared.js';

export function buildImageTaskPrompt(context, industryRules) {
  return buildStagePrompt(
    'gpt-image-task-compiler',
    `仅把已批准的 Brand DNA、创意命题、视觉转译和全局 Image System 编译为 4～8 个可独立执行且互相一致的 GPT 生图任务。不同任务的展示职责不得重复。

硬性规则：
1. Every task must include consistencyWithGlobalSystem with at least one concrete item.
2. imageTasks[0] must use role = anchor-image and sequence = 1.
3. imageTasks[0].consistencyWithPreviousTasks must be [] because no previous task exists.
4. Starting from imageTasks[1], role must not be anchor-image and consistencyWithPreviousTasks must contain at least one concrete rule.
5. Do not write generic statements such as "keep consistent". Name the actual composition, color, material, lighting, subject, character, product form, or spatial rhythm that remains consistent.
6. sequence must be consecutive and follow the array order.
7. intentionalDifferenceFromPreviousTasks must state what new fact or relationship this image proves, its different viewpoint, and which earlier task it must not repeat. Do not write generic phrases such as "承担独立验证职责".
8. If textPolicy means no-text, requiredElements, allowedText, and finalPrompt must not require readable text, numbers, or a Logo.
9. If verified text such as 10–25℃ must appear, use textPolicy = limited-verified-text and list it in allowedText; do not also say no-text.
10. If no approved Logo exists, logoPolicy must be no-logo or reserve-placeholder, and finalPrompt must prohibit invented Logo marks.
11. Do not generate or imitate GSP or other certification marks unless an approved asset is explicitly present.
12. Low color temperature is warm and high color temperature is cool. Do not combine no-shadow with strong dramatic shadows.

第一项示例：
{"id":"task-01","sequence":1,"role":"anchor-image","systemId":"image-system-01","consistencyWithGlobalSystem":["完整建立 imageSystem 中已批准的主色角色、材质关系、构图秩序和核心视觉锚点"],"consistencyWithPreviousTasks":[]}`,
    context,
    `{"imageTasks":[{"id":"task-N","systemId":"必须等于全局 imageSystem.systemId","sequence":1,"title":"string","role":"anchor-image|brand-poster|product-or-service-scene|packaging-concept|visual-system|application-scene|detail-craft|custom","objective":"string","brandDnaBasis":["gene-N"],"viewerTakeaway":"string","subject":"有证据支持或明确为概念的主体","environment":"string","narrativeMoment":"string","composition":"string","focalHierarchy":"string","cameraAndPerspective":"string","colorDirection":"string","materialAndTexture":"string","lighting":"string","atmosphere":"string","requiredElements":["string"],"optionalElements":["string"],"prohibitedElements":["string"],"lockedAssetInstructions":["string"],"textPolicy":"no-text|limited-verified-text|reserve-layout-area","allowedText":["仅限已确认文字"],"logoPolicy":"use-provided-logo|reserve-placeholder|no-logo|logo-design-task","consistencyWithGlobalSystem":["至少一条具体规则"],"consistencyWithPreviousTasks":[],"intentionalDifferenceFromPreviousTasks":["新增证明什么","使用什么不同视角","不得与哪张图重复"],"aspectRatio":"string","outputResponsibility":"string","finalPrompt":"至少 120 字的完整自然语言设计指令"}]}`,
    industryRules.imageProhibitions.join('\n- ')
  );
}
