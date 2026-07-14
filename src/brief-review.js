const PENDING_PATTERN = /待.*(?:确认|补充|验证|打样)|仍需.*确认|尚未|未完成|不得仅凭|视觉核验未闭环/;

function populated(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every(populated);
  if (value && typeof value === 'object') return Object.values(value).every(populated);
  return typeof value === 'string' ? Boolean(value.trim()) && !PENDING_PATTERN.test(value) : value !== null && value !== undefined;
}

function check(section, value, evidence, nextStep, ready = populated(value)) {
  return { section, status: ready ? 'Ready' : 'Needs Evidence', evidence, nextStep };
}

export function buildBriefReview(result) {
  const reasoning = result.creativeReasoning;
  const decision = reasoning.brandDnaDecision || result.brandDnaDecision || {};
  const approvedBrandDNA = reasoning.approvedBrandDNA || decision.approvedBrandDNA || {};
  const dnaReady = decision.status === 'Approved' && populated(approvedBrandDNA);
  const checks = [
    check('Brand Identity', reasoning.brandIdentity, reasoning.brandIdentity.evidence.join('；') || '暂无依据', '用一句非品类描述说明品牌真正是什么，并补充视觉或用户证据。'),
    check('Brand Positioning', reasoning.brandPositioning, reasoning.brandPositioning.evidence.join('；') || '暂无依据', '明确相对竞争环境的差异，并说明判断依据。'),
    check('Design Language', reasoning.designLanguage, reasoning.designLanguage.rationale.join('；') || '暂无依据', '把风格形容词转化为可被设计团队执行的关系和原则。'),
    check('Emotional Direction', reasoning.emotionalDirection, reasoning.emotionalDirection.evidence.join('；') || '暂无依据', '补充目标情绪与不希望出现的反向感受。'),
    check(
      'Approved Brand DNA',
      approvedBrandDNA,
      decision.status === 'Approved'
        ? '四阶段 Brand DNA Decision 已完成并显式批准。'
        : `决策链未完成：${decision.approval?.blockers?.join('；') || '缺少显式批准或决策依据'}`,
      '完成 Original Intent → Industry Benchmark → Creative Decision，并显式批准九个 Brand DNA 维度。',
      dnaReady
    ),
    check('Photography Direction', reasoning.photographyDirection, '已检查光线、取景、景深、材质和氛围。', '确保描述的是摄影方向而不是单张 Prompt。'),
    check('Design Risks', reasoning.designRisks, `${reasoning.designRisks.length} 项风险`, '每项风险保留原因与防偏方式。'),
    check('Must Keep', reasoning.mustKeep, `${reasoning.mustKeep.length} 项不可变资产`, '只保留真正影响品牌身份的长期资产。'),
    check('Can Explore', reasoning.canExplore, `${reasoning.canExplore.length} 项探索空间`, '明确创新自由度，避免 Brief 只剩限制。'),
    check('Design Goal', reasoning.designGoal, reasoning.designGoal, '用一句话定义项目最终要达到的品牌与作品集效果。')
  ];
  const readyCount = checks.filter((item) => item.status === 'Ready').length;
  const completeness = Math.round((readyCount / checks.length) * 100);
  const openQuestions = checks.filter((item) => item.status !== 'Ready').map((item) => `${item.section}：${item.nextStep}`);
  const strengths = [
    ...(reasoning.visualInspection.verified ? [`逐张视觉核验已覆盖 ${reasoning.visualInspection.inspectedImageCount}/${reasoning.visualInspection.totalImages} 张图片。`] : []),
    ...(result.benchmarks.cases.length >= 3 ? [`Benchmark 已覆盖 ${result.benchmarks.cases.length} 个案例，并与项目事实分离。`] : []),
    ...(reasoning.mustKeep.length >= 3 ? ['Must Keep 已形成足以约束跨触点设计的品牌资产边界。'] : []),
    ...(reasoning.canExplore.length >= 2 ? ['Can Explore 为创意团队保留了明确创新空间。'] : [])
  ];
  return {
    completeness,
    readiness: completeness === 100 ? 'Ready for Creative Development' : 'Needs Evidence Before Creative Development',
    summary: completeness === 100
      ? 'Creative Brief 已覆盖品牌身份、设计语言、情绪、Approved Brand DNA、创意边界与目标，可与已核验视觉方案一起交给 GPT 自主开展图片规划与生成。'
      : 'Creative Brief 结构完整，但仍有内容依赖待确认信息；补齐证据前不应把这些判断作为正式设计结论。',
    checks,
    strengths,
    openQuestions,
    risks: reasoning.designRisks
  };
}
