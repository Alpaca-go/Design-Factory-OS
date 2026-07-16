import { buildStagePrompt } from '../prompts/shared.js';

export const STRUCTURED_PATCH_PROTOCOL_VERSION = 'structured-patch-v1';

export class StructuredPatchError extends Error {
  constructor(code, message, jsonPath = null) {
    super(message);
    this.name = 'StructuredPatchError';
    this.code = code;
    this.jsonPath = jsonPath;
    this.jsonPaths = jsonPath ? [jsonPath] : [];
  }
}

export function jsonPathToPointer(jsonPath) {
  if (!jsonPath) return null;
  const parts = String(jsonPath)
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .map((part) => part.replace(/~/g, '~0').replace(/\//g, '~1'));
  return `/${parts.join('/')}`;
}

function pointerParts(pointer) {
  if (!/^\/(?:[^/]+\/)*[^/]+$/.test(pointer)) {
    throw new StructuredPatchError('PATCH_PATH_NOT_ALLOWED', `Patch 路径无效：${pointer}`, pointer);
  }
  return pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function valueAtPointer(value, pointer) {
  let current = value;
  for (const part of pointerParts(pointer)) {
    if (current === null || current === undefined) return null;
    current = current[Array.isArray(current) ? Number(part) : part];
  }
  return current ?? null;
}

function targetObjectId(output, pointers) {
  for (const pointer of pointers) {
    const match = pointer.match(/^\/(imageTasks|strategicIssues|normalizedFacts|atomicEvidence)\/(\d+)\//);
    if (match) return output?.[match[1]]?.[Number(match[2])]?.id || null;
  }
  return null;
}

function parentValueAtPointer(output, pointer) {
  const parentPointer = pointer.slice(0, pointer.lastIndexOf('/'));
  return parentPointer ? valueAtPointer(output, parentPointer) : output;
}

export function buildStructuredPatchPrompt({
  stageId,
  output,
  error,
  allowedPointers,
  upstreamRules = [],
  referenceContext = {}
}) {
  const snippets = Object.fromEntries(allowedPointers.map((pointer) => [
    pointer,
    valueAtPointer(output, pointer)
  ]));
  const targetContainers = Object.fromEntries(allowedPointers.map((pointer) => [
    pointer,
    parentValueAtPointer(output, pointer)
  ]));
  const targetId = targetObjectId(output, allowedPointers);
  return buildStagePrompt(
    'structured-patch-repair',
    `修复 ${stageId} 的局部结构错误。只能返回 JSON Patch 协议对象；每个 operation 只能使用 add 或 replace，且 path 必须在 allowedPaths 中。allowedPaths 中的每一条路径都必须且只能出现一次 operation。不得修改 allowedPaths 之外的 Brand DNA、战略模型、Locked Facts、Image System、未报错任务或其他路径。`,
    {
      stageId,
      targetObjectId: targetId,
      error: String(error?.message || 'schema validation failed'),
      allowedPaths: allowedPointers,
      targetSnippets: snippets,
      targetContainers,
      approvedReferenceContext: referenceContext,
      approvedUpstreamRules: upstreamRules
    },
    '{"stageId":"string","targetObjectId":"string|null","operations":[{"op":"add|replace","path":"/allowed/json/pointer","value":"unknown"}]}'
  );
}

export function validateStructuredRepairPatch(patch, stageId, allowedPointers) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new StructuredPatchError('FAILED_SCHEMA_AFTER_PATCH', 'Patch 必须是 JSON 对象。');
  }
  if (patch.stageId !== stageId) {
    throw new StructuredPatchError('FAILED_SCHEMA_AFTER_PATCH', 'Patch stageId 与目标阶段不一致。');
  }
  if (!Array.isArray(patch.operations) || patch.operations.length < 1) {
    throw new StructuredPatchError('FAILED_SCHEMA_AFTER_PATCH', 'Patch operations 必须至少包含一项。');
  }
  const allowed = new Set(allowedPointers);
  const patchedPaths = new Set();
  for (const operation of patch.operations) {
    if (!['add', 'replace'].includes(operation?.op)) {
      throw new StructuredPatchError('FAILED_SCHEMA_AFTER_PATCH', 'Patch 只允许 add 或 replace。');
    }
    if (!allowed.has(operation.path)) {
      throw new StructuredPatchError(
        'PATCH_PATH_NOT_ALLOWED',
        `Patch 不得修改未授权路径：${operation.path}`,
        operation.path
      );
    }
    if (patchedPaths.has(operation.path)) {
      throw new StructuredPatchError(
        'FAILED_SCHEMA_AFTER_PATCH',
        `Patch 路径不得重复：${operation.path}`,
        operation.path
      );
    }
    patchedPaths.add(operation.path);
  }
  const missingPaths = allowedPointers.filter((pointer) => !patchedPaths.has(pointer));
  if (missingPaths.length) {
    throw new StructuredPatchError(
      'FAILED_SCHEMA_AFTER_PATCH',
      `Patch 未修复全部授权路径：${missingPaths.join(', ')}`,
      missingPaths[0]
    );
  }
  return patch;
}

export function applyStructuredRepairPatch(output, patch, allowedPointers) {
  validateStructuredRepairPatch(patch, patch.stageId, allowedPointers);
  const clone = structuredClone(output);
  for (const operation of patch.operations) {
    const parts = pointerParts(operation.path);
    const finalKey = parts.pop();
    let parent = clone;
    for (const part of parts) {
      const key = Array.isArray(parent) ? Number(part) : part;
      if (parent[key] === undefined || parent[key] === null) {
        if (operation.op !== 'add') {
          throw new StructuredPatchError('FAILED_SCHEMA_AFTER_PATCH', `replace 路径不存在：${operation.path}`);
        }
        parent[key] = /^\d+$/.test(parts[parts.indexOf(part) + 1] || '') ? [] : {};
      }
      parent = parent[key];
    }
    const key = Array.isArray(parent) ? Number(finalKey) : finalKey;
    if (operation.op === 'replace' && !(key in parent)) {
      throw new StructuredPatchError('FAILED_SCHEMA_AFTER_PATCH', `replace 路径不存在：${operation.path}`);
    }
    parent[key] = structuredClone(operation.value);
  }
  return clone;
}
