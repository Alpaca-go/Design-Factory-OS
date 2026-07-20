// Provider model output-capability registry (doc: v2 Stage 04 输出截断修复, §3.3/§3.4).
//
// PURPOSE: prevent requesting a maxOutputTokens that exceeds what the provider
// actually supports. The reasoner already maps a `length` finish_reason to an
// OUTPUT_TRUNCATED error; this registry lets us FLAG the misconfiguration
// BEFORE the request is even sent, with an actionable error.
//
// WARNING: maxOutputTokens values are ASSUMPTIONS pending confirmation against
// the live provider. They must be verified with the actual API before trusting
// them (doc §3.3: "具体数值必须以当前实际 Provider 配置为准，不得仅凭模型名称
// 硬编码未经确认的数据"). Until then, treat the numbers below as conservative
// ceilings, not guarantees. Unknown models return null and skip the check.

export const MODEL_CAPABILITIES = Object.freeze({
  // DashScope / Tongyi qwen3.6-plus — assumed 32k output headroom (UNCONFIRMED).
  'qwen3.6-plus': { maxContextTokens: 131072, maxOutputTokens: 32768, supportsThinking: true }
});

export class ModelCapabilityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ModelCapabilityError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function getModelCapabilities(provider, modelId) {
  const id = String(modelId || '').trim();
  if (!id) return null;
  return MODEL_CAPABILITIES[id] || null;
}

export function resolveMaxOutputTokens({ requestedMaxOutputTokens, modelCapabilities, context = {} }) {
  if (!modelCapabilities?.maxOutputTokens) return requestedMaxOutputTokens;
  if (requestedMaxOutputTokens > modelCapabilities.maxOutputTokens) {
    throw new ModelCapabilityError(
      'MODEL_OUTPUT_LIMIT_EXCEEDED',
      `Requested maxOutputTokens=${requestedMaxOutputTokens}, but model limit is ${modelCapabilities.maxOutputTokens}.`,
      {
        stageId: context.stageId || null,
        modelId: context.modelId || null,
        requestedMaxOutputTokens,
        providerMaxOutputTokens: modelCapabilities.maxOutputTokens
      }
    );
  }
  return requestedMaxOutputTokens;
}

// Decide the escalated output budget for a single truncation recovery attempt
// (doc §4). Returns the next budget and whether a retry is even possible.
// Pure + testable so the runner stays thin.
export function planTruncationRetry({ requestedMaxOutputTokens, providerMaxOutputTokens, multiplier = 1.5 }) {
  const cap = providerMaxOutputTokens || Number.MAX_SAFE_INTEGER;
  const escalated = Math.min(Math.ceil(requestedMaxOutputTokens * multiplier), cap);
  return { escalated, canRetry: escalated > requestedMaxOutputTokens };
}
