const EDITABLE_ROOTS = new Set([
  'brandDna',
  'creativeThesisDecision',
  'visualTranslation',
  'imageSystem',
  'imageTasks'
]);

const PROTECTED_SEGMENTS = new Set([
  'id',
  'sequence',
  'status',
  'confidence',
  'evidence',
  'evidenceids',
  'sourcerefs',
  'lockedfacts',
  'knownassets',
  'systemid'
]);

export class TargetedRepairPatchError extends Error {
  constructor(message, jsonPath = null) {
    super(message);
    this.name = 'TargetedRepairPatchError';
    this.code = 'TARGETED_REPAIR_PATCH_INVALID';
    this.jsonPath = jsonPath;
    this.jsonPaths = jsonPath ? [jsonPath] : [];
  }
}

function fail(message, jsonPath = null) {
  throw new TargetedRepairPatchError(message, jsonPath);
}

function pointerParts(pointer) {
  if (typeof pointer !== 'string' || !/^\/(?:[^/]+\/)*[^/]+$/.test(pointer)) {
    fail(`定向修复路径无效：${String(pointer || '')}`, 'operations.path');
  }
  const parts = pointer.slice(1).split('/').map((part) =>
    part.replace(/~1/g, '/').replace(/~0/g, '~')
  );
  if (parts.some((part) => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) {
    fail(`定向修复路径包含禁止字段：${pointer}`, 'operations.path');
  }
  return parts;
}

function valueAtPointer(target, pointer) {
  let current = target;
  for (const part of pointerParts(pointer)) {
    const key = Array.isArray(current) ? Number(part) : part;
    if (
      current === null
      || current === undefined
      || (Array.isArray(current) && (!Number.isInteger(key) || key < 0 || key >= current.length))
      || (!Array.isArray(current) && !Object.prototype.hasOwnProperty.call(current, key))
    ) {
      fail(`定向修复只能替换现有字段：${pointer}`, 'operations.path');
    }
    current = current[key];
  }
  return current;
}

function parentAtPointer(target, pointer) {
  const parts = pointerParts(pointer);
  parts.pop();
  let current = target;
  for (const part of parts) {
    current = current[Array.isArray(current) ? Number(part) : part];
  }
  return current;
}

function isSmallPrimitiveArray(value) {
  return Array.isArray(value)
    && value.length <= 32
    && value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item));
}

export function validateTargetedRepairPatch(patch, target) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    fail('定向修复必须返回 JSON Patch 对象');
  }
  if (patch.stageId !== 'targeted-repair') {
    fail('定向修复 stageId 必须为 targeted-repair', 'stageId');
  }
  if (!Array.isArray(patch.operations) || patch.operations.length < 1 || patch.operations.length > 32) {
    fail('定向修复 operations 必须包含 1 至 32 项', 'operations');
  }

  const paths = new Set();
  for (const [index, operation] of patch.operations.entries()) {
    const base = `operations[${index}]`;
    if (operation?.op !== 'replace') {
      fail(`${base}.op 只允许 replace`, `${base}.op`);
    }
    const parts = pointerParts(operation.path);
    if (!EDITABLE_ROOTS.has(parts[0]) || parts.length < 2) {
      fail(`${base}.path 不得替换整个顶层对象`, `${base}.path`);
    }
    if (parts.some((part) => PROTECTED_SEGMENTS.has(part.toLowerCase()))) {
      fail(`${base}.path 不得修改 ID、证据引用或锁定事实`, `${base}.path`);
    }
    if (paths.has(operation.path)) {
      fail(`${base}.path 不得重复`, `${base}.path`);
    }
    if (!Object.prototype.hasOwnProperty.call(operation, 'value')) {
      fail(`${base}.value 缺失`, `${base}.value`);
    }
    const parent = parentAtPointer(target, operation.path);
    if (
      parts.at(-1) === 'value'
      && parent
      && typeof parent === 'object'
      && parent.status === 'confirmed'
    ) {
      fail(`${base}.path 不得修改已确认事实`, `${base}.path`);
    }
    const existing = valueAtPointer(target, operation.path);
    if (existing && typeof existing === 'object' && !isSmallPrimitiveArray(existing)) {
      fail(`${base}.path 必须指向叶子字段或短原始值数组`, `${base}.path`);
    }
    paths.add(operation.path);
  }
  return patch;
}

export function applyTargetedRepairPatch(target, patch) {
  validateTargetedRepairPatch(patch, target);
  const clone = structuredClone(target);
  for (const operation of patch.operations) {
    const parts = pointerParts(operation.path);
    const finalPart = parts.pop();
    let parent = clone;
    for (const part of parts) {
      parent = parent[Array.isArray(parent) ? Number(part) : part];
    }
    parent[Array.isArray(parent) ? Number(finalPart) : finalPart] = structuredClone(operation.value);
  }
  return clone;
}
