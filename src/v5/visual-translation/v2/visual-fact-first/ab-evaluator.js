const average = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0) / Math.max(1, items.length);

export function evaluateVisualFactFirstAB(projects) {
  if (!Array.isArray(projects) || projects.length < 3) throw new TypeError('Visual Fact First A/B requires at least three projects');
  const details = projects.map((project) => {
    if (!Array.isArray(project.legacy) || project.legacy.length < 3 || !Array.isArray(project.visual_fact_first) || project.visual_fact_first.length < 3) {
      throw new TypeError(`${project.project}: each pipeline requires at least three runs`);
    }
    const legacy = project.legacy;
    const visual = project.visual_fact_first;
    const metric = (key) => ({ legacy: average(legacy, key), visual_fact_first: average(visual, key) });
    return {
      project: project.project,
      document_analysis_ms: metric('document_analysis_ms'), upstream_input_tokens: metric('upstream_input_tokens'),
      brand_role_accuracy: metric('brand_role_accuracy'), locked_asset_protection: metric('locked_asset_protection'),
      gate_false_positives: metric('gate_false_positives'), direction_mechanism_difference: metric('direction_mechanism_difference'),
      template_risk: metric('template_risk'), e02_lab_drift: metric('e02_lab_drift'), anchor_usability: metric('anchor_usability'),
      permanent_running: visual.reduce((total, item) => total + Number(item.permanent_running || 0), 0)
    };
  });
  const aggregate = (key, side) => details.reduce((total, item) => total + item[key][side], 0) / details.length;
  const timeReduction = 1 - aggregate('document_analysis_ms', 'visual_fact_first') / Math.max(1, aggregate('document_analysis_ms', 'legacy'));
  const tokenReduction = 1 - aggregate('upstream_input_tokens', 'visual_fact_first') / Math.max(1, aggregate('upstream_input_tokens', 'legacy'));
  const anchorWins = details.filter((item) => item.anchor_usability.visual_fact_first > item.anchor_usability.legacy).length;
  const criteria = {
    document_time_reduction_30pct: timeReduction >= 0.3,
    upstream_token_reduction_30pct: tokenReduction >= 0.3,
    brand_role_not_worse: aggregate('brand_role_accuracy', 'visual_fact_first') >= aggregate('brand_role_accuracy', 'legacy'),
    locked_assets_not_worse: aggregate('locked_asset_protection', 'visual_fact_first') >= aggregate('locked_asset_protection', 'legacy'),
    gate_false_positives_not_higher: aggregate('gate_false_positives', 'visual_fact_first') <= aggregate('gate_false_positives', 'legacy'),
    direction_difference_better: aggregate('direction_mechanism_difference', 'visual_fact_first') > aggregate('direction_mechanism_difference', 'legacy'),
    template_risk_lower: aggregate('template_risk', 'visual_fact_first') < aggregate('template_risk', 'legacy'),
    e02_lab_drift_zero: aggregate('e02_lab_drift', 'visual_fact_first') === 0,
    anchor_usability_wins_two_projects: anchorWins >= 2,
    permanent_running_zero: details.every((item) => item.permanent_running === 0)
  };
  return Object.freeze({
    schema_version: 'visual-fact-first-ab-v1', details,
    summary: { time_reduction: timeReduction, token_reduction: tokenReduction, anchor_wins: anchorWins },
    criteria, replacement_allowed: Object.values(criteria).every(Boolean)
  });
}
