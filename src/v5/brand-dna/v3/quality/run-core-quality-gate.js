const SUPERLATIVES = /行业(?:最高|第一)|唯一|最强|绝对领先|全国领先/;
const ROLE_WORDS = /领航者|领导者|赋能者|第一|标杆/;
const GENERIC_VISUAL = /^(?:医疗蓝|生态绿|网格|流线|玻璃|实验室|科技渐变)$/;

function issue(code, path, message, patchable = false) {
  return { code, path, message, patchable };
}

export function runCoreQualityGate(decision, evidenceMap) {
  const issues = [];
  if (ROLE_WORDS.test(decision.identity.industry)) issues.push(issue('IDENTITY_CLASSIFICATION_MIXED', '/identity/industry', '行业字段混入商业角色或定位措辞', true));
  const evidenceText = evidenceMap.evidence.map((item) => `${item.statement} ${item.quote}`).join('\n');
  const inspectClaims = [decision.identity.brandPositioning, ...decision.strategy.valuePropositions, ...decision.strategy.differentiators, ...decision.genes.map((item) => item.statement)];
  inspectClaims.forEach((claim, index) => { if (SUPERLATIVES.test(claim) && !evidenceText.includes(claim.match(SUPERLATIVES)?.[0] || '')) issues.push(issue('UNSUPPORTED_SUPERLATIVE', `/claims/${index}`, `无证据最高级：${claim}`)); });
  const functional = decision.genes.find((gene) => gene.type === 'functional');
  const capability = decision.genes.find((gene) => gene.type === 'capability');
  if (functional?.statement === capability?.statement) issues.push(issue('GENE_FUNCTIONAL_CAPABILITY_OVERLAP', '/genes', 'Functional 必须描述客户结果，Capability 必须描述交付能力'));
  const coverage = decision.creativeThesis.coverage;
  const total = Object.values(coverage).reduce((sum, value) => sum + value, 0);
  for (const key of ['capability', 'relationship', 'emotion', 'differentiation']) if (coverage[key] < 3) issues.push(issue('THESIS_COVERAGE_LOW', `/creativeThesis/coverage/${key}`, `${key} 覆盖度低于 3`, true));
  if (total < 16) issues.push(issue('THESIS_COVERAGE_TOTAL_LOW', '/creativeThesis/coverage', '创意命题总覆盖度低于 16/25', true));
  if (decision.creativeThesis.isExistingSloganReuse) issues.push(issue('THESIS_REUSES_SLOGAN', '/creativeThesis/statement', '创意命题不能直接复用原 Slogan', true));
  if (!decision.visualMechanisms.some((item) => item.genericRisk !== 'high' && !GENERIC_VISUAL.test(item.name))) issues.push(issue('VISUAL_MECHANISM_GENERIC', '/visualMechanisms', '至少需要一个具有品牌专属性的视觉机制', true));
  const hardIssues = issues.filter((item) => !item.patchable);
  return Object.freeze({ passed: issues.length === 0, requiresPatch: issues.some((item) => item.patchable), issues, hardIssues, checkedAt: new Date().toISOString() });
}
