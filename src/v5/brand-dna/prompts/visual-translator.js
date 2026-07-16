import { buildStagePrompt } from './shared.js';

export function buildVisualTranslationPrompt(brandDna, creativeThesisDecision) {
  return buildStagePrompt(
    'visual-causal-translation',
    '把品牌 DNA 因果映射为视觉变量，不得使用“高端所以黑金、年轻所以渐变、传统所以古典纹样”等模板。建立统一全局视觉系统。',
    { brandDna, creativeThesisDecision },
    `{"visualTranslation":{
"creativeTranslation":{"visualPersonality":["string"],"visualKeywords":["string"],"emotionalTemperature":["string"],"colorDirection":[CreativeDirection],"typographyDirection":[CreativeDirection],"graphicDirection":[CreativeDirection],"compositionDirection":[CreativeDirection],"photographyDirection":[CreativeDirection],"illustrationDirection":[CreativeDirection],"materialDirection":[CreativeDirection],"lightingDirection":[CreativeDirection],"motionDirection":[CreativeDirection],"suggestedAssets":["string"],"avoidDirections":["string"]},
"mappings":[{"dnaGeneId":"gene-N","strategicMeaning":"string","visualVariable":"composition|color|shape|typography|material|lighting|photography|illustration|motion|space|rhythm","decision":"string","rationale":"string","applicationExamples":["string"],"avoid":["string"]}]},
"imageSystem":{"systemId":"brand-image-system-v1","brandDnaSummary":"string","creativeThesis":"string","anchorVisual":"string","visualPersonality":["string"],"compositionSystem":"string","colorSystem":[{"role":"string","direction":"string","usage":"string"}],"materialSystem":["string"],"lightingSystem":"string","imageLanguage":"string","consistencyRules":["string"],"lockedFacts":["string"],"knownAssets":["string"],"creativeFreedom":["string"],"globalProhibitions":["string"],"textPolicy":"string","logoPolicy":"string"}}
CreativeDirection={"direction":"具体视觉决策","rationale":"对应哪条 DNA","actions":["可观察动作"]}`
  );
}
