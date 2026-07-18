export function buildDirectionRecommendation(directions, signalMap) {
  const penalty = { low: 0, medium: 8, high: 18 };
  const ranked = directions.map((direction) => ({
    direction,
    score: direction.brandFit * 0.35 + direction.inspirationValue * 0.25 + direction.distinctiveness * 0.4 - penalty[direction.categoryClicheRisk]
  })).sort((a, b) => b.score - a.score);
  const winner = ranked[0].direction;
  const covered = signalMap.signals.filter((item) => winner.strategicSignals.includes(item.signalId));
  return Object.freeze({
    recommendedDirectionId: winner.directionId,
    rationale: [
      `以“${winner.coreMetaphor}”回应 ${covered.slice(0, 2).map((item) => item.statement).join('；') || '核心视觉策略信号'}`,
      `品牌匹配 ${winner.brandFit}、灵感价值 ${winner.inspirationValue}、独特性 ${winner.distinctiveness}，并已计入行业模板风险惩罚`,
      `专属机制“${winner.distinctiveMechanism}”可继续发展，但仍需人工选择后才能进入 Anchor 阶段`
    ],
    preservedStrengths: [winner.colorLogic, ...winner.graphicLanguage.slice(0, 2), ...winner.materialLanguage.slice(0, 1)],
    unresolvedRisks: [...winner.risks, ...(winner.categoryClicheRisk === 'low' ? [] : [`行业模板风险：${winner.categoryClicheRisk}`])],
    alternativeDirectionIds: ranked.slice(1).map((item) => item.direction.directionId),
    humanSelectionRequired: true,
    comparison: ranked.map((item, index) => ({ directionId: item.direction.directionId, rank: index + 1, comparisonScore: Math.round(item.score * 10) / 10 }))
  });
}
