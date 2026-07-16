import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createProjectStore } from '../src/main/project-store.ts';
import type { PublicSettings } from '../src/shared/types.ts';

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

test('folder intake creates fixed metadata, imports assets, and detects Logo without credentials', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-desktop-intake-'));
  try {
    const source = path.join(temporary, '九州医美视觉方案');
    const data = path.join(temporary, 'data');
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, '九州美学-品牌Logo.png'), ONE_PIXEL_PNG);
    const settings: PublicSettings = {
      profiles: [{
        id: 'profile-test',
        displayName: 'Test Qwen',
        provider: 'qwen',
        baseUrl: 'https://example.invalid/compatible-mode/v1',
        modelId: 'qwen3-vl-plus',
        credentialKey: 'masterpiece-os/profile-test',
        hasApiKey: true,
        isDefault: true,
        isEnabled: true,
        qualityTier: 'experimental',
        createdAt: '2026-07-16T00:00:00.000Z',
        updatedAt: '2026-07-16T00:00:00.000Z'
      }],
      defaultProfileId: 'profile-test',
      provider: 'qwen',
      baseUrl: 'https://example.invalid/compatible-mode/v1',
      model: 'qwen3-vl-plus',
      hasApiKey: true,
      defaultDataPath: data,
      cacheEnabled: true,
      logLevel: 'info',
      usageTrackingEnabled: true,
      showUsageSummary: true,
      showCostEstimate: true,
      connectionStatus: 'untested'
    };
    const store = createProjectStore(async () => settings);
    const project = await store.create({ sourcePaths: [source], apiProfileId: 'profile-test' });
    const summary = await store.scan(project.id);
    const paths = await store.paths(project.id);
    const stored = await fs.readFile(path.join(paths.root, 'project.json'), 'utf8');

    assert.equal(project.projectName, '九州医美');
    assert.equal(project.projectNameSource, 'uploaded-folder-name');
    assert.equal(project.logoLocked, true);
    assert.equal(project.outputLanguage, 'zh-CN');
    assert.equal(project.analysisProfile, 'fusion-enhanced');
    assert.equal(summary.imageCount, 1);
    assert.equal(summary.logoDetected, true);
    assert.match(project.detectedIndustry, /医学美学/);
    assert.doesNotMatch(stored, /apiKey|encryptedApiKey/i);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('ZIP intake persists only extracted valid assets, deduplicates by SHA-256, and supports deletion', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-desktop-zip-'));
  try {
    const data = path.join(temporary, 'data');
    const archive = path.join(temporary, 'input.zip');
    const zip = new AdmZip();
    zip.addFile('方案/九州美学-01.png', ONE_PIXEL_PNG);
    zip.addFile('方案/九州美学-copy.png', ONE_PIXEL_PNG);
    zip.addFile('方案/readme.txt', Buffer.from('ignored'));
    zip.writeZip(archive);
    const settings: PublicSettings = {
      profiles: [{
        id: 'profile-test',
        displayName: 'Test Qwen',
        provider: 'qwen',
        baseUrl: 'https://example.invalid/v1',
        modelId: 'qwen3-vl-plus',
        credentialKey: 'masterpiece-os/profile-test',
        hasApiKey: true,
        isDefault: true,
        isEnabled: true,
        qualityTier: 'experimental',
        createdAt: '2026-07-16T00:00:00.000Z',
        updatedAt: '2026-07-16T00:00:00.000Z'
      }],
      defaultProfileId: 'profile-test',
      provider: 'qwen',
      baseUrl: 'https://example.invalid/v1',
      model: 'qwen3-vl-plus',
      hasApiKey: true,
      defaultDataPath: data,
      cacheEnabled: true,
      logLevel: 'info',
      usageTrackingEnabled: true,
      showUsageSummary: true,
      showCostEstimate: true,
      connectionStatus: 'untested'
    };
    const store = createProjectStore(async () => settings);
    const project = await store.create({ sourcePaths: [archive], apiProfileId: 'profile-test' });
    const summary = await store.scan(project.id);
    const paths = await store.paths(project.id);
    const inputFiles = await fs.readdir(paths.input, { recursive: true });

    assert.equal(summary.totalFiles, 1);
    assert.equal(summary.items[0]?.sourceType, 'archive-extracted');
    assert.equal(summary.items[0]?.archiveSourceName, 'input.zip');
    assert.ok(!inputFiles.some((filename) => String(filename).toLowerCase().endsWith('.zip')));
    assert.match(project.projectName, /^视觉项目-\d{8}-\d{6}$/);

    const cleared = await store.removeAsset(project.id, summary.items[0]!.id);
    assert.equal(cleared.totalFiles, 0);
    assert.equal((await store.get(project.id)).status, 'draft');

    await store.remove(project.id);
    assert.equal(await fs.stat(paths.root).then(() => true).catch(() => false), false);
    assert.equal((await store.list()).some((item) => item.id === project.id), false);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
