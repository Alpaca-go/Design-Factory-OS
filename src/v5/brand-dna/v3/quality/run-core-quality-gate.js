const SUPERLATIVES = /行业(?:最高|第一)|唯一|最强|绝对领先|全国领先/;
const POSITIONING_WORDS = /领航者|领导者|赋能者|第一|标杆|最具价值/;
const BUSINESS_ROLE_WORDS = /平台|供应链|服务商|解决方案|生态连接者|渠道/;
const CUSTOMER_RESULT_WORDS = /获得|降低|提升|减少|确保|解决|支持|体验/;
const CAPABILITY_WORDS = /网络|体系|资质|技术|渠道|资源|流程|团队|系统|仓储|物流|温控|温层|供应链|组织/;
const BRAND_TASK_WORDS = /构建.{0,8}(?:网络|平台)|打造.{0,8}(?:生态|平台)|提升品牌影响力/;
const DESIGN_USE_CASE_WORDS = /海报|包装设计|视觉设计|品牌视觉|画册|KV|界面设计|设计应用/;
const GENERIC_VISUAL = /^(?:医疗蓝|生态绿|网格|流线|科技|玻璃|渐变|科技渐变)$/;

function issue(code, path, message, patchable = false) {
  return { code, path, message, patchable };
}

function bigrams(value) {
  const normalized = String(value || '').replace(/[\s，。；、：,.!！?？]/g, '');
  return new Set(Array.from({ length: Math.max(0, normalized.length - 1) }, (_, index) => normalized.slice(index, index + 2)));
}

function similarity(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((item) => b.has(item)).length;
  return overlap / new Set([...a, ...b]).size;
}

export function runCoreQualityGate(decision, evidenceMap, options = {}) {
  const issues = [];
  const warnings = [...(decision.normalization?.warnings || [])];
  const deterministicFixes = [...(decision.normalization?.deterministicFixes || [])];
  if (POSITIONING_WORDS.test(decision.identity.industry)) issues.push(issue('IDENTITY_INDUSTRY_POSITIONING_MIXED', '/identity/industry', '行业字段混入商业角色或定位措辞', true));
  if (!BUSINESS_ROLE_WORDS.test(decision.identity.businessRole)) issues.push(issue('IDENTITY_BUSINESS_ROLE_MISSING', '/identity/businessRole', '商业角色缺少平台、供应链、服务商等价值链角色', true));
  if (!decision.identity.brandPositioning?.trim()) issues.push(issue('IDENTITY_POSITIONING_MISSING', '/identity/brandPositioning', '品牌定位不能为空', true));
  if (!decision.audiences.some((item) => item.priority === 'primary')) issues.push(issue('AUDIENCE_PRIMARY_MISSING', '/audiences/0/priority', '至少需要一个 Primary Audience', true));
  decision.audiences.forEach((audience, audienceIndex) => {
    audience.needs.forEach((item, itemIndex) => {
      if (item.status !== 'missing' && (!CUSTOMER_RESULT_WORDS.test(item.statement) || BRAND_TASK_WORDS.test(item.statement))) issues.push(issue('AUDIENCE_NEED_NOT_CUSTOMER_RESULT', `/audiences/${audienceIndex}/needs/${itemIndex}/statement`, 'Need 必须从客户获得的结果表达', true));
    });
    audience.useCases.forEach((item, itemIndex) => {
      if (DESIGN_USE_CASE_WORDS.test(item.statement)) issues.push(issue('AUDIENCE_USE_CASE_IS_DESIGN_APPLICATION', `/audiences/${audienceIndex}/useCases/${itemIndex}/statement`, '设计应用场景不能作为用户 Use Case', true));
    });
  });
  const evidenceText = evidenceMap.evidence.map((item) => `${item.statement} ${item.quote}`).join('\n');
  const inspectClaims = [decision.identity.brandPositioning, ...decision.strategy.valuePropositions, ...decision.strategy.differentiators, ...decision.genes.map((item) => item.statement)];
  inspectClaims.forEach((claim, index) => { if (SUPERLATIVES.test(claim) && !evidenceText.includes(claim.match(SUPERLATIVES)?.[0] || '')) issues.push(issue('UNSUPPORTED_SUPERLATIVE', `/claims/${index}`, `无证据最高级：${claim}`)); });
  const functionalIndex = decision.genes.findIndex((gene) => gene.type === 'functional');
  const capabilityIndex = decision.genes.findIndex((gene) => gene.type === 'capability');
  const functional = decision.genes[functionalIndex];
  const capability = decision.genes[capabilityIndex];
  if (!CUSTOMER_RESULT_WORDS.test(functional.statement) || (CAPABILITY_WORDS.test(functional.statement.slice(0, 12)) && !CUSTOMER_RESULT_WORDS.test(functional.statement.slice(0, 24)))) issues.push(issue('GENE_FUNCTIONAL_IS_CAPABILITY', `/genes/${functionalIndex}/statement`, 'Functional 必须描述客户结果，不能以资源或基础能力为主体', true));
  if (!CAPABILITY_WORDS.test(capability.statement)) issues.push(issue('GENE_CAPABILITY_FOUNDATION_MISSING', `/genes/${capabilityIndex}/statement`, 'Capability 必须包含支撑交付的系统、资源、资质或组织能力', true));
  if (similarity(functional.statement, capability.statement) >= 0.62) issues.push(issue('GENE_FUNCTIONAL_CAPABILITY_OVERLAP', `/genes/${functionalIndex}/statement`, 'Functional 与 Capability 语义高度重叠', true));
  const cultural = decision.genes.find((gene) => gene.type === 'cultural');
  if (!cultural?.maturity || cultural.maturity === 'not-applicable') issues.push(issue('CULTURAL_MATURITY_MISSING', `/genes/${decision.genes.indexOf(cultural)}/maturity`, 'Cultural Gene 必须标记成熟度', true));
  if (['declared', 'aspirational'].includes(cultural?.maturity) && cultural.confidence === 'high') issues.push(issue('CULTURAL_MATURITY_OVERCLAIMED', `/genes/${decision.genes.indexOf(cultural)}/confidence`, '声明或愿景阶段的文化基因默认不得为高置信度', true));
  const coverage = decision.creativeThesis.coverage;
  const total = Object.values(coverage).reduce((sum, value) => sum + value, 0);
  for (const key of ['capability', 'relationship', 'emotion', 'differentiation']) if (coverage[key] < 3) issues.push(issue('THESIS_COVERAGE_LOW', `/creativeThesis/coverage/${key}`, `${key} 覆盖度低于 3`, true));
  if (total < 16) issues.push(issue('THESIS_COVERAGE_TOTAL_LOW', '/creativeThesis/coverage', '创意命题总覆盖度低于 16/25', true));
  if (decision.creativeThesis.isExistingSloganReuse) issues.push(issue('THESIS_REUSES_SLOGAN', '/creativeThesis/statement', '创意命题不能直接复用原 Slogan', true));
  if (!decision.visualMechanisms.some((item) => item.genericRisk !== 'high' && !GENERIC_VISUAL.test(item.name) && item.description.length >= 12)) issues.push(issue('VISUAL_MECHANISM_GENERIC', '/visualMechanisms/0', '至少需要一个具有品牌专属性和因果描述的视觉机制', true));
  const hardIssues = issues.filter((item) => !item.patchable);
  const status = issues.length ? 'failed' : warnings.length || deterministicFixes.length ? 'passed-with-warnings' : 'passed';
  return Object.freeze({ passed: issues.length === 0, status, requiresPatch: issues.some((item) => item.patchable), issues, hardIssues, warnings, deterministicFixes, patchUsed: Boolean(options.patchUsed), checkedAt: new Date().toISOString() });
}
