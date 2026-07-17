export const VISUAL_SYSTEM_TASK_PLAN_PROMPT_VERSION = 'visual-system-task-plan-prompt-v3.2';

export function buildVisualSystemTaskPlanPrompt(decision, lockedAssets = []) {
  const compact = { identity: decision.identity, genes: decision.genes, oneSentenceDna: decision.oneSentenceDna, creativeThesis: decision.creativeThesis, visualMechanisms: decision.visualMechanisms, pendingConfirmations: decision.pendingConfirmations };
  return [{ role: 'user', content: `PROTOCOL_STAGE=05-visual-system-task-plan
PROMPT_VERSION=${VISUAL_SYSTEM_TASK_PLAN_PROMPT_VERSION}
把已批准的 Brand Creative Decision 一次转译为品牌专属视觉系统、生成边界和 4～8 张职责不同的任务骨架。本阶段禁止生成长 Prompt，不得重新解释原文，不得新增品牌事实。视觉机制不能退化为医疗蓝、网格、流线、玻璃或实验室等行业模板。Locked Facts、Locked Assets、建议和创作自由必须分开。没有 Logo 时禁止设计或仿造 Logo；没有认证资产时禁止生成认证标识。首张必须是 anchor-image，且 consistencyWithPreviousTasks 必须为空；后续任务必须非空。只返回 JSON。

Approved Decision：${JSON.stringify(compact)}
Locked Assets：${JSON.stringify(lockedAssets)}

输出：{"visualSystemTaskPlan":{"visualPersonality":["string"],"visualKeywords":["string"],"distinctiveAssets":[{"assetId":"asset-N","name":"string","mechanism":"string","geneIds":["gene-N"]}],"directions":{"color":VisualDirection,"typography":VisualDirection,"graphic":VisualDirection,"composition":VisualDirection,"photography":VisualDirection,"illustration":VisualDirection,"material":VisualDirection,"lighting":VisualDirection,"motion":VisualDirection},"imageSystem":{"systemId":"brand-image-system-v3","anchorVisual":"string","compositionSystem":"string","colorSystem":["string"],"materialSystem":["string"],"lightingSystem":"string","imageLanguage":"string","consistencyRules":["string"],"textPolicy":"string","logoPolicy":"string"},"generationBoundary":{"lockedFacts":["string"],"lockedAssets":["string"],"verifiedRequiredElements":["string"],"suggestedElements":["string"],"creativeFreedom":["string"],"prohibitedElements":["string"],"prohibitedClaims":["string"],"pendingConfirmations":["string"]},"taskPlan":[{"taskId":"task-N","sequence":1,"role":"anchor-image|service-scene|visual-system|detail-craft|application-scene|packaging|poster","titleZh":"string","responsibility":"string","viewerTakeaway":"string","geneIds":["gene-N"],"requiredElements":["string"],"prohibitedElements":["string"],"consistencyWithGlobalSystem":["string"],"consistencyWithPreviousTasks":[],"differenceFromOtherTasks":["string"],"aspectRatio":"string"}]}}
VisualDirection={"decision":"string","rationale":"string","actions":["string"]}` }];
}
