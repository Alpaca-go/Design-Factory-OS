export class ReasoningSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReasoningSessionError';
    this.code = code;
  }
}

export class ReasoningSessionGuard {
  constructor() {
    this.runId = null;
    this.fullReasoningRuns = 0;
    this.continuations = 0;
  }

  begin(runId) {
    if (this.fullReasoningRuns !== 0) {
      throw new ReasoningSessionError('MULTIPLE_REASONING_RUNS', 'v5 每个项目只允许一次完整 AI 创意推理');
    }
    if (typeof runId !== 'string' || !runId.trim()) {
      throw new ReasoningSessionError('RUN_ID_REQUIRED', 'Deep Creative Director 必须提供 runId');
    }
    this.runId = runId.trim();
    this.fullReasoningRuns = 1;
    return this.snapshot();
  }

  continueSameSession(runId) {
    if (!this.runId || runId !== this.runId) {
      throw new ReasoningSessionError('SESSION_MISMATCH', '格式修复必须沿用原 Deep Creative Director runId');
    }
    if (this.continuations >= 1) {
      throw new ReasoningSessionError('REPAIR_LIMIT_EXCEEDED', '同一会话最多允许一次限定格式修复');
    }
    this.continuations += 1;
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      runId: this.runId,
      fullReasoningRuns: this.fullReasoningRuns,
      continuations: this.continuations
    });
  }
}
