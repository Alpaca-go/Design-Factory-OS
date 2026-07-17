export const IMAGE_PROMPT_COMPILER_PROMPT_VERSION = 'image-prompt-compiler-prompt-v3.3';

export function buildImagePromptCompilerPrompt(decision, visual) {
  const input = { brandDnaSummary: decision.oneSentenceDna, creativeThesis: decision.creativeThesis, imageSystem: visual.imageSystem, generationBoundary: visual.generationBoundary, taskPlan: visual.taskPlan };
  const taskIds = visual.taskPlan.map((task) => task.taskId);
  const noVerifiedTextAssets = !(visual.generationBoundary.lockedAssets || []).length;
  return [{ role: 'user', content: `PROTOCOL_STAGE=06-image-prompt-compiler
PROMPT_VERSION=${IMAGE_PROMPT_COMPILER_PROMPT_VERSION}
你只负责把已批准的任务骨架编译为整套英文生图 Prompt，不做新的品牌战略或视觉决策。compiledImageTasks 必须恰好返回 ${taskIds.length} 项，逐一覆盖 ${JSON.stringify(taskIds)}，不得遗漏、重复或合并任务。不得新增上游没有的事实、Logo、认证、产品或文字。${noVerifiedTextAssets ? '当前没有任何已锁定文字资产：所有任务必须 textPolicy.mode=no-text、allowedText=[]，finalPrompt 不得要求画面显示可读文字、数字、百分比、状态标签或认证措辞。' : ''}每个 finalPrompt 180～350 个英文词。Text Policy、Logo Policy 和禁止项必须与全局边界一致。Anchor 的 consistencyWithPreviousTasks 必须为空；后续任务必须非空。只返回 JSON。

输入：${JSON.stringify(input)}

输出：{"compiledImageTasks":[{"taskId":"task-N","subject":"string","environment":"string","narrativeMoment":"string","requiredElements":["string"],"optionalElements":["string"],"prohibitedElements":["string"],"composition":"string","focus":"string","camera":"string","color":"string","material":"string","lighting":"string","atmosphere":"string","lockedAssets":["string"],"textPolicy":{"mode":"no-text|limited-verified-text|use-provided-text","allowedText":["string"]},"logoPolicy":{"mode":"use-provided-logo|reserve-placeholder|no-logo"},"consistencyWithGlobalSystem":["string"],"consistencyWithPreviousTasks":["string"],"differenceFromOtherTasks":["string"],"aspectRatio":"string","finalPrompt":"180-350 English words"}]}` }];
}
