import { arrayValue, enumValue, numberValue, objectValue, stringArray, stringValue } from '../../runtime-contracts.js';

const AUDIT_ROOTS = ['/decision', '/visualSystemTaskPlan', '/compiledImageTasks'];
const DIMENSION_KEYS = ['identityAccuracy', 'evidenceBoundary', 'strategicDepth', 'geneDistinctiveness', 'thesisCoverage', 'visualDistinctiveness', 'taskExecutability', 'crossFieldConsistency'];
function validAuditPath(path) { return AUDIT_ROOTS.some((root) => path === root || path.startsWith(`${root}/`)); }
function canonicalAuditPath(value) {
  const raw = String(value || '').trim();
  if (validAuditPath(raw)) return raw;
  const displayRoot = raw
    .replace(/^\/(?:Compiled[ _-]?Prompts?|Compiled[ _-]?Image[ _-]?Tasks?)(?=\/|$)/i, '/compiledImageTasks')
    .replace(/^\/(?:Visual[ _-]?System|VisualSystemTaskPlan)(?=\/|$)/i, '/visualSystemTaskPlan');
  if (validAuditPath(displayRoot)) return displayRoot;
  if (/^\/(?:identity|audiences|strategy|genes|oneSentenceDna|diagnosis|creativeThesis|visualMechanisms|pendingConfirmations)(?:\/|$)/.test(raw)) return `/decision${raw}`;
  if (/^\/(?:distinctiveAssets|directions|imageSystem|generationBoundary|taskPlan)(?:\/|$)/.test(raw)) return `/visualSystemTaskPlan${raw}`;
  return raw;
}
function snakeCase(value) { return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`); }
function dimensionScore(dimensions, key, fallback) {
  const raw = dimensions[key] ?? dimensions[snakeCase(key)];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return fallback;
  return numberValue(numeric <= 1 && numeric >= 0 ? numeric * 100 : numeric, `finalAudit.dimensions.${key}`, { min: 0, max: 100 });
}

export function validateFinalAudit(value) {
  const audit = objectValue(value?.finalAudit || value, 'finalAudit');
  const dimensions = audit.dimensions && typeof audit.dimensions === 'object' ? audit.dimensions : {};
  const issues = arrayValue(audit.issues || [], 'finalAudit.issues').map((raw, index) => {
    const path = `finalAudit.issues[${index}]`;
    const item = objectValue(raw, path);
    const issuePath = canonicalAuditPath(stringValue(item.path, `${path}.path`));
    if (!validAuditPath(issuePath)) throw new Error(`${path}.path 必须指向统一审计对象：${issuePath}`);
    const allowedRepairPaths = stringArray(item.allowedRepairPaths, `${path}.allowedRepairPaths`, { min: 1 }).map(canonicalAuditPath);
    if (allowedRepairPaths.some((itemPath) => !validAuditPath(itemPath))) throw new Error(`${path}.allowedRepairPaths 必须指向统一审计对象：${allowedRepairPaths.join('、')}`);
    return { issueId: `issue-${index + 1}`, severity: enumValue(item.severity, ['critical', 'major', 'minor'], `${path}.severity`), path: issuePath, reason: stringValue(item.reason, `${path}.reason`), allowedRepairPaths };
  });
  const status = enumValue(audit.status, ['pass', 'needs-patch', 'fail'], 'finalAudit.status');
  const score = numberValue(audit.score, 'finalAudit.score', { min: 0, max: 100 });
  if (status === 'pass' && issues.some((item) => item.severity !== 'minor')) throw new Error('finalAudit.status=pass 时不得包含 critical/major 问题');
  return {
    status,
    score,
    dimensions: Object.fromEntries(DIMENSION_KEYS.map((key) => [key, dimensionScore(dimensions, key, score)])),
    issues
  };
}
