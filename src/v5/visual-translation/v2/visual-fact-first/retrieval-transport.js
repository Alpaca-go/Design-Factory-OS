const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([800, 2_000]);

const nowIso = () => new Date().toISOString();
const providerName = (provider) => provider?.provider || provider?.providerName || provider?.name || 'custom_retriever';

function classifyFailure(error) {
  const status = Number(error?.status || error?.statusCode || error?.response_status || 0);
  const text = `${error?.code || ''} ${error?.name || ''} ${error?.message || ''}`;
  if (error?.name === 'AbortError' || /timeout|timed.?out/iu.test(text)) return { reason: 'timeout', stage: 'request', retryable: true };
  if (status === 401) return { reason: 'unauthorized', stage: 'response', retryable: false };
  if (status === 403) return { reason: 'forbidden', stage: 'response', retryable: false };
  if (status === 429) return { reason: 'rate_limited', stage: 'response', retryable: true };
  if (status >= 500) return { reason: 'server_error', stage: 'response', retryable: true };
  if (/parse|json|schema|invalid.response/iu.test(text)) return { reason: 'invalid_response', stage: 'parse', retryable: false };
  if (/dns|enotfound|eai_again/iu.test(text)) return { reason: 'network_error', stage: 'dns', retryable: true };
  if (/tls|certificate|ssl/iu.test(text)) return { reason: 'network_error', stage: 'tls', retryable: true };
  if (/connect|socket|network|fetch|econn/iu.test(text)) return { reason: 'network_error', stage: 'connect', retryable: true };
  return { reason: 'unknown', stage: 'unknown', retryable: false };
}

const delay = (ms, signal) => new Promise((resolve, reject) => {
  if (!ms) return resolve();
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new DOMException('User cancelled benchmark retrieval', 'AbortError'));
  }, { once: true });
});

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Benchmark request timed out', 'TimeoutError')), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}

export function createRetrievalTransport(retriever, {
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS
} = {}) {
  const providers = Array.isArray(retriever?.providers) && retriever.providers.length ? retriever.providers : [retriever];
  const activeProviders = providers.filter((provider) => typeof provider === 'function');
  const disabled = new Set();
  const providerHealth = [];
  const transportDiagnostics = [];
  const state = {
    provider_fallback_count: 0,
    query_fallback_count: 0,
    providers_tried: [],
    queries_tried: []
  };

  const remember = (list, value) => {
    if (value && !list.includes(value)) list.push(value);
  };

  async function healthCheck() {
    for (const provider of activeProviders) {
      const name = providerName(provider);
      if (typeof provider.healthCheck !== 'function') {
        providerHealth.push({ provider: name, healthy: true, status: 'not_required' });
        continue;
      }
      const started = Date.now();
      const timed = withTimeout(signal, timeoutMs);
      try {
        const result = await provider.healthCheck({ signal: timed.signal });
        const healthy = result?.healthy !== false;
        providerHealth.push({
          provider: name,
          healthy,
          status: healthy ? 'healthy' : 'unhealthy',
          status_code: result?.status_code,
          latency_ms: result?.latency_ms ?? Date.now() - started,
          reason: result?.reason || null
        });
        if (!healthy) disabled.add(provider);
      } catch (error) {
        if (signal?.aborted) throw error;
        const failure = classifyFailure(error);
        providerHealth.push({
          provider: name, healthy: false, status: 'unhealthy',
          latency_ms: Date.now() - started, reason: failure.reason, failure_stage: failure.stage
        });
        disabled.add(provider);
      } finally {
        timed.dispose();
      }
    }
    if (disabled.has(activeProviders[0]) && activeProviders.some((provider) => !disabled.has(provider))) {
      state.provider_fallback_count += 1;
    }
    return providerHealth;
  }

  async function execute(query, { queryId, fallbackRound = 0 } = {}) {
    remember(state.queries_tried, query.query);
    let lastError;
    for (const provider of activeProviders) {
      if (disabled.has(provider)) continue;
      const name = providerName(provider);
      remember(state.providers_tried, name);
      for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
        const startedAt = nowIso();
        const started = Date.now();
        const timed = withTimeout(signal, Number(provider.timeoutMs || timeoutMs));
        try {
          const found = await provider(query, { signal: timed.signal });
          const list = Array.isArray(found) ? found : Array.isArray(found?.results) ? found.results : [];
          const metadata = found?.transport || found?.transport_metadata || {};
          const diagnostic = {
            query_id: queryId,
            query: query.query,
            fallback_round: fallbackRound,
            provider: name,
            endpoint: metadata.endpoint || provider.endpoint || null,
            method: metadata.method || provider.method || 'GET',
            request_started_at: startedAt,
            request_completed_at: nowIso(),
            duration_ms: Date.now() - started,
            timeout_ms: Number(provider.timeoutMs || timeoutMs),
            retry_count: attempt,
            response_status: metadata.response_status ?? found?.status ?? 200,
            response_content_type: metadata.response_content_type || metadata.content_type || null,
            content_type: metadata.response_content_type || metadata.content_type || null,
            response_size_bytes: metadata.response_size_bytes ?? null,
            failure_stage: null,
            failure_reason: null,
            status: 'success'
          };
          transportDiagnostics.push(diagnostic);
          return { results: list, provider: name, transport: diagnostic, exhausted: false };
        } catch (error) {
          timed.dispose();
          if (signal?.aborted) throw error;
          lastError = error;
          const failure = classifyFailure(error);
          transportDiagnostics.push({
            query_id: queryId,
            query: query.query,
            fallback_round: fallbackRound,
            provider: name,
            endpoint: error?.endpoint || provider.endpoint || null,
            method: error?.method || provider.method || 'GET',
            request_started_at: startedAt,
            request_completed_at: nowIso(),
            duration_ms: Date.now() - started,
            timeout_ms: Number(provider.timeoutMs || timeoutMs),
            retry_count: attempt,
            response_status: Number(error?.status || error?.statusCode || 0) || null,
            response_content_type: error?.response_content_type || error?.content_type || null,
            content_type: error?.response_content_type || error?.content_type || null,
            response_size_bytes: error?.response_size_bytes ?? null,
            failure_stage: failure.stage,
            failure_reason: failure.reason,
            status: failure.reason === 'timeout' ? 'timeout' : 'failed'
          });
          if (!failure.retryable || attempt === retryDelaysMs.length) {
            disabled.add(provider);
            break;
          }
          await delay(retryDelaysMs[attempt], signal);
          continue;
        } finally {
          timed.dispose();
        }
      }
      if (activeProviders.some((candidate) => candidate !== provider && !disabled.has(candidate))) {
        state.provider_fallback_count += 1;
      }
    }
    return { results: [], provider: null, error: lastError, exhausted: true };
  }

  return {
    healthCheck,
    execute,
    hasAvailableProvider: () => activeProviders.some((provider) => !disabled.has(provider)),
    providerHealth,
    transportDiagnostics,
    state
  };
}

export { classifyFailure as classifyTransportFailure };
