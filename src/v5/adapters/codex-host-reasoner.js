import crypto from 'node:crypto';

export class CodexHostReasonerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CodexHostReasonerError';
    this.code = code;
  }
}

/**
 * Bridge for an embedding host that can provide a real Codex runner.
 * No subprocess or undocumented headless interface is assumed.
 */
export function createCodexHostReasoner(options = {}) {
  const hostRunner = options.hostRunner;
  const model = String(options.model || 'codex-host').trim();
  return async function codexHostReasoner(context) {
    if (typeof hostRunner !== 'function') {
      throw new CodexHostReasonerError(
        'CODEX_HOST_RUNNER_UNAVAILABLE',
        '当前环境没有稳定的 Codex Headless Runner；请由 Codex 宿主显式注入 hostRunner，或使用人工 Agent-hosted baseline'
      );
    }
    const supplied = await hostRunner(context);
    const reportMarkdown = typeof supplied === 'string'
      ? supplied.trim()
      : String(supplied?.reportMarkdown || supplied?.outputText || '').trim();
    if (!reportMarkdown) {
      throw new CodexHostReasonerError('CODEX_HOST_EMPTY_REPORT', 'Codex Host 返回了空报告，分析失败');
    }
    return {
      runId: String(supplied?.runId || `codex-host-${crypto.randomUUID()}`),
      provider: 'codex-host',
      model: String(supplied?.model || model),
      completedAt: String(supplied?.completedAt || new Date().toISOString()),
      reportMarkdown,
      benchmarkSources: Array.isArray(supplied?.benchmarkSources) ? supplied.benchmarkSources : [],
      inspectedAssetIds: Array.isArray(supplied?.inspectedAssetIds)
        ? supplied.inspectedAssetIds
        : context.prompt.attachments.filter((item) => item.mediaType === 'image' && item.readable).map((item) => item.assetId)
    };
  };
}
