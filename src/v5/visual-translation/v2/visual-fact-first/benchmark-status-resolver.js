export const BENCHMARK_REQUIREMENTS = Object.freeze({
  total_usable: 6,
  same_industry: 2,
  same_business_model: 2,
  anti_template: 1
});

export function resolveBenchmarkRequirementStatus(cases = [], { providerHadResults = true } = {}) {
  const actual = {
    total_usable: cases.length,
    same_industry: cases.filter((item) => item.case_type === 'direct_industry').length,
    same_business_model: cases.filter((item) => item.case_type === 'business_model').length,
    anti_template: cases.filter((item) => item.case_type === 'anti_template').length
  };
  const requirement_status = Object.freeze(Object.fromEntries(
    Object.entries(BENCHMARK_REQUIREMENTS).map(([key, required]) => [key, Object.freeze({
      actual: actual[key], required, passed: actual[key] >= required
    })])
  ));
  const allPassed = Object.values(requirement_status).every((item) => item.passed);
  const status = !providerHadResults || !requirement_status.total_usable.passed
    ? 'failed'
    : allPassed ? 'completed' : 'partial';
  return Object.freeze({ status, requirement_status, all_passed: allPassed });
}

