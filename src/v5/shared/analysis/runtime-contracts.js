function fail(path, expected) {
  throw Object.assign(new Error(`${path} 必须是${expected}`), { code: 'FAILED_SCHEMA', path });
}

export function objectValue(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '对象');
  return value;
}

export function stringValue(value, path, options = {}) {
  if (typeof value !== 'string') fail(path, '字符串');
  const result = value.trim();
  if (!options.allowEmpty && !result) fail(path, '非空字符串');
  if (options.maxLength && result.length > options.maxLength) {
    throw Object.assign(new Error(`${path} 不得超过 ${options.maxLength} 个字符`), { code: 'FAILED_SCHEMA', path });
  }
  return result;
}

export function numberValue(value, path, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(path, '有限数字');
  if (options.min !== undefined && number < options.min) throw Object.assign(new Error(`${path} 不得小于 ${options.min}`), { code: 'FAILED_SCHEMA', path });
  if (options.max !== undefined && number > options.max) throw Object.assign(new Error(`${path} 不得大于 ${options.max}`), { code: 'FAILED_SCHEMA', path });
  return number;
}

export function enumValue(value, allowed, path) {
  if (!allowed.includes(value)) throw Object.assign(new Error(`${path} 必须是 ${allowed.join('|')} 之一`), { code: 'FAILED_SCHEMA', path });
  return value;
}

export function arrayValue(value, path, options = {}) {
  if (!Array.isArray(value)) fail(path, '数组');
  if (options.min !== undefined && value.length < options.min) throw Object.assign(new Error(`${path} 至少需要 ${options.min} 项`), { code: 'FAILED_SCHEMA', path });
  if (options.max !== undefined && value.length > options.max) throw Object.assign(new Error(`${path} 最多允许 ${options.max} 项`), { code: 'FAILED_SCHEMA', path });
  return value;
}

export function stringArray(value, path, options = {}) {
  return arrayValue(value, path, options).map((item, index) => stringValue(item, `${path}[${index}]`, { maxLength: options.itemMaxLength }));
}
