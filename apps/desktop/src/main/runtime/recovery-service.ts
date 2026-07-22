import fs from 'node:fs/promises';
import path from 'node:path';
import type { VisualTranslationRunRecord } from '../../shared/types';

interface RecoveryResult {
  record: VisualTranslationRunRecord | null;
  recovered: boolean;
  source?: string;
  quarantined: string[];
}

async function readCandidate(filename: string): Promise<VisualTranslationRunRecord | null> {
  try {
    return JSON.parse(await fs.readFile(filename, 'utf8')) as VisualTranslationRunRecord;
  } catch {
    return null;
  }
}

async function referencesExist(runRoot: string, record: VisualTranslationRunRecord): Promise<boolean> {
  const refs = [...(record.checkpointRefs || []), ...(record.artifactRefs || [])];
  return Promise.all(refs.map((entry) => {
    const resolved = path.resolve(runRoot, entry);
    const relative = path.relative(runRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return Promise.resolve(false);
    return fs.access(resolved).then(() => true).catch(() => false);
  })).then((values) => values.every(Boolean));
}

export async function findRecoverableRunProjection(runRoot: string, runId: string): Promise<RecoveryResult> {
  const runtimeRoot = path.join(runRoot, 'runtime');
  const projectionPath = path.join(runtimeRoot, 'run.json');
  const current = await readCandidate(projectionPath);
  const candidates: Array<{ source: string; record: VisualTranslationRunRecord }> = [];
  if (current?.id === runId) candidates.push({ source: projectionPath, record: current });

  const runReport = await readCandidate(path.join(runtimeRoot, 'run-report.json')).then((value: any) => value?.run || null);
  if (runReport?.id === runId) candidates.push({ source: path.join(runtimeRoot, 'run-report.json'), record: runReport });

  try {
    const checkpoint = JSON.parse(await fs.readFile(path.join(runRoot, 'checkpoints', 'step4-result.json'), 'utf8')) as { run_id?: string; projection?: VisualTranslationRunRecord };
    if (checkpoint.run_id === runId && checkpoint.projection?.id === runId) candidates.push({ source: path.join(runRoot, 'checkpoints', 'step4-result.json'), record: checkpoint.projection });
  } catch {}

  const entries = await fs.readdir(runtimeRoot, { withFileTypes: true }).catch(() => []);
  const tempEntries = entries.filter((entry) => entry.isFile() && /^run\.json\..+\.tmp$/u.test(entry.name));
  const quarantined: string[] = [];
  for (const entry of tempEntries) {
    const filename = path.join(runtimeRoot, entry.name);
    const candidate = await readCandidate(filename);
    const valid = candidate?.id === runId
      && Number(candidate.revision || 0) > Number(current?.revision || 0)
      && await referencesExist(runRoot, candidate);
    if (valid) {
      candidates.push({ source: filename, record: candidate! });
      continue;
    }
    const quarantineRoot = path.join(runtimeRoot, 'recovery', 'quarantine');
    await fs.mkdir(quarantineRoot, { recursive: true });
    const destination = path.join(quarantineRoot, entry.name);
    await fs.rename(filename, destination).catch(() => undefined);
    quarantined.push(destination);
  }

  const best = candidates
    .filter(({ record }) => record.id === runId)
    .sort((a, b) => {
      const completedDelta = Number(b.record.analysisStatus === 'completed' || b.record.status === 'completed') - Number(a.record.analysisStatus === 'completed' || a.record.status === 'completed');
      return completedDelta || Number(b.record.revision || 0) - Number(a.record.revision || 0) || String(b.record.completedAt || b.record.createdAt).localeCompare(String(a.record.completedAt || a.record.createdAt));
    })[0];
  if (!best) return { record: null, recovered: false, quarantined };

  const currentIsUsable = current?.id === runId
    && !(current.status === 'failed' && (best.record.analysisStatus === 'completed' || best.record.status === 'completed'))
    && Number(current.revision || 0) >= Number(best.record.revision || 0);
  if (currentIsUsable) return { record: current, recovered: false, source: projectionPath, quarantined };

  const recovered: VisualTranslationRunRecord = {
    ...best.record,
    status: best.record.analysisStatus === 'completed' || best.record.status === 'completed' ? 'completed' : best.record.analysisStatus === 'result_committed' ? 'pending' : best.record.status,
    persistenceStatus: 'healthy',
    recoverable: false,
    runtimeIssue: null,
    uiMessage: best.record.status === 'completed' ? '运行状态已从持久化结果自动恢复。' : best.record.uiMessage,
    revision: Math.max(Number(current?.revision || 0), Number(best.record.revision || 0)) + 1
  };
  return { record: recovered, recovered: true, source: best.source, quarantined };
}
