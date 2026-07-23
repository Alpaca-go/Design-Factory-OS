export function evaluateFamilyRecommendationBias(projectResults = []) {
  const projects = projectResults.filter(Boolean);
  const stats = new Map();
  for (const project of projects) {
    const primary = project.final_direction_ranking?.primary_direction_id
      || project.model_critic?.final_direction_ranking?.primary_direction_id;
    for (const direction of project.directions || []) {
      const raw = direction.direction || direction;
      const family = raw.family_type || raw.direction_family || 'unknown';
      const item = stats.get(family) || { family_name: family, generated_count: 0, primary_count: 0, score_total: 0 };
      item.generated_count += 1;
      item.primary_count += raw.direction_id === primary ? 1 : 0;
      item.score_total += Number(direction.critic_score || direction.score || 0);
      stats.set(family, item);
    }
  }
  const family_stats = [...stats.values()].map((item) => Object.freeze({
    family_name: item.family_name,
    generated_count: item.generated_count,
    primary_count: item.primary_count,
    average_score: item.generated_count ? Math.round(item.score_total / item.generated_count * 10) / 10 : 0,
    primary_project_rate: projects.length ? Math.round(item.primary_count / projects.length * 1000) / 1000 : 0
  }));
  return Object.freeze({
    family_stats: Object.freeze(family_stats),
    family_recommendation_bias: family_stats.some((item) => projects.length && item.primary_count / projects.length >= 0.7) ? 'high' : 'none',
    audit_warning: family_stats.find((item) => projects.length && item.primary_count / projects.length >= 0.7)?.family_name || null
  });
}

