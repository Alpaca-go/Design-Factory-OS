import crypto from 'node:crypto';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]));
  return value;
}

export function resultHash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export interface Step4ResultCheckpoint {
  run_id: string;
  project_id: string;
  step: '04-three-creative-directions';
  schema_version: string;
  created_at: string;
  provider_model: string;
  result_hash: string;
  result: unknown;
  projection?: unknown;
}

export function buildStep4ResultCheckpoint(input: Omit<Step4ResultCheckpoint, 'step' | 'created_at' | 'result_hash'>): Step4ResultCheckpoint {
  return {
    ...input,
    step: '04-three-creative-directions',
    created_at: new Date().toISOString(),
    result_hash: resultHash(input.result)
  };
}
