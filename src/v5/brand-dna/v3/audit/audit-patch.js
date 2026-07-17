const PATCHABLE_ROOTS = Object.freeze([
  '/decision/creativeThesis',
  '/decision/visualMechanisms',
  '/visualSystemTaskPlan/distinctiveAssets',
  '/visualSystemTaskPlan/directions',
  '/visualSystemTaskPlan/imageSystem',
  '/visualSystemTaskPlan/generationBoundary',
  '/visualSystemTaskPlan/taskPlan',
  '/compiledImageTasks'
]);
const NON_WEAKENABLE_ARRAYS = /\/(?:prohibitedClaims|prohibitedElements|pendingConfirmations)$/;

function decodePointerSegment(segment) {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function readPointer(target, pointer) {
  return pointer.split('/').slice(1).map(decodePointerSegment).reduce((value, key) => value?.[key], target);
}

function isPatchablePath(path) {
  return PATCHABLE_ROOTS.some((root) => path.startsWith(`${root}/`));
}

export function buildAuditPatchRequest(payload, audit) {
  const patchableIssues = audit.issues.map((issue) => ({ ...issue, allowedRepairPaths: issue.allowedRepairPaths.filter(isPatchablePath) })).filter((issue) => issue.allowedRepairPaths.length);
  const allowedPaths = [...new Set(patchableIssues.flatMap((issue) => issue.allowedRepairPaths))];
  if (!allowedPaths.length) {
    throw Object.assign(new Error('最终审计没有可安全修复的具体字段'), { code: 'AUDIT_PATCH_NOT_ALLOWED' });
  }
  const currentValues = Object.fromEntries(allowedPaths.map((path) => [path, readPointer(payload, path)]));
  return {
    allowedPaths,
    messages: [{
      role: 'user',
      content: `PROTOCOL_STAGE=audit-patch\n你是受限 JSON Patch 修复器。只处理下方可修问题，不得处理已被安全白名单排除的其他审计问题，不得重写完整 Visual System、完整 Task Plan 或整套 Prompts，不得新增品牌事实，不得修改项目名、品牌名、行业、基因或证据。prohibitedClaims、prohibitedElements、pendingConfirmations 只能保留原项或追加，绝对不得删除、弱化或改写原项。每个 operation 的 path 必须是允许路径本身或其已有子字段。只返回 JSON：{"operations":[{"op":"replace","path":"/允许路径","value":...}]}。\n\n可修问题：${JSON.stringify(patchableIssues)}\n允许路径：${JSON.stringify(allowedPaths)}\n当前值：${JSON.stringify(currentValues)}`
    }]
  };
}

export function validateAuditPatch(value, allowedPaths) {
  if (!value || !Array.isArray(value.operations) || !value.operations.length) throw new Error('Audit Patch 缺少 operations');
  return {
    operations: value.operations.map((operation, index) => {
      if (operation?.op !== 'replace') throw new Error(`operations[${index}].op 只允许 replace`);
      const path = String(operation.path || '');
      const allowed = allowedPaths.some((root) => path === root || path.startsWith(`${root}/`));
      if (!allowed || !isPatchablePath(path)) {
        throw Object.assign(new Error(`Audit Patch Path 不允许：${path}`), { code: 'PATCH_PATH_NOT_ALLOWED', path });
      }
      return { op: 'replace', path, value: operation.value };
    })
  };
}

export function applyAuditPatch(payload, patch) {
  const result = structuredClone(payload);
  for (const operation of patch.operations) {
    const segments = operation.path.split('/').slice(1).map(decodePointerSegment);
    let parent = result;
    for (const segment of segments.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !(segment in parent)) throw new Error(`Audit Patch Path 不存在：${operation.path}`);
      parent = parent[segment];
    }
    const key = segments.at(-1);
    if (!parent || typeof parent !== 'object' || !(key in parent)) throw new Error(`Audit Patch Path 不存在：${operation.path}`);
    if (NON_WEAKENABLE_ARRAYS.test(operation.path)) {
      const before = parent[key];
      if (!Array.isArray(before) || !Array.isArray(operation.value) || before.some((item) => !operation.value.includes(item))) {
        throw Object.assign(new Error(`Audit Patch 不得削弱安全边界：${operation.path}`), { code: 'AUDIT_PATCH_WEAKENS_BOUNDARY', path: operation.path });
      }
    }
    parent[key] = operation.value;
  }
  return result;
}
