import { buildStagePrompt } from './shared.js';

export function buildVisualTranslationPrompt(brandDna, creativeThesisDecision) {
  return buildStagePrompt(
    'visual-causal-translation',
    `把品牌 DNA 因果映射为视觉变量，不得使用“高端所以黑金、年轻所以渐变、传统所以古典纹样”等模板。建立统一全局视觉系统。
必须提出至少一个可追溯到品牌专属能力或关系机制的 distinctiveAssetCandidate，不能只给医疗蓝、生态绿、网格、流线、玻璃或实验室等行业通用元素。
拆分已确认事实、已批准资产、建议元素、可发挥空间、禁止元素、禁止声明和待确认项。没有已批准 Logo 或认证图形时，lockedAssets 必须为空，并明确禁止生成或仿造。`,
    { brandDna, creativeThesisDecision },
    `{"visualTranslation":{
"creativeTranslation":{"visualPersonality":["string"],"visualKeywords":["string"],"emotionalTemperature":["string"],"colorDirection":[CreativeDirection],"typographyDirection":[CreativeDirection],"graphicDirection":[CreativeDirection],"compositionDirection":[CreativeDirection],"photographyDirection":[CreativeDirection],"illustrationDirection":[CreativeDirection],"materialDirection":[CreativeDirection],"lightingDirection":[CreativeDirection],"motionDirection":[CreativeDirection],"suggestedAssets":["string"],"distinctiveAssetCandidates":[{"name":"string","sourceBasis":["gene-N"],"mechanism":"string","genericRisk":"low|medium|high"}],"avoidDirections":["string"]},
"mappings":[{"dnaGeneId":"gene-N","strategicMeaning":"string","visualVariable":"composition|color|shape|typography|material|lighting|photography|illustration|motion|space|rhythm","decision":"string","rationale":"string","applicationExamples":["string"],"avoid":["string"]}]},
"imageSystem":{"systemId":"brand-image-system-v1","brandDnaSummary":"string","creativeThesis":"string","anchorVisual":"string","visualPersonality":["string"],"compositionSystem":"string","colorSystem":[{"role":"string","direction":"string","usage":"string"}],"materialSystem":["string"],"lightingSystem":"string","imageLanguage":"string","consistencyRules":["string"],"lockedFacts":["string"],"knownAssets":["string"],"creativeFreedom":["string"],"globalProhibitions":["string"],"textPolicy":"string","logoPolicy":"string","generationBoundary":{"lockedFacts":["string"],"lockedAssets":["string"],"verifiedRequiredElements":["string"],"suggestedElements":["string"],"creativeFreedom":["string"],"prohibitedElements":["string"],"prohibitedClaims":["string"],"pendingConfirmations":["string"]}}}
CreativeDirection={"direction":"具体视觉决策","rationale":"对应哪条 DNA","actions":["可观察动作"]}`
  );
}
