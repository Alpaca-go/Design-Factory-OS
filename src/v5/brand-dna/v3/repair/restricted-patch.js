const ALLOWED_ROOTS = ['/identity/industry', '/identity/businessRole', '/identity/brandPositioning', '/creativeThesis', '/visualMechanisms', '/audiences', '/genes'];

function decode(segment) { return segment.replaceAll('~1', '/').replaceAll('~0', '~'); }

export function validateRestrictedPatch(value, allowedPaths) {
  if (!value || !Array.isArray(value.operations)) throw new Error('Decision Patch 缺少 operations');
  const whitelist = new Set(allowedPaths);
  const operations = value.operations.map((operation, index) => {
    if (!['replace', 'add'].includes(operation?.op)) throw new Error(`operations[${index}].op 不允许`);
    const path = String(operation.path || '');
    if (!ALLOWED_ROOTS.some((root) => path === root || path.startsWith(`${root}/`)) || ![...whitelist].some((allowed) => path === allowed || path.startsWith(`${allowed}/`))) {
      throw Object.assign(new Error(`Patch Path 不允许：${path}`), { code: 'PATCH_PATH_NOT_ALLOWED', path });
    }
    return { op: operation.op, path, value: operation.value };
  });
  const uncovered = allowedPaths.filter((allowed) => !operations.some((operation) => operation.path === allowed || operation.path.startsWith(`${allowed}/`) || allowed.startsWith(`${operation.path}/`)));
  if (uncovered.length) throw Object.assign(new Error(`Decision Patch 未覆盖全部失败路径：${uncovered.join('、')}`), { code: 'PATCH_PATHS_INCOMPLETE', paths: uncovered });
  return { operations };
}

export function applyRestrictedPatch(target, patch) {
  const result = structuredClone(target);
  for (const operation of patch.operations) {
    const segments = operation.path.split('/').slice(1).map(decode);
    let parent = result;
    for (const segment of segments.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !(segment in parent)) throw new Error(`Patch Path 不存在：${operation.path}`);
      parent = parent[segment];
    }
    parent[segments.at(-1)] = operation.value;
  }
  return result;
}

export function buildRestrictedPatchPrompt(decision, issues) {
  const paths = [...new Set(issues.filter((item) => item.patchable).map((item) => item.path))];
  const selected = Object.fromEntries(paths.map((path) => [path, path.split('/').slice(1).reduce((value, key) => value?.[key], decision)]));
  return { paths, messages: [{ role: 'user', content: `PROTOCOL_STAGE=decision-patch\n只修复列出的 JSON Path，不得修改其他字段，不得新增事实。必须覆盖每一个允许路径；一个父路径替换可同时覆盖其子路径。只返回 {"operations":[{"op":"replace|add","path":"允许路径","value":...}]}。\n允许路径：${JSON.stringify(paths)}\n问题：${JSON.stringify(issues)}\n当前值：${JSON.stringify(selected)}` }] };
}
