type SearchQuery = {
  query: string;
  purpose: string;
  expected_case_type?: string;
  exclusion_terms?: string[];
  priority?: 'high' | 'medium' | 'low';
  category?: string;
};

type FetchLike = typeof fetch;
type RetrieverResult = Array<Record<string, unknown>> & {
  transport?: Record<string, unknown>;
};
type ProviderRetriever = ((query: SearchQuery, options?: { signal?: AbortSignal }) => Promise<RetrieverResult>) & {
  provider: string;
  endpoint: string;
  method: 'GET';
  timeoutMs: number;
  healthCheck: (options?: { signal?: AbortSignal }) => Promise<Record<string, unknown>>;
};
type CompositeRetriever = ((query: SearchQuery, options?: { signal?: AbortSignal }) => Promise<RetrieverResult>) & {
  provider: string;
  providers: ProviderRetriever[];
};

const decodeHtml = (value: string): string => value
  .replace(/<[^>]+>/gu, ' ')
  .replace(/&amp;/gu, '&')
  .replace(/&quot;/gu, '"')
  .replace(/&#39;|&apos;/gu, "'")
  .replace(/&lt;/gu, '<')
  .replace(/&gt;/gu, '>')
  .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/\s+/gu, ' ')
  .trim();

function unwrapDuckDuckGoUrl(value: string): string {
  const decoded = decodeHtml(value);
  try {
    const url = new URL(decoded, 'https://html.duckduckgo.com');
    const target = url.searchParams.get('uddg');
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return decoded;
  }
}

export function parseBenchmarkSearchHtml(html: string, query: SearchQuery): Array<Record<string, unknown>> {
  const links = [...html.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/giu)];
  const snippets = [...html.matchAll(/<(?:a|div)[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/giu)];
  const caseType = query.expected_case_type || query.category?.replace(/_queries$/u, '') || 'cross_industry';
  return links.slice(0, 3).map((match, index) => {
    const title = decodeHtml(match[2] ?? '');
    const snippet = decodeHtml(snippets[index]?.[1] || '');
    const relevance = Math.max(0.62, 0.86 - index * 0.08 + (query.priority === 'high' ? 0.05 : 0));
    return {
      case_name: title,
      source_url: unwrapDuckDuckGoUrl(match[1] ?? ''),
      case_type: caseType,
      industry: query.query,
      business_model: caseType === 'business_model' ? query.query : 'not_confirmed',
      relevant_touchpoints: caseType === 'touchpoint' ? [query.purpose] : [],
      useful_visual_mechanisms: snippet ? [snippet] : [query.purpose],
      relevance_reason: `${query.purpose}；检索结果与查询“${query.query}”相关`,
      non_copyable_elements: query.exclusion_terms || [],
      visual_strengths: snippet ? [snippet] : [],
      template_risks: caseType === 'anti_template' ? [snippet || title] : [],
      relevance_score: Number(relevance.toFixed(2)),
      source_quality: 'medium',
      visual_evidence_available: false,
      business_model_match: caseType === 'business_model' ? Number(relevance.toFixed(2)) : 0.65,
      evidence_images: [],
      source_urls: [unwrapDuckDuckGoUrl(match[1] ?? '')]
    };
  });
}

export function parseBingBenchmarkSearchHtml(html: string, query: SearchQuery): Array<Record<string, unknown>> {
  const normalized = html.replace(/<li[^>]+class="[^"]*b_algo[^"]*"[^>]*>/giu, '<article>');
  const links = [...normalized.matchAll(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/giu)];
  const snippets = [...normalized.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/giu)];
  const caseType = query.expected_case_type || query.category?.replace(/_queries$/u, '') || 'cross_industry';
  return links.slice(0, 3).map((match, index) => {
    const title = decodeHtml(match[2] ?? '');
    const snippet = decodeHtml(snippets[index]?.[1] || '');
    const url = decodeHtml(match[1] ?? '');
    const relevance = Math.max(0.62, 0.84 - index * 0.08 + (query.priority === 'high' ? 0.05 : 0));
    return {
      case_name: title,
      source_url: url,
      case_type: caseType,
      industry: query.query,
      business_model: caseType === 'business_model' ? query.query : 'not_confirmed',
      relevant_touchpoints: caseType === 'touchpoint' ? [query.purpose] : [],
      useful_visual_mechanisms: snippet ? [snippet] : [query.purpose],
      relevance_reason: `${query.purpose}；检索结果与查询“${query.query}”相关`,
      non_copyable_elements: query.exclusion_terms || [],
      visual_strengths: snippet ? [snippet] : [],
      template_risks: caseType === 'anti_template' ? [snippet || title] : [],
      relevance_score: Number(relevance.toFixed(2)),
      source_quality: 'medium',
      visual_evidence_available: false,
      business_model_match: caseType === 'business_model' ? Number(relevance.toFixed(2)) : 0.65,
      evidence_images: [],
      source_urls: [url]
    };
  });
}

function createProvider(
  fetchImpl: FetchLike,
  provider: string,
  endpointValue: string,
  parser: (html: string, query: SearchQuery) => Array<Record<string, unknown>>
): ProviderRetriever {
  const retrieve = (async (query: SearchQuery, { signal }: { signal?: AbortSignal } = {}) => {
    const endpoint = new URL(endpointValue);
    endpoint.searchParams.set('q', query.query);
    const started = Date.now();
    const response = await fetchImpl(endpoint, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Masterpiece-OS/0.1 Retrieval-First'
      },
      signal
    });
    const body = await response.text();
    if (!response.ok) {
      throw Object.assign(new Error(`Benchmark search failed with HTTP ${response.status}`), {
        code: 'BENCHMARK_SEARCH_HTTP_ERROR',
        status: response.status,
        endpoint: endpointValue,
        method: 'GET',
        content_type: response.headers.get('content-type'),
        response_size_bytes: Buffer.byteLength(body)
      });
    }
    const results = parser(body, query) as RetrieverResult;
    Object.defineProperty(results, 'transport', {
      enumerable: false,
      value: {
        provider,
        endpoint: endpointValue,
        method: 'GET',
        response_status: response.status,
        response_content_type: response.headers.get('content-type'),
        content_type: response.headers.get('content-type'),
        response_size_bytes: Buffer.byteLength(body),
        duration_ms: Date.now() - started
      }
    });
    return results;
  }) as ProviderRetriever;
  retrieve.provider = provider;
  retrieve.endpoint = endpointValue;
  retrieve.method = 'GET';
  retrieve.timeoutMs = 20_000;
  retrieve.healthCheck = async ({ signal }: { signal?: AbortSignal } = {}) => {
    const started = Date.now();
    const endpoint = new URL(endpointValue);
    endpoint.searchParams.set('q', 'brand identity');
    const response = await fetchImpl(endpoint, {
      headers: { Accept: 'text/html', 'User-Agent': 'Masterpiece-OS/0.1 Retrieval-First' },
      signal
    });
    await response.body?.cancel();
    return {
      healthy: response.ok,
      status_code: response.status,
      latency_ms: Date.now() - started,
      reason: response.ok ? null : `http_${response.status}`
    };
  };
  return retrieve;
}

export function createLiveBenchmarkRetriever(fetchImpl: FetchLike = fetch): CompositeRetriever {
  const providers = [
    createProvider(fetchImpl, 'duckduckgo_html', 'https://html.duckduckgo.com/html/', parseBenchmarkSearchHtml),
    createProvider(fetchImpl, 'bing_html', 'https://www.bing.com/search', parseBingBenchmarkSearchHtml)
  ];
  const composite = (async (query: SearchQuery, options: { signal?: AbortSignal } = {}) => {
    let lastError: unknown;
    for (const provider of providers) {
      try {
        return await provider(query, options);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }) as CompositeRetriever;
  composite.provider = 'live_search';
  composite.providers = providers;
  return composite;
}
