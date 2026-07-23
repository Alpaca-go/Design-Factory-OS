import fs from 'node:fs/promises';
import path from 'node:path';

export async function discoverQualitySources(roots, { recursive = true } = {}) {
  const resolvedRoots = [...new Set(normalizeRoots(roots).map((root) => path.resolve(root)))];
  const files = [];
  for (const root of resolvedRoots) await visit(root, recursive, files);
  return files.sort((left, right) => left.localeCompare(right));
}

async function visit(target, recursive, files) {
  const stat = await fs.stat(target);
  if (stat.isFile()) {
    if (isCandidate(target)) files.push(target);
    return;
  }
  if (!stat.isDirectory()) return;
  const entries = await fs.readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isFile() && isCandidate(child)) files.push(child);
    else if (recursive && entry.isDirectory() && !ignoredDirectory(entry.name)) await visit(child, true, files);
  }
}

function normalizeRoots(roots) {
  const values = Array.isArray(roots) ? roots : [roots];
  if (!values.length || values.some((root) => typeof root !== 'string' || !root.trim())) throw new TypeError('At least one project root is required');
  return values;
}

function isCandidate(file) {
  return path.extname(file).toLowerCase() === '.json' && path.basename(file).toLowerCase() !== 'shadow-validation.json';
}

function ignoredDirectory(name) {
  return name === 'node_modules' || name === '.git';
}
