import crypto from 'node:crypto';
import type {
  ModelCallStatus,
  NormalizedModelUsage,
  PublicSettings
} from '../shared/types';
import type { ProviderCredentials } from './settings-store';
import type { PendingUsageRecordInput, UsageDatabase } from './usage-database';

// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { createMissingUsage } from '../../../../src/v5/usage/normalized-usage.js';

export interface UsageCallContext {
  analysisRunId: string;
  projectId: string | null;
  projectName: string | null;
  analysisMode: PendingUsageRecordInput['analysisMode'];
  pipelineStage: string;
  attemptNumber?: number;
  parentCallId?: string | null;
  thinkingEnabled?: boolean | null;
  thinkingBudgetTokens?: number | null;
  structuredOutputMode?: string | null;
  maxOutputTokens?: number | null;
  credentials: ProviderCredentials;
}

export interface UsageCallHandle {
  id: string;
  startedAt: string;
  startedPerformance: number;
}

export interface UsageCallCompletion {
  status: ModelCallStatus;
  usage?: NormalizedModelUsage;
  providerRequestId?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  errorCategory?: string | null;
  finishReason?: string | null;
  firstTokenDurationMs?: number | null;
}

function regionFromBaseUrl(baseUrl: string): string | null {
  const value = String(baseUrl || '').toLowerCase();
  const known = value.match(/(?:^|[.-])(cn-[a-z0-9-]+|ap-southeast-[0-9]+|us-[a-z0-9-]+)(?:[.-]|$)/)?.[1];
  if (known) return known;
  if (value.includes('cn-beijing')) return 'cn-beijing';
  if (value.includes('ap-southeast-1')) return 'ap-southeast-1';
  return null;
}

export function classifyUsageError(error: unknown, aborted = false): {
  status: ModelCallStatus;
  errorCode: string;
  errorCategory: string;
  httpStatus: number | null;
  usage: NormalizedModelUsage;
  providerRequestId: string | null;
  finishReason: string | null;
} {
  const typed = error as {
    name?: string;
    code?: string;
    details?: {
      httpStatus?: number;
      usage?: NormalizedModelUsage;
      providerRequestId?: string;
      finishReason?: string;
    };
  };
  const message = String((error as Error)?.message || '');
  const cancelled = aborted || typed.name === 'AbortError';
  const timeout = !cancelled && /timeout|timed out|超时/i.test(message);
  return {
    status: cancelled ? 'cancelled' : timeout ? 'timeout' : 'failed',
    errorCode: typed.code || (cancelled ? 'ABORTED' : timeout ? 'TIMEOUT' : 'MODEL_CALL_FAILED'),
    errorCategory: cancelled ? 'cancelled' : timeout ? 'timeout' : 'provider',
    httpStatus: typed.details?.httpStatus ?? null,
    usage: typed.details?.usage || createMissingUsage(),
    providerRequestId: typed.details?.providerRequestId || null,
    finishReason: typed.details?.finishReason || null
  };
}

export function createUsageTracker(
  database: UsageDatabase,
  readSettings: () => Promise<PublicSettings>,
  onWarning: (message: string, error?: unknown) => void = console.warn
) {
  async function startCall(context: UsageCallContext): Promise<UsageCallHandle | null> {
    try {
      const settings = await readSettings();
      if (!settings.usageTrackingEnabled) return null;
      const id = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      database.insertPending({
        id,
        analysisRunId: context.analysisRunId,
        projectId: context.projectId,
        projectNameSnapshot: context.projectName,
        analysisMode: context.analysisMode,
        pipelineStage: context.pipelineStage,
        attemptNumber: Math.max(1, Math.trunc(context.attemptNumber || 1)),
        parentCallId: context.parentCallId || null,
        apiProfileId: context.credentials.profileId,
        apiProfileNameSnapshot: context.credentials.profileName,
        provider: context.credentials.provider,
        protocol: 'openai-chat-completions',
        region: regionFromBaseUrl(context.credentials.baseUrl),
        modelId: context.credentials.model,
        localRequestId: crypto.randomUUID(),
        thinkingEnabled: context.thinkingEnabled,
        thinkingBudgetTokens: context.thinkingBudgetTokens,
        structuredOutputMode: context.structuredOutputMode,
        maxOutputTokens: context.maxOutputTokens,
        startedAt,
        createdAt: startedAt
      });
      return { id, startedAt, startedPerformance: performance.now() };
    } catch (error) {
      onWarning('Usage 记录启动失败，分析将继续', error);
      return null;
    }
  }

  async function completeCall(
    handle: UsageCallHandle | null,
    completion: UsageCallCompletion
  ): Promise<void> {
    if (!handle) return;
    try {
      database.complete(handle.id, {
        status: completion.status,
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Math.round(performance.now() - handle.startedPerformance)),
        firstTokenDurationMs: completion.firstTokenDurationMs,
        providerRequestId: completion.providerRequestId,
        httpStatus: completion.httpStatus,
        errorCode: completion.errorCode,
        errorCategory: completion.errorCategory,
        finishReason: completion.finishReason,
        usage: completion.usage || createMissingUsage()
      });
    } catch (error) {
      onWarning('Usage 记录完成失败，分析结果不受影响', error);
    }
  }

  return { startCall, completeCall };
}

export type UsageTracker = ReturnType<typeof createUsageTracker>;
