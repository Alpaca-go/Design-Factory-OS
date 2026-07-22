type SearchQuery = {
  query: string;
  purpose: string;
  expected_case_type?: string;
  exclusion_terms?: string[];
  priority?: 'high' | 'medium' | 'low';
  category?: string;
};

type FetchLike = typeof fetch;

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

export function createLiveBenchmarkRetriever(fetchImpl: FetchLike = fetch) {
  return async (query: SearchQuery, { signal }: { signal?: AbortSignal } = {}) => {
    const endpoint = new URL('https://html.duckduckgo.com/html/');
    endpoint.searchParams.set('q', query.query);
    const response = await fetchImpl(endpoint, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Masterpiece-OS/0.1 Retrieval-First'
      },
      signal
    });
    if (!response.ok) throw Object.assign(new Error(`Benchmark search failed with HTTP ${response.status}`), { code: 'BENCHMARK_SEARCH_HTTP_ERROR' });
    return parseBenchmarkSearchHtml(await response.text(), query);
  };
}
