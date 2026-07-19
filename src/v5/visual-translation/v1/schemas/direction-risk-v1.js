const TEMPLATE_PENALTY = Object.freeze({ low: 0, medium: 4, high: 9 });
const EVIDENCE_PENALTY = Object.freeze({ direct_evidence: 0, derived_evidence: 2, inference: 5 });

export function buildDirectionRiskBreakdown(direction) {
  const templateLevels = [direction.categoryClicheRisk, direction.mechanismAssessment?.industryTemplateRisk];
  if (templateLevels.includes('critical')) throw Object.assign(new Error('Critical template risk rejects the direction'), { code: 'INDUSTRY_TEMPLATE_RISK' });
  const template_risk_penalty = Math.max(...templateLevels.map((level) => TEMPLATE_PENALTY[level] ?? 0));
  const audience_risk_penalty = 0;
  const evidence_risk_penalty = EVIDENCE_PENALTY[direction.reason_basis] ?? 0;
  const asset_risk_penalty = 0;
  const anti_pattern_penalty = 0;
  const risk_penalty_total = template_risk_penalty + audience_risk_penalty + evidence_risk_penalty + asset_risk_penalty + anti_pattern_penalty;
  const penalty_reasons = [
    ...(template_risk_penalty ? [`template_risk:${templateLevels.includes('high') ? 'high' : 'medium'}`] : []),
    ...(evidence_risk_penalty ? [`evidence_basis:${direction.reason_basis}`] : [])
  ];
  return Object.freeze({
    template_risk_penalty,
    audience_risk_penalty,
    evidence_risk_penalty,
    asset_risk_penalty,
    anti_pattern_penalty,
    risk_penalty_total,
    penalty_reasons
  });
}
