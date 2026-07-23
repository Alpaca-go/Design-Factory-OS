import { validateBenchmarkCase } from './schemas.js';
import { createRetrievalTransport } from './retrieval-transport.js';
import { resolveBenchmarkRequirementStatus } from './benchmark-status-resolver.js';

const MINIMUM_CASES = Object.freeze({ total: 6, direct_industry: 2, business_model: 2, anti_template: 1 });

const canonicalUrl = (value) => {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|ref$)/iu.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/u, '');
  } catch { return String(value || '').trim(); }
};

function failureReason(error, resultCount = 0) {
  if (!error && resultCount === 0) return 'empty_response';
  if (/timeout|timed.?out/iu.test(`${error?.code || ''} ${error?.message || ''}`)) return 'timeout';
  if (/network|fetch|socket|timeout/iu.test(`${error?.code || ''} ${error?.message || ''}`)) return 'network_error';
  if (/provider|unavailable|not.?configured/iu.test(`${error?.code || ''} ${error?.message || ''}`)) return 'provider_unavailable';
  if (/parse|json|schema|valid/iu.test(`${error?.code || ''} ${error?.message || ''}`)) return 'parser_error';
  return error ? 'unknown' : null;
}

function fallbackQueries(queries) {
  const seed = queries.map((item) => item.query).filter(Boolean).join(' ');
  const compact = seed.split(/\s+/u).filter(Boolean).slice(0, 8).join(' ');
  return [
    { category: 'business_model', query: `${compact} 商业模式 品牌设计`, fallback_round: 1 },
    { category: 'touchpoint', query: `${compact} 触点 视觉系统`, fallback_round: 2 },
    { category: 'anti_template', query: `${compact} 跨行业 相同视觉机制`, fallback_round: 3 },
    { category: 'cross_industry', query: '品牌设计 视觉机制 触点系统', fallback_round: 4 }
  ];
}

function providerName(retriever) {
  return retriever?.provider || retriever?.providerName || retriever?.name || 'custom_retriever';
}

export async function retrieveBenchmarkCases({
  queryPlan, retriever, seedCases = [], signal,
  transportOptions = {}
}) {
  const initialQueries = Object.entries(queryPlan)
    .filter(([, value]) => Array.isArray(value))
    .flatMap(([category, values]) => values.map((item) => ({ ...item, category, fallback_round: 0 })));
  const raw = [...seedCases];
  const queryErrors = [];
  const diagnostics = [];
  const transport = typeof retriever === 'function'
    ? createRetrievalTransport(retriever, { signal, ...transportOptions })
    : null;

  const runQueries = async (queries) => {
    let added = 0;
    for (const [queryIndex, item] of queries.entries()) {
      if (signal?.aborted) throw new DOMException('User cancelled benchmark retrieval', 'AbortError');
      const diagnostic = {
        query_id: `BQ-${item.fallback_round || 0}-${String(queryIndex + 1).padStart(2, '0')}`,
        query: item.query, provider: providerName(retriever), fallback_round: item.fallback_round || 0,
        request_started_at: new Date().toISOString(),
        request_completed_at: null,
        request_status: 'success', response_status: 200,
        raw_result_count: 0, parsed_result_count: 0, filtered_result_count: 0,
        deduped_result_count: 0, usable_result_count: 0,
        result_count: 0, filter_count: 0, dedupe_count: 0, usable_count: 0,
        failure_reason: null
      };
      try {
        const executed = await transport.execute(item, {
          queryId: diagnostic.query_id,
          fallbackRound: item.fallback_round || 0
        });
        const found = executed.results;
        if (executed.error && executed.exhausted) throw executed.error;
        const list = Array.isArray(found) ? found : [];
        diagnostic.provider = executed.provider || diagnostic.provider;
        diagnostic.response_status = Number(executed.transport?.response_status || 200);
        diagnostic.raw_result_count = list.length;
        diagnostic.result_count = list.length;
        diagnostic.failure_reason = failureReason(null, list.length);
        const parsed = [];
        for (const candidate of list) {
          try { parsed.push(validateBenchmarkCase(candidate, parsed.length)); } catch { /* diagnostic count only */ }
        }
        diagnostic.parsed_result_count = parsed.length;
        const relevant = parsed.filter((candidate) => candidate.relevance_score >= 0.6);
        diagnostic.filtered_result_count = relevant.length;
        const localKeys = new Set(relevant.map((candidate) => canonicalUrl(candidate.source_url).toLocaleLowerCase('en-US') || candidate.case_name.toLocaleLowerCase('en-US')));
        diagnostic.deduped_result_count = localKeys.size;
        diagnostic.usable_result_count = localKeys.size;
        diagnostic.filter_count = Math.max(0, list.length - relevant.length);
        diagnostic.dedupe_count = Math.max(0, relevant.length - localKeys.size);
        diagnostic.usable_count = localKeys.size;
        raw.push(...list);
        added += list.length;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        diagnostic.request_status = failureReason(error) === 'timeout' ? 'timeout' : 'failed';
        diagnostic.response_status = Number(error?.status || 0) || undefined;
        diagnostic.failure_reason = failureReason(error);
        queryErrors.push(Object.freeze({
          query: item.query, code: error?.code || 'BENCHMARK_QUERY_FAILED',
          message: error?.message || String(error), failure_reason: diagnostic.failure_reason
        }));
      }
      diagnostic.request_completed_at = new Date().toISOString();
      diagnostics.push(diagnostic);
    }
    return added;
  };

  if (transport) {
    await transport.healthCheck();
    const firstRoundCount = await runQueries(initialQueries);
    if (firstRoundCount === 0 && seedCases.length === 0 && transport.hasAvailableProvider()) {
      const queries = fallbackQueries(initialQueries);
      transport.state.query_fallback_count += queries.length;
      await runQueries(queries);
    }
  }

  const byCanonicalCase = new Map();
  let parserFailures = 0;
  for (const item of raw) {
    let normalized;
    try {
      normalized = validateBenchmarkCase(item, byCanonicalCase.size);
    } catch {
      parserFailures += 1;
      continue;
    }
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
  const relevantCases = cases.filter((item) => item.relevance_score >= 0.6);
  const boundedCases = relevantCases.slice(0, 12);
  const categoryCounts = Object.fromEntries(['direct_industry', 'business_model', 'tone_price', 'anti_template'].map((category) => [category, boundedCases.filter((item) => item.case_type === category).length]));
  const providerHadResults = raw.length > 0 || seedCases.length > 0;
  const benchmarkRequirements = resolveBenchmarkRequirementStatus(boundedCases, { providerHadResults });
  const minimumMet = benchmarkRequirements.all_passed;
  diagnostics.forEach((item) => {
    if (!item.failure_reason && item.raw_result_count > 0 && item.usable_result_count === 0) item.failure_reason = 'all_results_filtered';
  });
  const noCasesReason = parserFailures && parserFailures === raw.length ? 'parser_error'
    : diagnostics.find((item) => item.failure_reason)?.failure_reason
      || (boundedCases.length ? null : 'empty_response');
  const retrievalStatus = typeof retriever !== 'function' && !seedCases.length
    ? 'not_configured'
    : benchmarkRequirements.status;
  return Object.freeze({
    schema_version: 'benchmark-retrieval-v2',
    retrieval_status: retrievalStatus,
    query_count: diagnostics.length || initialQueries.length,
    initial_query_count: initialQueries.length,
    fallback_query_count: diagnostics.filter((item) => item.fallback_round > 0).length,
    fallback_round_count: Math.max(0, ...diagnostics.map((item) => item.fallback_round || 0)),
    result_count: raw.length,
    relevant_count: relevantCases.length,
    category_counts: Object.freeze(categoryCounts),
    minimum_case_requirements: MINIMUM_CASES,
    minimum_case_requirements_met: minimumMet,
    requirement_status: benchmarkRequirements.requirement_status,
    failure_reason: retrievalStatus === 'failed' ? noCasesReason : null,
    failure_stage: retrievalStatus === 'failed'
      ? diagnostics.some((item) => ['failed', 'timeout'].includes(item.request_status)) ? 'provider_request'
        : parserFailures ? 'parsing' : raw.length ? 'filtering' : 'provider_response'
      : null,
    provider_health: Object.freeze((transport?.providerHealth || []).map((item) => Object.freeze({ ...item }))),
    transport_diagnostics: Object.freeze((transport?.transportDiagnostics || []).map((item) => Object.freeze({ ...item }))),
    fallback_state: Object.freeze({
      provider_fallback_count: transport?.state.provider_fallback_count || 0,
      query_fallback_count: transport?.state.query_fallback_count || 0,
      providers_tried: Object.freeze([...(transport?.state.providers_tried || [])]),
      queries_tried: Object.freeze([...(transport?.state.queries_tried || [])])
    }),
    query_diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze({ ...item }))),
    query_errors: Object.freeze(queryErrors),
    cases: Object.freeze(boundedCases)
  });
}
