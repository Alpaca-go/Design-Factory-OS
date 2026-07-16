import { buildStagePrompt } from './shared.js';

export function buildDnaSynthesisPrompt(context) {
  return buildStagePrompt(
    'dna-synthesis',
    `基于已归一事实、战略模型和诊断合成品牌 DNA。七类基因必须形成因果关系，所有 confirmed 事实和全部基因必须引用有效 evidenceIds。建议和缺失仍需保留。
七类定义：
- functional：用户最终获得的结果；
- capability：品牌凭什么稳定交付该结果，不得与 functional 重复；
- relational：品牌在客户、伙伴和生态中的关系角色；
- emotional：品牌希望带来的情绪结果；
- cultural：长期坚持或希望建立的文化主张；
- behavioral：服务和行动中的稳定行为方式；
- aesthetic：由前六类基因转译出的审美原则。
文化基因必须标注 culturalMaturity：embedded 仅用于已被行为证明，declared 用于文档明确声明，aspirational 用于愿景。项目名不得含分析任务词。`,
    context,
    `{"brandDna":{
"projectName":BrandFact,"brandName":BrandFact,"category":BrandFact,"businessModel":BrandFact,"developmentStage":BrandFact,
"audience":{"primary":[BrandFact],"secondary":[BrandFact],"needs":[BrandFact],"barriers":[BrandFact],"usageScenarios":[BrandFact]},
"strategy":{"purpose":BrandFact,"positioning":BrandFact,"brandPromise":BrandFact,"differentiators":[BrandFact],"valueProposition":[BrandFact],"brandValues":[BrandFact]},
"personality":{"traits":[BrandFact],"relationshipRole":BrandFact,"toneOfVoice":[BrandFact],"emotionalOutcome":[BrandFact]},
"culture":{"culturalContext":[BrandFact],"symbolicAssets":[BrandFact],"narrativeThemes":[BrandFact]},
"boundaries":{"prohibitedClaims":[BrandFact],"prohibitedStyles":[BrandFact],"complianceRisks":[BrandFact]},
"genes":[{"id":"gene-N","type":"functional|capability|relational|emotional|cultural|behavioral|aesthetic","statement":"string","culturalMaturity":"embedded|declared|aspirational|null","evidenceIds":["evidence-N"],"confidence":"high|medium|low","relationships":["string"],"brandDecisionImpact":["string"],"visualDecisionImpact":["string"],"mustNotBeMisreadAs":["string"]}],
"oneSentenceDna":"因果结构的一句话品牌 DNA",
"diagnosis":{"conflicts":["string"],"missingInformation":["string"],"genericStatements":["string"],"strategicRisks":["string"]}
}}
BrandFact={"value":"string","status":"confirmed|inferred|suggested|conflicting|missing","confidence":"high|medium|low","evidenceIds":["evidence-N"],"evidence":[],"note":"optional"}`
  );
}
