import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertCreativeDecisionState } from './creative-decision-state.js';

const STATE_DIRECTORY = path.join('.masterpiece-os', 'state');
const STATE_FILENAME = 'creative-decision.json';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export class CreativeDecisionStateStoreError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'CreativeDecisionStateStoreError';
    this.code = code;
  }
}

export function getCreativeDecisionStatePath(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new CreativeDecisionStateStoreError('INVALID_PROJECT_ROOT', 'projectRoot 必须是非空路径');
  }
  return path.join(path.resolve(projectRoot), STATE_DIRECTORY, STATE_FILENAME);
}

async function readJson(file) {
  let content;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new CreativeDecisionStateStoreError('STATE_READ_FAILED', `无法读取 Creative Decision State：${file}`, { cause: error });
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new CreativeDecisionStateStoreError('STATE_JSON_INVALID', `Creative Decision State 不是有效 JSON：${file}`, { cause: error });
  }
}

export async function readCreativeDecisionState(projectRoot, options = {}) {
  const statePath = getCreativeDecisionStatePath(projectRoot);
  const state = await readJson(statePath);
  if (state === null) {
    if (options.required) {
      throw new CreativeDecisionStateStoreError('STATE_NOT_FOUND', `Creative Decision State 不存在：${statePath}`);
    }
    return null;
  }
  if (options.validate !== false) {
    try {
      assertCreativeDecisionState(state, { requireApproved: true });
    } catch (error) {
      throw new CreativeDecisionStateStoreError('ACTIVE_STATE_INVALID', `Active Creative Decision State 校验失败：${statePath}`, { cause: error });
    }
  }
  return deepFreeze(state);
}

function assertReplacement(current, next) {
  if (current.meta.decisionId === next.meta.decisionId) {
    if (current.meta.stateDigest === next.meta.stateDigest) return false;
    throw new CreativeDecisionStateStoreError(
      'APPROVED_STATE_IMMUTABLE',
      `Approved State ${current.meta.decisionId} 不可修改；输入变化必须创建新的 decisionId`
    );
  }
  if (next.meta.supersedesDecisionId !== current.meta.decisionId) {
    throw new CreativeDecisionStateStoreError(
      'SUPERSEDES_MISMATCH',
      `新 State 必须通过 meta.supersedesDecisionId 指向当前 active decisionId：${current.meta.decisionId}`
    );
  }
  return true;
}

/**
 * Validate a fully approved State, verify it from a temporary file, then atomically
 * replace the project's only active Creative Decision State.
 */
export async function activateCreativeDecisionState(projectRoot, state) {
  try {
    assertCreativeDecisionState(state, { requireApproved: true });
  } catch (error) {
    throw new CreativeDecisionStateStoreError('CANDIDATE_STATE_INVALID', '候选 Creative Decision State 未通过激活校验', { cause: error });
  }

  const statePath = getCreativeDecisionStatePath(projectRoot);
  const stateDirectory = path.dirname(statePath);
  await fs.mkdir(stateDirectory, { recursive: true });

  const current = await readCreativeDecisionState(projectRoot);
  if (current && !assertReplacement(current, state)) {
    return { changed: false, path: statePath, state: current, previousDecisionId: current.meta.decisionId };
  }

  const temporaryPath = path.join(
    stateDirectory,
    `.${STATE_FILENAME}.${process.pid}.${crypto.randomUUID()}.tmp`
  );

  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    const candidate = await readJson(temporaryPath);
    try {
      assertCreativeDecisionState(candidate, { requireApproved: true });
    } catch (error) {
      throw new CreativeDecisionStateStoreError('TEMPORARY_STATE_INVALID', '临时 Creative Decision State 回读校验失败', { cause: error });
    }
    await fs.rename(temporaryPath, statePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    if (error instanceof CreativeDecisionStateStoreError) throw error;
    throw new CreativeDecisionStateStoreError('STATE_ACTIVATION_FAILED', `无法原子激活 Creative Decision State：${statePath}`, { cause: error });
  }

  const active = await readCreativeDecisionState(projectRoot, { required: true });
  if (active.meta.stateDigest !== state.meta.stateDigest) {
    throw new CreativeDecisionStateStoreError('ACTIVE_STATE_VERIFY_FAILED', '原子替换后的 Active State digest 与候选 State 不一致');
  }
  return {
    changed: true,
    path: statePath,
    state: active,
    previousDecisionId: current?.meta.decisionId ?? null
  };
}
