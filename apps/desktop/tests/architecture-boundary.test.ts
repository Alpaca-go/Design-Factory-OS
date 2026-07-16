import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');

async function filesUnder(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(target));
    else result.push(target);
  }
  return result;
}

test('core v5 never depends on Desktop', async () => {
  const files = await filesUnder(path.join(repositoryRoot, 'src', 'v5'));
  const source = (await Promise.all(files.filter((file) => file.endsWith('.js')).map((file) => fs.readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(source, /apps[\\/]desktop|desktop[\\/](src|out)/i);
});

test('Desktop calls runV5Pipeline directly and does not build terminal commands', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'main', 'pipeline-service.ts'), 'utf8');
  assert.match(source, /runV5Pipeline/);
  assert.doesNotMatch(source, /child_process|exec\s*\(|spawn\s*\(|npm run analyze/);
});

test('API Key is encrypted outside project records', async () => {
  const credentials = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'main', 'settings-store.ts'), 'utf8');
  const projects = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'main', 'project-store.ts'), 'utf8');
  assert.match(credentials, /safeStorage\.encryptStringAsync/);
  assert.match(credentials, /encryptedApiKey/);
  assert.doesNotMatch(projects, /apiKey|encryptedApiKey/);
});
