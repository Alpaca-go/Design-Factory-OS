import { buildStagePrompt } from './shared.js';

export function buildDnaSynthesisPrompt(context) {
  return buildStagePrompt(
    'dna-synthesis',
    '基于已归一事实、战略模型和诊断合成品牌 DNA。七类基因必须形成因果关系，所有 confirmed 事实和全部基因必须引用有效 evidenceIds。建议和缺失仍需保留。',
    context,
    `{"brandDna":{
"projectName":BrandFact,"brandName":BrandFact,"category":BrandFact,"businessModel":BrandFact,"developmentStage":BrandFact,
"audience":{"primary":[BrandFact],"secondary":[BrandFact],"needs":[BrandFact],"barriers":[BrandFact],"usageScenarios":[BrandFact]},
"strategy":{"purpose":BrandFact,"positioning":BrandFact,"brandPromise":BrandFact,"differentiators":[BrandFact],"valueProposition":[BrandFact],"brandValues":[BrandFact]},
"personality":{"traits":[BrandFact],"relationshipRole":BrandFact,"toneOfVoice":[BrandFact],"emotionalOutcome":[BrandFact]},
"culture":{"culturalContext":[BrandFact],"symbolicAssets":[BrandFact],"narrativeThemes":[BrandFact]},
"boundaries":{"prohibitedClaims":[BrandFact],"prohibitedStyles":[BrandFact],"complianceRisks":[BrandFact]},
"genes":[{"id":"gene-N","type":"functional|capability|relational|emotional|cultural|behavioral|aesthetic","statement":"string","evidenceIds":["evidence-N"],"confidence":"high|medium|low","relationships":["string"],"brandDecisionImpact":["string"],"visualDecisionImpact":["string"],"mustNotBeMisreadAs":["string"]}],
"oneSentenceDna":"因果结构的一句话品牌 DNA",
"diagnosis":{"conflicts":["string"],"missingInformation":["string"],"genericStatements":["string"],"strategicRisks":["string"]}
}}
BrandFact={"value":"string","status":"confirmed|inferred|suggested|conflicting|missing","confidence":"high|medium|low","evidenceIds":["evidence-N"],"evidence":[],"note":"optional"}`
  );
}
