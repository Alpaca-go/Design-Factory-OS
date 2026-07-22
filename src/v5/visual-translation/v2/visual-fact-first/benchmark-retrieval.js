import { validateBenchmarkCase } from './schemas.js';

const canonicalUrl = (value) => {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|ref$)/iu.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/u, '');
  } catch { return String(value || '').trim(); }
};

export async function retrieveBenchmarkCases({ queryPlan, retriever, seedCases = [], signal }) {
  const queries = Object.entries(queryPlan).filter(([, value]) => Array.isArray(value)).flatMap(([category, values]) => values.map((item) => ({ ...item, category })));
  const raw = [...seedCases];
  const queryErrors = [];
  if (typeof retriever === 'function') {
    for (const item of queries) {
      if (signal?.aborted) throw new DOMException('User cancelled benchmark retrieval', 'AbortError');
      try {
        const found = await retriever(item, { signal });
        if (Array.isArray(found)) raw.push(...found);
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        queryErrors.push(Object.freeze({ query: item.query, code: error?.code || 'BENCHMARK_QUERY_FAILED', message: error?.message || String(error) }));
      }
    }
  }
  const byCanonicalCase = new Map();
  for (const item of raw) {
    const normalized = validateBenchmarkCase(item, byCanonicalCase.size);
    const key = canonicalUrl(normalized.source_url).toLocaleLowerCase('en-US') || normalized.case_name.toLocaleLowerCase('en-US');
    const existing = byCanonicalCase.get(key);
    if (existing) {
      existing.source_urls = [...new Set([...existing.source_urls, ...normalized.source_urls.map(canonicalUrl)])];
      existing.relevant_touchpoints = [...new Set([...existing.relevant_touchpoints, ...normalized.relevant_touchpoints])];
      existing.useful_visual_mechanisms = [...new Set([...existing.useful_visual_mechanisms, ...normalized.useful_visual_mechanisms])];
      existing.template_risks = [...new Set([...existing.template_risks, ...normalized.template_risks])];
      existing.relevance_score = Math.max(existing.relevance_score, normalized.relevance_score);
      existing.business_model_match = Math.max(existing.business_model_match, normalized.business_model_match);
      existing.visual_evidence_available ||= normalized.visual_evidence_available;
      continue;
    }
    byCanonicalCase.set(key, { ...normalized, source_url: canonicalUrl(normalized.source_url), source_urls: normalized.source_urls.map(canonicalUrl) });
  }
  const cases = [...byCanonicalCase.values()].map((item, index) => ({ ...item, case_id: item.case_id || `BC${String(index + 1).padStart(3, '0')}` }));
  cases.sort((left, right) => right.relevance_score - left.relevance_score || left.case_name.localeCompare(right.case_name));
  const boundedCases = cases.filter((item) => item.relevance_score >= 0.6).slice(0, 12);
  const categoryCounts = Object.fromEntries(['direct_industry', 'business_model', 'tone_price', 'anti_template'].map((category) => [category, boundedCases.filter((item) => item.case_type === category).length]));
  return Object.freeze({
    schema_version: 'benchmark-retrieval-v1',
    retrieval_status: typeof retriever === 'function'
      ? (queryErrors.length === queries.length ? 'failed' : queryErrors.length ? 'partial' : 'completed')
      : (seedCases.length ? 'fixture' : 'not_configured'),
    query_count: queries.length,
    result_count: raw.length,
    relevant_count: boundedCases.filter((item) => item.relevance_score >= 0.6).length,
    category_counts: Object.freeze(categoryCounts),
    minimum_case_requirements_met: categoryCounts.direct_industry >= 3 && categoryCounts.business_model >= 3 && categoryCounts.tone_price >= 2 && categoryCounts.anti_template >= 2,
    query_errors: Object.freeze(queryErrors),
    cases: Object.freeze(boundedCases)
  });
}
