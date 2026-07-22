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
  if (typeof retriever === 'function') {
    for (const item of queries) {
      if (signal?.aborted) throw new DOMException('User cancelled benchmark retrieval', 'AbortError');
      const found = await retriever(item, { signal });
      if (Array.isArray(found)) raw.push(...found);
    }
  }
  const seen = new Set();
  const cases = [];
  for (const item of raw) {
    const normalized = validateBenchmarkCase(item, cases.length);
    const key = canonicalUrl(normalized.source_url).toLocaleLowerCase('en-US') || normalized.case_name.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    cases.push({ ...normalized, source_url: canonicalUrl(normalized.source_url) });
  }
  cases.sort((left, right) => right.relevance_score - left.relevance_score || left.case_name.localeCompare(right.case_name));
  const boundedCases = cases.slice(0, 20);
  return Object.freeze({
    schema_version: 'benchmark-retrieval-v1',
    retrieval_status: typeof retriever === 'function' ? 'completed' : (seedCases.length ? 'fixture' : 'not_configured'),
    query_count: queries.length,
    result_count: raw.length,
    relevant_count: boundedCases.filter((item) => item.relevance_score >= 0.6).length,
    cases: Object.freeze(boundedCases)
  });
}
