export interface RunWriteMetrics {
  runId: string;
  operation: string;
  queueWaitMs: number;
  durationMs: number;
  success: boolean;
}

export class RunWriteCoordinator {
  private queues = new Map<string, Promise<void>>();
  private readonly onComplete?: (metrics: RunWriteMetrics) => void;

  constructor(onComplete?: (metrics: RunWriteMetrics) => void) {
    this.onComplete = onComplete;
  }

  enqueue<T>(runId: string, operation: string, task: () => Promise<T>): Promise<T> {
    const queuedAt = performance.now();
    const previous = this.queues.get(runId) ?? Promise.resolve();
    let queueEntry: Promise<void>;
    const result = previous
      .catch(() => undefined)
      .then(async () => {
        const startedAt = performance.now();
        try {
          const value = await task();
          this.onComplete?.({ runId, operation, queueWaitMs: Math.round(startedAt - queuedAt), durationMs: Math.round(performance.now() - startedAt), success: true });
          return value;
        } catch (error) {
          this.onComplete?.({ runId, operation, queueWaitMs: Math.round(startedAt - queuedAt), durationMs: Math.round(performance.now() - startedAt), success: false });
          throw error;
        }
      });
    queueEntry = result.then(() => undefined, () => undefined).finally(() => {
      if (this.queues.get(runId) === queueEntry) this.queues.delete(runId);
    });
    this.queues.set(runId, queueEntry);
    return result;
  }

  async drain(runId: string): Promise<void> {
    await this.queues.get(runId);
  }
}
