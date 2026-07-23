import { evaluateSemantically } from '../semantic-evaluator.js';

const FABRICATED_CLAIM_KINDS = new Set([
  'capability',
  'certification',
  'regulatory_approval',
  'experimental_data',
  'medical_effect',
  'patent',
  'metric'
]);

export const PHASE_2_RULE_IDS = Object.freeze([
  'AP-BRAND-002',
  'AP-BRAND-003',
  'AP-BRAND-004',
  'AP-REP-003',
  'AP-PKG-001',
  'AP-PKG-002',
  'AP-DIR-001',
  'AP-DIR-003',
  'AP-DIR-005',
  'AP-ANC-001',
  'AP-ANC-003',
  'AP-DNA-001',
  'AP-GRA-001',
  'AP-REP-004',
  'AP-REP-006',
  'AP-DIR-006',
  'AP-DIR-007',
  'AP-ASSET-001',
  'AP-ASSET-002',
  'AP-AUD-001',
  'AP-DIR-008',
  'AP-GEN-005'
]);

export function createPhase2RuleDefinitions({ evaluator } = {}) {
  return [
    rule({
      id: 'AP-BRAND-002', name: '跨项目污染', scope: ['*'], severity: 'S4', ruleType: 'hybrid', basePenalty: 0,
      risk: '输出混入其他项目、品牌或行业资产，破坏品牌事实边界。',
      exceptions: ['明确声明并授权使用的跨项目参考资产'],
      repair: ['移除外部项目资产，并仅从当前项目已确认来源重新建立证据引用。'],
      detect: hybrid(evaluator, 'AP-BRAND-002', detectCrossProjectContamination)
    }),
    rule({
      id: 'AP-BRAND-003', name: '修改 Locked Assets', scope: ['*'], severity: 'S4', ruleType: 'deterministic', basePenalty: 0,
      risk: '未经授权修改品牌名称、Logo、行业、包装结构、主色或核心资产。',
      exceptions: ['用户明确授权修改指定 Locked Asset'],
      repair: ['恢复 Locked Asset 原值；如确需修改，先记录用户对具体资产的明确授权。'],
      detect: detectLockedAssetChanges
    }),
    rule({
      id: 'AP-BRAND-004', name: '虚构能力与资质', scope: ['*'], severity: 'S4', ruleType: 'hybrid', basePenalty: 0,
      risk: '输出暗示未获证据支持的能力、认证、监管批准、实验数据、医疗效果或专利。',
      exceptions: ['声明明确标记为未验证 Proposal 且不作为事实呈现'],
      repair: ['删除无证据事实声明，或降级为明确标注的 Proposal 并补充可追溯证据。'],
      detect: hybrid(evaluator, 'AP-BRAND-004', detectFabricatedClaims)
    }),
    rule({
      id: 'AP-REP-003', name: '评分与结论冲突', scope: ['report'], severity: 'S4', ruleType: 'deterministic', basePenalty: 0,
      risk: '损坏的评分、排名或状态仍被用于形成推荐结论。',
      exceptions: [],
      repair: ['修正评分、排序和候选状态的一致性；在数据有效前停止输出推荐结论。'],
      detect: detectScoreConclusionConflict
    }),
    rule({
      id: 'AP-PKG-001', name: '擅自修改盒型', scope: ['packaging'], severity: 'S4', ruleType: 'deterministic', basePenalty: 0,
      risk: '包装结构在无授权情况下被修改，导致生产和品牌资产失真。',
      exceptions: ['用户明确授权的包装结构探索'],
      repair: ['恢复已锁定包装结构，并把结构探索标记为需用户单独授权的 Proposal。'],
      detect: (context) => detectPackagingChange(context, 'structure', '包装结构')
    }),
    rule({
      id: 'AP-PKG-002', name: '为渲染效果修改版式', scope: ['packaging'], severity: 'S4', ruleType: 'deterministic', basePenalty: 0,
      risk: '为了渲染表现擅自移动或重排已锁定包装版式。',
      exceptions: ['用户明确授权的版式调整'],
      repair: ['恢复锁定版式，在不改变信息位置和层级的前提下调整渲染表现。'],
      detect: (context) => detectPackagingChange(context, 'layout', '包装版式')
    }),
    rule({
      id: 'AP-DIR-001', name: '伪差异方向', scope: ['visual_direction'], severity: 'S3', ruleType: 'hybrid', basePenalty: 12,
      risk: '方向名称不同，但轮廓、构图、图形机制、材质与情绪角色实际相同。',
      exceptions: [],
      repair: ['至少重建核心隐喻、构图逻辑与图形机制，使各方向形成独立视觉系统。'],
      detect: hybrid(evaluator, 'AP-DIR-001', detectFalseDirectionDifference)
    }),
    rule({
      id: 'AP-DIR-003', name: '推荐完全依赖分数', scope: ['visual_direction'], severity: 'S2', ruleType: 'deterministic', basePenalty: 6,
      risk: '最高分被自动推荐，缺少机会、代价、风险与战略判断。',
      exceptions: [],
      repair: ['补充机会、代价、风险和战略适配判断，再形成推荐结论。'],
      detect: detectScoreOnlyRecommendation
    }),
    rule({
      id: 'AP-DIR-005', name: 'B2B/B2C 错位', scope: ['visual_direction'], severity: 'S3', ruleType: 'semantic', basePenalty: 12,
      risk: '产业或企业服务品牌被转译为消费护肤、女性大片或生活方式品牌。',
      exceptions: ['品牌事实明确包含目标消费业务并授权该方向'],
      repair: ['恢复产业角色、业务关系和服务对象，使用与 B2B 品牌事实一致的视觉主体与场景。'],
      detect: semantic(evaluator, 'AP-DIR-005')
    }),
    rule({
      id: 'AP-ANC-001', name: '口号型 Anchor', scope: ['anchor_direction'], severity: 'S3', ruleType: 'hybrid', basePenalty: 12,
      risk: 'Anchor 只能表达营销态度，无法约束图形、构图、材质和光线。',
      exceptions: [],
      repair: ['将口号转化为可观察的图形关系、构图逻辑、材质行为和排除边界。'],
      detect: hybrid(evaluator, 'AP-ANC-001', detectSloganAnchor)
    }),
    rule({
      id: 'AP-ANC-003', name: '多 Anchor 竞争', scope: ['anchor_direction'], severity: 'S3', ruleType: 'deterministic', basePenalty: 12,
      risk: '多个同等级核心 Anchor 同时争夺系统控制权。',
      exceptions: [],
      repair: ['只保留一个 Primary Anchor，并将其他锚点降为最多两个 Supporting Anchors。'],
      detect: detectCompetingAnchors
    }),
    rule({
      id: 'AP-DNA-001', name: 'Logo + Color = DNA', scope: ['visual_dna'], severity: 'S3', ruleType: 'deterministic', basePenalty: 12,
      risk: 'Visual DNA 仅复述 Logo 与颜色，无法形成可继承的识别机制。',
      exceptions: [],
      repair: ['补充图形关系、构图、材质或动态等可继承 DNA 单元，并定义组合和变体规则。'],
      detect: detectLogoColorOnlyDna
    }),
    rule({
      id: 'AP-GRA-001', name: '形容词语法', scope: ['visual_grammar'], severity: 'S2', ruleType: 'hybrid', basePenalty: 6,
      risk: '形容词被当作完整 Visual Grammar，缺少可执行规则。',
      exceptions: [],
      repair: ['把形容词转换为 Allowed、Preferred、Avoid、Relationship 和 Variation Range。'],
      detect: hybrid(evaluator, 'AP-GRA-001', detectAdjectiveGrammar)
    }),
    rule({
      id: 'AP-REP-004', name: '语言污染', scope: ['report'], severity: 'S3', ruleType: 'hybrid', basePenalty: 12,
      risk: '报告大量混入无必要异语，显著降低可读性。',
      exceptions: ['必要的产品名、标准术语或用户要求保留的原文'],
      repair: ['统一报告主语言，仅保留必要术语，并为保留的异语提供清晰上下文。'],
      detect: hybrid(evaluator, 'AP-REP-004', detectLanguagePollution)
    }),
    rule({
      id: 'AP-REP-006', name: '风险联动失效', scope: ['report'], severity: 'S3', ruleType: 'deterministic', basePenalty: 12,
      risk: '风险等级、风险拆分、扣分与最终评分没有形成可验证的计算链。',
      exceptions: [],
      repair: ['补齐风险拆分、非零扣分和原因，并按 confidence_adjusted_score - risk_penalty 重新计算最终分。'],
      detect: detectRiskLinkFailure
    }),
    rule({
      id: 'AP-DIR-006', name: '弱证据推荐', scope: ['visual_direction'], severity: 'S2', ruleType: 'deterministic', basePenalty: 6,
      risk: '推断型或低置信度方向被推荐，但没有明确战略解释、风险提示和人工复核边界。',
      exceptions: [],
      repair: ['降低推断方向置信度，并在推荐中明确证据弱点、风险提示与人工复核要求。'],
      detect: detectWeakEvidenceRecommendation
    }),
    rule({
      id: 'AP-DIR-007', name: '机械差异矩阵', scope: ['visual_direction'], severity: 'S2', ruleType: 'deterministic', basePenalty: 6,
      risk: '差异矩阵仅比较字段字符串、缺少语义解释，或机械地为所有方向对给出满分。',
      exceptions: [],
      repair: ['按六个维度分别给出 0/1/2 语义评分与具体理由，并复核全部满分的方向对。'],
      detect: detectMechanicalDifferenceMatrix
    }),
    rule({
      id: 'AP-ASSET-001', name: '未授权母品牌资产', scope: ['visual_direction'], severity: 'S3', ruleType: 'deterministic', basePenalty: 12,
      risk: '未提供正式母品牌 VI 或明确授权，却把集团背书资产标记为当前可执行。',
      exceptions: ['正式 VI 资产已提供，且具有明确生成授权与证据引用'],
      repair: ['将资产改为 restricted，关闭 executable，要求人工批准并等待正式母品牌 VI。'],
      detect: detectUnauthorizedParentBrandAsset
    }),
    rule({
      id: 'AP-ASSET-002', name: '未批准 Logo 生成', scope: ['visual_direction'], severity: 'S3', ruleType: 'deterministic', basePenalty: 12,
      risk: '当前阶段把尚未批准的新 Logo 提案当作 Direction 可执行资产。',
      exceptions: ['已进入明确授权的 Identity Design 阶段'],
      repair: ['把 Logo 调整为 proposed、future_identity_design、executable=false，并要求人工批准。'],
      detect: detectUnapprovedLogoGeneration
    }),
    rule({
      id: 'AP-AUD-001', name: '人物政策映射冲突', scope: ['visual_direction'], severity: 'S2', ruleType: 'deterministic', basePenalty: 6,
      risk: '人物政策文本表达团队、伙伴、专家或生态参与者，但枚举却落入消费者角色。',
      exceptions: [],
      repair: ['依据人物文本重新映射 peopleRole；团队、伙伴、专家、生态参与者和员工不得映射为 consumer_auxiliary。'],
      detect: detectPeoplePolicyMappingConflict
    }),
    rule({
      id: 'AP-DIR-008', name: '差异矩阵满分偏差', scope: ['visual_direction'], severity: 'S2', ruleType: 'deterministic', basePenalty: 6,
      risk: '方向对被给出 12/12，但共享视觉特征或二次复核缺失；三组全部满分时属于系统性偏差。',
      exceptions: [],
      repair: ['补充共享视觉特征并执行二次复核；存在共性时降低相关维度评分，三组全部满分时重新校准矩阵。'],
      detect: detectDifferenceMatrixFullScoreBias
    }),
    rule({
      id: 'AP-GEN-005', name: 'Suggested Assets 失控', scope: ['visual_direction'], severity: 'S3', ruleType: 'hybrid', basePenalty: 12,
      risk: 'Suggested Assets 失去来源、授权、生命周期状态或执行范围控制。',
      exceptions: [],
      repair: ['为每项资产声明状态，移除执行范围中的 restricted 与 future identity 资产，并在使用前补齐可追溯品牌证据。'],
      detect: hybrid(evaluator, 'AP-GEN-005', detectSuggestedAssetsLossOfControl)
    })
  ];
}

function rule(definition) {
  return Object.freeze(definition);
}

function semantic(evaluator, ruleId) {
  return (context) => evaluateSemantically(evaluator, semanticRequest(ruleId, context));
}

function hybrid(evaluator, ruleId, deterministicDetector) {
  return async (context) => {
    const deterministicResult = deterministicDetector(context);
    if (deterministicResult !== null) return deterministicResult;
    return evaluateSemantically(evaluator, semanticRequest(ruleId, context));
  };
}

function semanticRequest(ruleId, context) {
  return {
    ruleId,
    module: context.module,
    output: context.output,
    metadata: context.metadata,
    brandContext: context.brand_context,
    sourceContext: context.source_context
  };
}

function detectCrossProjectContamination({ output, metadata, brand_context: brandContext }) {
  const currentProjectId = metadata.currentProjectId || metadata.project_id;
  const assets = Array.isArray(output?.assets) ? output.assets : null;
  const provenanceIds = Array.isArray(output?.provenance?.project_ids) ? output.provenance.project_ids : null;
  if (!currentProjectId || (!assets && !provenanceIds)) return null;
  const brandAllowed = brandContext?.allowed_project_ids?.status === 'available' ? brandContext.allowed_project_ids.value : [];
  const allowedProjectIds = new Set([currentProjectId, ...(metadata.allowedProjectIds || []), ...(brandAllowed || [])]);
  const foreignAssets = (assets || []).filter((asset) => asset?.project_id && !allowedProjectIds.has(asset.project_id));
  const foreignProvenance = (provenanceIds || []).filter((projectId) => projectId && !allowedProjectIds.has(projectId));
  const evidence = [
    ...foreignAssets.map((asset) => `资产 ${asset.id || asset.path || 'unknown'} 来自项目 ${asset.project_id}`),
    ...foreignProvenance.map((projectId) => `输出 provenance 引用了外部项目 ${projectId}`)
  ];
  return finding(evidence, '/assets', evidence.length);
}

function detectLockedAssetChanges({ output, metadata, brand_context: brandContext }) {
  const changes = Array.isArray(output?.asset_changes) ? output.asset_changes : [];
  const brandLocked = brandContext?.locked_assets?.status === 'available' ? brandContext.locked_assets.value : [];
  const lockedAssets = new Set(metadata.lockedAssets || brandLocked || []);
  const authorized = new Set(metadata.authorizedLockedAssetChanges || []);
  const violations = changes.filter((change) => lockedAssets.has(change?.asset) && change.authorized !== true && !authorized.has(change.asset));
  const evidence = violations.map((change) => `${change.asset} 从 ${display(change.before)} 被修改为 ${display(change.after)}`);
  return finding(evidence, '/asset_changes', violations.length);
}

function detectFabricatedClaims({ output }) {
  const claims = Array.isArray(output?.claims) ? output.claims : null;
  if (!claims) return null;
  const violations = claims.filter((claim) => FABRICATED_CLAIM_KINDS.has(claim?.kind)
    && claim.status !== 'proposal'
    && claim.verified !== true
    && (!Array.isArray(claim.evidence_ids) || claim.evidence_ids.length === 0));
  const evidence = violations.map((claim) => `${claim.kind}: ${claim.statement || '未提供声明内容'}（无证据引用）`);
  return finding(evidence, '/claims', violations.length);
}

function detectScoreConclusionConflict({ output }) {
  const scores = Array.isArray(output?.scores) ? output.scores : [];
  const recommendation = output?.recommendation;
  const ranking = Array.isArray(output?.ranking) ? output.ranking : [];
  const evidence = [];
  if (recommendation && scores.length > 0 && scores.every((item) => !Number.isFinite(item?.score) || item.score <= 0)) {
    evidence.push('所有候选分数均为 0 或无效，但报告仍输出推荐结论');
  }
  const recommendedId = recommendation?.direction_id || recommendation?.id;
  const recommended = scores.find((item) => item.id === recommendedId);
  if (recommendedId && (!recommended || recommended.status === 'rejected' || recommended.eligible === false)) {
    evidence.push(`推荐项 ${recommendedId} 不存在、已拒绝或不具备候选资格`);
  }
  if (ranking.length > 1 && scores.length > 1) {
    const scoreById = new Map(scores.map((item) => [item.id, item.score]));
    for (let index = 1; index < ranking.length; index += 1) {
      if ((scoreById.get(ranking[index - 1]) ?? -Infinity) < (scoreById.get(ranking[index]) ?? -Infinity)) {
        evidence.push(`排名 ${ranking[index - 1]} 在 ${ranking[index]} 之前，但分数更低`);
        break;
      }
    }
  }
  return finding(evidence, '/recommendation', evidence.length);
}

function detectPackagingChange({ output }, kind, label) {
  const changes = Array.isArray(output?.packaging_changes) ? output.packaging_changes : [];
  const violations = changes.filter((change) => change?.kind === kind && change.authorized !== true);
  const evidence = violations.map((change) => `${label} ${change.target || 'unknown'} 从 ${display(change.before)} 被修改为 ${display(change.after)}`);
  return finding(evidence, '/packaging_changes', violations.length);
}

function detectFalseDirectionDifference({ output }) {
  const directions = output?.visualCreativeDirections?.directions || output?.directions;
  if (!Array.isArray(directions) || directions.length < 2) return null;
  const fingerprints = directions.map((direction) => direction?.visual_fingerprint);
  const fields = ['silhouette', 'composition', 'graphic_mechanism', 'material_family', 'emotional_role'];
  if (fingerprints.some((fingerprint) => !fingerprint || fields.some((field) => fingerprint[field] === undefined))) return null;
  const signatures = fingerprints.map((fingerprint) => JSON.stringify(fields.map((field) => fingerprint[field])));
  const evidence = [];
  for (let index = 1; index < signatures.length; index += 1) {
    const priorIndex = signatures.indexOf(signatures[index]);
    if (priorIndex < index) evidence.push(`方向 ${priorIndex + 1} 与方向 ${index + 1} 的五项视觉指纹完全相同`);
  }
  return evidence.length > 0 ? finding(evidence, '/directions', evidence.length) : null;
}

function detectScoreOnlyRecommendation({ output }) {
  const recommendation = output?.recommendation;
  if (!recommendation) return false;
  const factors = recommendation.strategic_factors;
  const scoreOnly = recommendation.selection_method === 'highest_score'
    && (!factors || ['opportunities', 'costs', 'risks', 'strategic_fit'].every((key) => !Array.isArray(factors[key]) || factors[key].length === 0));
  return scoreOnly ? {
    evidence: ['recommendation.selection_method 为 highest_score，且机会、代价、风险和战略适配均为空'],
    location: { path: '/recommendation' }
  } : false;
}

function detectSloganAnchor({ output }) {
  if (output?.anchor_type === 'slogan') {
    return {
      evidence: ['anchor_type 明确标记为 slogan，无法作为视觉约束机制'],
      location: { path: '/anchor_type' }
    };
  }
  if (output?.anchor_type || Array.isArray(output?.visual_constraints)) return false;
  return null;
}

function detectCompetingAnchors({ output }) {
  const anchors = Array.isArray(output?.anchors) ? output.anchors : [];
  const primary = anchors.filter((anchor) => anchor?.role === 'primary' || anchor?.priority === 'primary');
  if (primary.length <= 1) return false;
  return {
    occurrenceCount: primary.length,
    evidence: primary.map((anchor, index) => `Primary Anchor ${anchor.id || anchor.name || index + 1} 与其他 Primary Anchor 同级竞争`),
    location: { path: '/anchors' }
  };
}

function detectLogoColorOnlyDna({ output }) {
  const units = output?.dna_units || output?.visual_dna?.units;
  if (!Array.isArray(units) || units.length === 0) return false;
  const categories = new Set(units.map((unit) => unit?.category).filter(Boolean));
  const logoColorOnly = categories.size > 0 && [...categories].every((category) => category === 'logo' || category === 'color');
  return logoColorOnly ? {
    evidence: [`Visual DNA 仅包含类别：${[...categories].join(', ')}`],
    location: { path: '/dna_units' }
  } : false;
}

function detectAdjectiveGrammar({ output }) {
  const grammarRules = output?.grammar_rules;
  if (!Array.isArray(grammarRules) || grammarRules.length === 0) return null;
  if (grammarRules.every((item) => item && typeof item === 'object' && item.kind === 'adjective')) {
    return {
      occurrenceCount: grammarRules.length,
      evidence: grammarRules.map((item) => `语法项“${item.value || item.name || '未命名'}”仅标记为 adjective，没有结构规则`),
      location: { path: '/grammar_rules' }
    };
  }
  if (grammarRules.every((item) => item && typeof item === 'object' && item.kind)) return false;
  return null;
}

function detectLanguagePollution({ output }) {
  const metadata = output?.report_language_metadata;
  const directionNames = Array.isArray(output?.direction_names) ? output.direction_names : [];
  const sections = Array.isArray(output?.sections) ? output.sections : [];
  // Legacy/foreign report adapters may only expose free-form sections. In that
  // case defer to the injected semantic evaluator instead of guessing a locale.
  if (!metadata && !directionNames.length) return null;
  const reportLanguage = metadata?.report_language || 'zh-CN';
  if (reportLanguage !== 'zh-CN') return false;
  const ratio = Number.isFinite(metadata?.primary_language_ratio) ? metadata.primary_language_ratio : chineseRatio(sections.join('\n'));
  const evidence = [];
  if (ratio < 0.9) evidence.push(`中文报告正文中文比例为 ${ratio}，低于 0.90`);
  for (const name of directionNames.filter((item) => typeof item === 'string' && !/\p{Script=Han}/u.test(item))) evidence.push(`Direction 正式名称“${name}”不含中文`);
  return finding(evidence, '/report_language_metadata', evidence.length);
}

function detectRiskLinkFailure({ output }) {
  const comparison = Array.isArray(output?.comparison) ? output.comparison : [];
  if (!comparison.length) return null;
  const usesPhase351Scoring = comparison.some((item) => Object.hasOwn(item, 'confidence_adjusted_score')
    || Object.hasOwn(item, 'risk_breakdown') || Object.hasOwn(item, 'risk_penalty'));
  if (!usesPhase351Scoring) return null;
  const evidence = [];
  for (const item of comparison) {
    const id = item.directionId || item.direction_id || 'unknown';
    const breakdown = item.risk_breakdown;
    const penalty = item.risk_penalty;
    const scoreValues = [item.raw_score, item.confidence_adjusted_score, item.final_score]
      .filter(Number.isFinite);
    if (scoreValues.some((score) => score > 100 || score < 0)
      || (scoreValues.some((score) => score > 1) && scoreValues.some((score) => score > 0 && score <= 1))) {
      evidence.push(`${id} mixes score scales or contains a score outside 0-100`);
    }
    if (!breakdown || !Number.isFinite(breakdown.risk_penalty_total)) {
      evidence.push(`${id} 缺少 risk_breakdown`);
      continue;
    }
    if (['medium', 'high'].includes(item.template_risk_level) && breakdown.template_risk_penalty === 0) evidence.push(`${id} 为 ${item.template_risk_level} 风险但模板扣分为 0`);
    if (breakdown.risk_penalty_total !== penalty) evidence.push(`${id} 的风险拆分合计与 risk_penalty 不一致`);
    const expectedFinal = Math.max(0, Number(item.confidence_adjusted_score) - Number(penalty));
    if (!Number.isFinite(item.final_score) || Math.abs(item.final_score - expectedFinal) > 0.11) evidence.push(`${id} 的 risk_penalty 未正确参与 final_score`);
    if (penalty > 0 && (!Array.isArray(item.penalty_reasons) || item.penalty_reasons.length === 0)) evidence.push(`${id} 有风险扣分但没有 penalty_reasons`);
  }
  return finding(evidence, '/comparison', evidence.length);
}

function detectWeakEvidenceRecommendation({ output }) {
  const recommendation = output?.recommendation;
  const directions = Array.isArray(output?.directions) ? output.directions : [];
  if (!recommendation || !directions.length) return null;
  const selected = directions.find((item) => item.id === recommendation.direction_id);
  if (!selected) return null;
  const weak = selected.reason_basis === 'inference' || selected.evidence_confidence < 0.75;
  if (!weak || recommendation.weak_evidence_warning === true) return false;
  return finding([`推荐方向 ${selected.id} 为 ${selected.reason_basis || 'unknown'}，证据置信度 ${selected.evidence_confidence ?? 'missing'}，但没有弱证据提示`], '/recommendation', 1);
}

function detectMechanicalDifferenceMatrix({ output }) {
  const matrix = output?.difference_matrix;
  const pairs = Array.isArray(matrix?.pairs) ? matrix.pairs : [];
  if (!matrix && !pairs.length) return null;
  const evidence = [];
  if (matrix?.evaluation_method === 'string_comparison') evidence.push('Difference Matrix 明确使用 string_comparison');
  for (const pair of pairs) {
    if (!Array.isArray(pair.dimensions) || pair.dimensions.some((item) => ![0, 1, 2].includes(item?.score) || typeof item?.reason !== 'string' || !item.reason.trim())) evidence.push(`${pair.direction_pair || 'unknown'} 缺少完整的 0/1/2 语义评分或解释`);
  }
  return finding(evidence, '/difference_matrix', evidence.length);
}

function suggestedAssets(output) {
  return Array.isArray(output?.suggested_assets) ? output.suggested_assets
    : Array.isArray(output?.suggestedAssets) ? output.suggestedAssets : null;
}

function detectUnauthorizedParentBrandAsset({ output }) {
  const assets = suggestedAssets(output);
  if (!assets) return null;
  const parentTypes = new Set(['parent_brand_logo', 'parent_child_logo_lockup', 'parent_brand_color', 'parent_brand_graphic', 'parent_brand_vi_spec']);
  const violations = assets.filter((asset) => {
    const type = asset?.assetType || asset?.asset_type;
    const name = String(asset?.name || asset?.asset || '');
    const parentAsset = parentTypes.has(type) || /(?:母品牌|集团).*(?:logo|标志|标准色|专用图形|vi|组合)/iu.test(name);
    const authorized = asset?.providedInSource === true && asset?.authorizedForGeneration === true
      && (asset?.authorizationEvidenceIds?.length || asset?.authorization_evidence_ids?.length);
    return parentAsset && asset?.executable === true && !authorized;
  });
  return finding(violations.map((asset) => `${asset.assetId || asset.id || asset.name || 'unknown'} 缺少母品牌 VI 或授权，但 executable=true`), '/suggested_assets', violations.length);
}

function detectUnapprovedLogoGeneration({ output, metadata }) {
  const assets = suggestedAssets(output);
  if (!assets) return null;
  if (metadata?.stage === 'identity_design' || metadata?.module === 'identity_design') return false;
  const violations = assets.filter((asset) => {
    const type = asset?.assetType || asset?.asset_type;
    const name = String(asset?.name || asset?.asset || '');
    const isLogo = type === 'brand_logo' || /(?:品牌|brand)?\s*(?:logo|标志)$/iu.test(name.trim());
    return isLogo && asset?.status === 'proposed'
      && (asset?.executable === true || asset?.execution_scope === 'current_direction');
  });
  return finding(violations.map((asset) => `${asset.assetId || asset.id || asset.name || 'unknown'} 是未批准 Logo 提案，却进入当前 Direction 执行范围`), '/suggested_assets', violations.length);
}

function peopleRoleFromText(value) {
  const text = String(value || '').normalize('NFKC').toLowerCase();
  if (/(?:生态参与者|生态成员|ecosystem participant|ecosystem member)/u.test(text)) return 'ecosystem_participant';
  if (/(?:行业专家|专业人士|专业人员|industry expert|industry professional|business professional|specialist)/u.test(text)) return 'industry_expert';
  if (/(?:合作伙伴|伙伴团队|合作团队|partner team|partner staff|partners?)/u.test(text)) return 'partner_team';
  if (/(?:员工|内部团队|工作人员|staff|employee|internal team)/u.test(text)) return 'staff_auxiliary';
  return null;
}

function detectPeoplePolicyMappingConflict({ output }) {
  const directions = Array.isArray(output?.directions) ? output.directions : null;
  if (!directions) return null;
  const violations = directions.flatMap((direction) => {
    const policy = direction?.subject_policy || direction?.subjectPolicy;
    const text = policy?.people;
    const role = policy?.peopleRole || policy?.people_role;
    const expected = peopleRoleFromText(text);
    if (!expected || expected === role) return [];
    return [`${direction.id || direction.directionId || 'unknown'} 人物文本应映射为 ${expected}，实际为 ${role || 'missing'}`];
  });
  return finding(violations, '/directions/*/subject_policy', violations.length);
}

function detectDifferenceMatrixFullScoreBias({ output }) {
  const matrix = output?.difference_matrix || output?.differenceMatrix;
  const pairs = Array.isArray(matrix?.pairs) ? matrix.pairs : null;
  if (!pairs) return null;
  const fullScorePairs = pairs.filter((pair) => pair?.total_score === 12);
  if (!fullScorePairs.length) return false;
  const allFullScore = pairs.length === 3 && fullScorePairs.length === 3;
  const evidence = fullScorePairs.flatMap((pair) => {
    const traits = pair.shared_visual_traits;
    const missingTraits = !Array.isArray(traits) || traits.length === 0;
    const missingReview = pair.full_difference_review_required !== true || !String(pair.review_result || '').trim();
    if (!missingTraits && !missingReview && !allFullScore) return [];
    return [`${pair.direction_pair || 'unknown'} 为 12/12，但${[missingTraits ? '共享视觉特征为空' : '', missingReview ? '二次复核未完成' : '', allFullScore ? '三组方向对全部满分' : ''].filter(Boolean).join('、')}`];
  });
  if (!evidence.length) return false;
  return {
    evidence,
    occurrenceCount: fullScorePairs.length,
    location: { path: '/difference_matrix/pairs' },
    ...(allFullScore ? { severity: 'S3', basePenalty: 9 } : {})
  };
}

function detectSuggestedAssetsLossOfControl({ output }) {
  const assets = suggestedAssets(output);
  if (!assets) return null;
  const evidence = [];
  const byId = new Map();

  assets.forEach((asset, index) => {
    if (!asset || typeof asset !== 'object') {
      evidence.push(`Suggested Asset at index ${index} has no structured lifecycle state`);
      return;
    }
    const id = asset.assetId || asset.asset_id || asset.id || `index-${index}`;
    byId.set(id, asset);
    if (!['existing', 'derived', 'proposed', 'restricted'].includes(asset.status)) {
      evidence.push(`${id} does not declare a valid asset status`);
    }
    if (asset.status === 'proposed' && asset.executable === true) {
      evidence.push(`${id} is proposed but incorrectly marked executable`);
    }
    if (['derived', 'proposed'].includes(asset.status)
      && !hasEvidence(asset)
      && asset.providedInSource !== true) {
      evidence.push(`${id} is a new asset with no relation to brand evidence`);
    }
  });

  if (assets.length > 12) evidence.push(`Suggested Assets contains ${assets.length} items, exceeding the calibration threshold of 12`);

  const directions = Array.isArray(output?.directions) ? output.directions : [];
  for (const direction of directions) {
    const ids = Array.isArray(direction?.executable_asset_ids) ? direction.executable_asset_ids : [];
    for (const id of ids) {
      const asset = byId.get(id);
      if (!asset) continue;
      if (asset.status === 'restricted') evidence.push(`${id} is restricted but appears in executable_asset_ids`);
      if (asset.execution_scope === 'future_identity_design' || asset.execution_scope === 'restricted') {
        evidence.push(`${id} is scoped to ${asset.execution_scope} but is used by the current Direction`);
      }
    }
  }

  return evidence.length > 0 ? finding(evidence, '/suggested_assets', evidence.length) : null;
}

function hasEvidence(asset) {
  return [asset.evidence_ids, asset.evidenceIds, asset.sourceEvidenceIds, asset.source_evidence_ids]
    .some((ids) => Array.isArray(ids) && ids.length > 0);
}

function chineseRatio(value) {
  const text = String(value || '').replace(/`[^`]*`/g, '').replace(/\b(?:D\d{2}|VE\d{3}|VS\d{2}|B2B|B2C|JSON|ID)\b/g, '');
  const cjk = text.match(/\p{Script=Han}/gu)?.length || 0;
  const latin = text.match(/[A-Za-z]/g)?.length || 0;
  return cjk + latin ? cjk / (cjk + latin) : 1;
}

function finding(evidence, path, occurrenceCount) {
  if (evidence.length === 0) return false;
  return {
    evidence,
    occurrenceCount: Math.max(1, occurrenceCount),
    location: { path }
  };
}

function display(value) {
  if (value === undefined) return '未提供';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
