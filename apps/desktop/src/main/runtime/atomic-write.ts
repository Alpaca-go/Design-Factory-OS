import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface AtomicWriteOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableCodes: string[];
  keepTempOnFailure: boolean;
  onAttempt?: (entry: AtomicWriteAttempt) => void;
  rename?: typeof fs.rename;
  wait?: (milliseconds: number) => Promise<void>;
}

export interface AtomicWriteAttempt {
  targetPath: string;
  tempPath: string;
  attempt: number;
  delayMs: number;
  errorCode?: string;
  renameDurationMs: number;
}

export interface AtomicWriteResult {
  success: boolean;
  targetPath: string;
  tempPath?: string;
  attempts: number;
  errorCode?: string;
  errorMessage?: string;
}

const DEFAULTS: AtomicWriteOptions = {
  maxAttempts: 5,
  baseDelayMs: 50,
  maxDelayMs: 800,
  retryableCodes: ['EPERM', 'EBUSY', 'EACCES'],
  keepTempOnFailure: true
};

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function atomicWriteJsonWithRetry(
  targetPath: string,
  data: unknown,
  options: Partial<AtomicWriteOptions> = {}
): Promise<AtomicWriteResult> {
  const settings = { ...DEFAULTS, ...options };
  const resolved = path.resolve(targetPath);
  const tempPath = `${resolved}.${crypto.randomUUID()}.tmp`;
  const rename = settings.rename || fs.rename;
  const wait = settings.wait || sleep;
  await fs.mkdir(path.dirname(resolved), { recursive: true });

  const handle = await fs.open(tempPath, 'w');
  try {
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  let lastError: NodeJS.ErrnoException | undefined;
  let attempts = 0;
  for (let attempt = 1; attempt <= settings.maxAttempts; attempt += 1) {
    attempts = attempt;
    const started = performance.now();
    try {
      await rename(tempPath, resolved);
      settings.onAttempt?.({ targetPath: resolved, tempPath, attempt, delayMs: 0, renameDurationMs: Math.round(performance.now() - started) });
      return { success: true, targetPath: resolved, attempts: attempt };
    } catch (error) {
      lastError = error as NodeJS.ErrnoException;
      const retryable = settings.retryableCodes.includes(lastError.code || '');
      const delayMs = Math.min(settings.maxDelayMs, settings.baseDelayMs * (2 ** (attempt - 1)));
      settings.onAttempt?.({ targetPath: resolved, tempPath, attempt, delayMs: retryable && attempt < settings.maxAttempts ? delayMs : 0, errorCode: lastError.code, renameDurationMs: Math.round(performance.now() - started) });
      if (!retryable || attempt >= settings.maxAttempts) break;
      await wait(delayMs);
    }
  }

  if (!settings.keepTempOnFailure) await fs.unlink(tempPath).catch(() => undefined);
  return {
    success: false,
    targetPath: resolved,
    tempPath: settings.keepTempOnFailure ? tempPath : undefined,
    attempts,
    errorCode: lastError?.code,
    errorMessage: lastError?.message || 'Atomic JSON write failed'
  };
}
