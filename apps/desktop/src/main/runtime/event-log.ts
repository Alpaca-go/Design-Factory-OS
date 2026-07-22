import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface RuntimeEvent {
  event_id: string;
  run_id: string;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

export async function appendRuntimeEvent(runtimeRoot: string, runId: string, type: string, payload: Record<string, unknown> = {}): Promise<RuntimeEvent> {
  const event = { event_id: crypto.randomUUID(), run_id: runId, timestamp: new Date().toISOString(), type, payload };
  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.appendFile(path.join(runtimeRoot, 'events.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export async function readRuntimeEvents(runtimeRoot: string): Promise<RuntimeEvent[]> {
  const content = await fs.readFile(path.join(runtimeRoot, 'events.jsonl'), 'utf8').catch(() => '');
  return content.split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line) as RuntimeEvent]; } catch { return []; }
  });
}

