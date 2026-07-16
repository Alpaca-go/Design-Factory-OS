export function combineAbortSignals(signals) {
  const available = signals.filter(Boolean);
  if (!available.length) return { signal: undefined, dispose() {} };
  const controller = new AbortController();
  const listeners = [];
  const forward = (source) => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  for (const signal of available) {
    if (signal.aborted) {
      forward(signal);
      break;
    }
    const listener = () => forward(signal);
    signal.addEventListener('abort', listener, { once: true });
    listeners.push([signal, listener]);
  }
  return {
    signal: controller.signal,
    dispose() {
      for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
    }
  };
}

export function createTimeoutSignal(timeoutMs, reason) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { signal: undefined, dispose() {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(reason), timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
    }
  };
}
