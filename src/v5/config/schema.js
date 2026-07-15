import { V5_DEFAULTS, V5_OFFICIAL_OUTPUT_FILES, V5_VERSION } from './defaults.js';

export class V5ConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'V5ConfigError';
    this.code = code;
  }
}

function strings(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new V5ConfigError('CONFIG_INVALID', `${field} 必须是非空字符串数组`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function optionalString(value, field, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw new V5ConfigError('CONFIG_INVALID', `${field} 必须是字符串`);
  return value.trim();
}

export function createV5ProjectConfig(raw = {}, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new V5ConfigError('CONFIG_INVALID', 'v5 项目配置必须是对象');
  }
  const suppliedOverrides = raw.overrides || {};
  const outputLanguage = suppliedOverrides.outputLanguage || raw.outputLanguage || 'zh-CN';
  if (!Object.hasOwn(V5_OFFICIAL_OUTPUT_FILES, outputLanguage)) {
    throw new V5ConfigError('CONFIG_INVALID', 'outputLanguage 只允许 zh-CN 或 en');
  }
  const allowLogoRedesign = suppliedOverrides.allowLogoRedesign ?? false;
  if (typeof allowLogoRedesign !== 'boolean') {
    throw new V5ConfigError('CONFIG_INVALID', 'overrides.allowLogoRedesign 必须是布尔值');
  }

  const brandFacts = raw.brandFacts || {};
  const projectName = optionalString(raw.projectName, 'projectName', options.projectName || '未命名项目');
  const brandName = optionalString(
    brandFacts.brandName ?? raw.brand?.name,
    'brandFacts.brandName',
    projectName
  );
  const industry = optionalString(brandFacts.industry ?? raw.industry, 'brandFacts.industry', '待确认');
  const additionalLockedAssets = strings(suppliedOverrides.additionalLockedAssets, 'overrides.additionalLockedAssets');

  return Object.freeze({
    version: V5_VERSION,
    projectName,
    userTask: optionalString(raw.userTask, 'userTask'),
    brandFacts: Object.freeze({
      brandName,
      industry,
      factualConstraints: Object.freeze(strings(brandFacts.factualConstraints, 'brandFacts.factualConstraints')),
      logoAssets: Object.freeze(strings(brandFacts.logoAssets, 'brandFacts.logoAssets'))
    }),
    overrides: Object.freeze({
      additionalLockedAssets: Object.freeze(additionalLockedAssets),
      allowLogoRedesign,
      requiredApplications: Object.freeze(strings(suppliedOverrides.requiredApplications, 'overrides.requiredApplications')),
      forbiddenChanges: Object.freeze(strings(suppliedOverrides.forbiddenChanges, 'overrides.forbiddenChanges')),
      outputLanguage
    }),
    runtime: Object.freeze({
      analysisMode: V5_DEFAULTS.analysisMode,
      creativeAuthority: V5_DEFAULTS.creativeAuthority,
      lockedVisualAssets: Object.freeze([
        ...(allowLogoRedesign ? [] : V5_DEFAULTS.lockedVisualAssets),
        ...additionalLockedAssets
      ]),
      officialOutputFile: V5_OFFICIAL_OUTPUT_FILES[outputLanguage],
      useCompilerPipeline: false,
      useCreativeFreedomRecommendation: false,
      useModeRecommendation: false,
      useSeparateRuntimeProtocol: false
    }),
    deepCreativeDirectorResult: raw.deepCreativeDirectorResult
      ? structuredClone(raw.deepCreativeDirectorResult)
      : null
  });
}
