const round1 = (value) => Math.round(value * 10) / 10;

export function validateDirectionScoreScale(directions) {
  const scores = directions.flatMap((direction) => [direction.brandFit, direction.inspirationValue, direction.distinctiveness, direction.scalability]);
  if (scores.some((score) => !Number.isFinite(score) || score < 0 || score > 100)) throw Object.assign(new Error('Direction scores must use the 0–100 scale'), { code: 'SCORE_SCALE_INVALID' });
  const positive = scores.filter((score) => score > 0);
  if (positive.length && Math.max(...positive) <= 1) throw Object.assign(new Error('Direction scores appear to use a 0–1 scale; ranking was not generated'), { code: 'SCORE_SCALE_INVALID' });
  if (positive.some((score) => score <= 1) && positive.some((score) => score > 1)) throw Object.assign(new Error('Direction scores mix 0–1 and 0–100 scales; ranking was not generated'), { code: 'SCORE_SCALE_INVALID' });
}

export function buildDirectionScoreCard(direction) {
  const base_score = round1(direction.brandFit * 0.4 + direction.inspirationValue * 0.2 + direction.distinctiveness * 0.25 + direction.scalability * 0.15);
  const evidence_confidence = direction.evidence_confidence;
  if (!Number.isFinite(evidence_confidence) || evidence_confidence < 0 || evidence_confidence > 1) throw Object.assign(new Error('Evidence Confidence must be between 0 and 1'), { code: 'SCORE_SCALE_INVALID' });
  const confidence_adjusted_score = round1(base_score * evidence_confidence);
  const risk_breakdown = direction.risk_breakdown;
  const risk_penalty = risk_breakdown?.risk_penalty_total;
  if (!Number.isFinite(risk_penalty) || risk_penalty < 0 || risk_penalty > 100) throw Object.assign(new Error('Risk penalty must use the 0–100 scale and include a breakdown'), { code: 'SCORE_SCALE_INVALID' });
  const penalty_reasons = [...(risk_breakdown.penalty_reasons || [])];
  if (risk_penalty > 0 && penalty_reasons.length === 0) throw Object.assign(new Error('A non-zero risk penalty requires a reason'), { code: 'SCORE_PENALTY_UNEXPLAINED' });
  if ((direction.categoryClicheRisk === 'medium' || direction.categoryClicheRisk === 'high' || direction.mechanismAssessment?.industryTemplateRisk === 'medium' || direction.mechanismAssessment?.industryTemplateRisk === 'high') && risk_breakdown.template_risk_penalty === 0) {
    throw Object.assign(new Error('Medium or high template risk requires a non-zero template penalty'), { code: 'SCORE_PENALTY_UNEXPLAINED' });
  }
  const final_score = round1(Math.max(0, confidence_adjusted_score - risk_penalty));
  return Object.freeze({
    base_score,
    evidence_confidence,
    confidence_adjusted_score,
    risk_breakdown: structuredClone(risk_breakdown),
    risk_penalty,
    final_score,
    penalty_reasons,
    template_risk_level: direction.categoryClicheRisk
  });
}

export function buildDirectionRecommendation(directions, signalMap, audienceBoundary, reportLanguage = 'en-US') {
  validateDirectionScoreScale(directions);
  const ranked = directions.map((direction) => ({ direction, scoreCard: buildDirectionScoreCard(direction) }))
    .sort((a, b) => b.scoreCard.final_score - a.scoreCard.final_score);
  const winner = ranked[0].direction;
  const covered = signalMap.signals.filter((item) => winner.strategicSignals.includes(item.signalId));
  const weakEvidence = winner.reason_basis === 'inference' || winner.evidence_confidence < 0.75;
  const strategicFactors = [
    `business_model:${audienceBoundary.businessModel}`,
    `consumer_visual_policy:${audienceBoundary.consumerVisualPolicy}`,
    `validated_signal_coverage:${covered.length}`,
    `evidence_basis:${winner.reason_basis}`
  ];
  const rationale = reportLanguage === 'zh-CN'
    ? [
        `核心隐喻回应了${covered.slice(0, 2).map((item) => item.statement).join('、') || '已验证的视觉策略信号'}。`,
        `推荐先通过受众边界、行业模板与证据置信度门槛，再进行分数比较。`,
        weakEvidence ? `该方向包含推断性依据，置信度为 ${winner.evidence_confidence}，必须保留风险提示并由人工复核。` : `该方向的证据基础为${winner.reason_basis}，置信度为 ${winner.evidence_confidence}。`,
        `具体镜头、人物动作、灯光机位和产品摆拍继续后置至 Sprint 2。`
      ]
    : [
        `The core metaphor responds to ${covered.slice(0, 2).map((item) => item.statement).join(' / ') || 'validated visual strategy signals'}.`,
        `The recommendation passed audience, template and evidence-confidence gates before score comparison.`,
        weakEvidence ? `This direction relies on inference at confidence ${winner.evidence_confidence} and requires explicit human review.` : `Its evidence basis is ${winner.reason_basis} at confidence ${winner.evidence_confidence}.`,
        `Shot, action, camera, lighting and product staging remain deferred to Sprint 2.`
      ];
  return Object.freeze({
    audienceBoundary: structuredClone(audienceBoundary),
    recommendedDirectionId: winner.directionId,
    reason_basis: winner.reason_basis,
    evidence_confidence: winner.evidence_confidence,
    evidence_ids: [...winner.evidence_ids],
    weak_evidence_warning: weakEvidence,
    selection_method: 'quality_score_with_audience_template_and_evidence_gates',
    selectionMethod: 'quality_score_with_audience_template_and_evidence_gates',
    strategic_factors: strategicFactors,
    strategicFactors,
    rationale,
    preservedStrengths: [winner.colorLogic, ...winner.graphicLanguage.slice(0, 2), ...winner.materialLanguage.slice(0, 1)],
    unresolvedRisks: [...winner.risks, ...(weakEvidence ? ['推断性证据需要人工复核'] : [])],
    alternativeDirectionIds: ranked.slice(1).map((item) => item.direction.directionId),
    humanSelectionRequired: true,
    comparison: ranked.map((item, index) => ({ directionId: item.direction.directionId, rank: index + 1, ...item.scoreCard }))
  });
}
