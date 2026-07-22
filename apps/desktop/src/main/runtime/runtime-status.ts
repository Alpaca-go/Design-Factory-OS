export type AnalysisStatus = 'pending' | 'running' | 'validated' | 'result_committed' | 'completed' | 'failed_before_completion';
export type PersistenceStatus = 'healthy' | 'degraded' | 'projection_sync_failed' | 'recovery_required';
export type RuntimeErrorCategory = 'ANALYSIS_ERROR' | 'RESULT_COMMIT_ERROR' | 'PROJECTION_WRITE_ERROR' | 'EVENT_LOG_ERROR' | 'RECOVERY_ERROR';

export interface RuntimeIssue {
  category: RuntimeErrorCategory;
  code: string;
  message: string;
  severity: 'warning' | 'error';
  recoverable: boolean;
  analysisCompleted: boolean;
  tempPath?: string;
}

export interface RuntimeStatus {
  analysisStatus: AnalysisStatus;
  persistenceStatus: PersistenceStatus;
  recoverable: boolean;
  lastSuccessfulCheckpoint?: string;
  runtimeIssue?: RuntimeIssue | null;
}

const forwardRank: Record<Exclude<AnalysisStatus, 'failed_before_completion'>, number> = {
  pending: 0,
  running: 1,
  validated: 2,
  result_committed: 3,
  completed: 4
};

export function transitionRuntimeStatus(current: RuntimeStatus, requested: Partial<RuntimeStatus>): RuntimeStatus {
  let analysisStatus = requested.analysisStatus ?? current.analysisStatus;
  let persistenceStatus = requested.persistenceStatus ?? current.persistenceStatus;
  let recoverable = requested.recoverable ?? current.recoverable;
  if (analysisStatus === 'failed_before_completion' && ['result_committed', 'completed'].includes(current.analysisStatus)) {
    analysisStatus = current.analysisStatus;
    persistenceStatus = requested.persistenceStatus || 'degraded';
    recoverable = true;
  } else if (analysisStatus !== 'failed_before_completion' && current.analysisStatus !== 'failed_before_completion') {
    if (forwardRank[analysisStatus] < forwardRank[current.analysisStatus]) analysisStatus = current.analysisStatus;
  }
  return {
    ...current,
    ...requested,
    analysisStatus,
    persistenceStatus,
    recoverable,
    lastSuccessfulCheckpoint: requested.lastSuccessfulCheckpoint ?? current.lastSuccessfulCheckpoint,
    runtimeIssue: requested.runtimeIssue === undefined ? current.runtimeIssue : requested.runtimeIssue
  };
}

