import { createCodexHostReasoner } from './codex-host-reasoner.js';
import { createQwenReasoner } from './qwen-reasoner.js';

export class ReasonerFactoryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReasonerFactoryError';
    this.code = code;
  }
}

/** Select one provider without falling back to fixtures or another model. */
export function createReasonerFromEnvironment(options = {}) {
  const environment = options.environment || process.env;
  const provider = String(options.provider || environment.MASTERPIECE_PROVIDER || '').trim().toLowerCase();
  if (!provider) {
    throw new ReasonerFactoryError(
      'REASONER_PROVIDER_MISSING',
      '未配置 Reasoner Provider；请使用 --provider 或 MASTERPIECE_PROVIDER'
    );
  }
  if (provider === 'qwen') return createQwenReasoner({ ...options, environment });
  if (provider === 'codex-host') return createCodexHostReasoner({ ...options, environment });
  throw new ReasonerFactoryError('REASONER_PROVIDER_UNSUPPORTED', `不支持的 Reasoner Provider：${provider}`);
}
