import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { ensureDir, relativePortable, writeText } from '../../utils.js';

const CACHE_VERSION = 1;
const CACHE_DIRECTORY = path.join('.runtime', 'cache');
const CACHE_FILENAME = 'visual-inventory.json';
const CONTACT_SHEET_FILENAME = 'contact-sheet.png';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function assetFingerprint(inventory) {
  const records = await Promise.all(inventory.items.map(async (item) => {
    const file = path.resolve(inventory.root, item.path);
    const stat = await fs.stat(file);
    return [item.path, stat.size, Math.trunc(stat.mtimeMs)];
  }));
  return crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

function metadataIndex(inventory) {
  return inventory.items.map((item, index) => Object.freeze({
    assetId: `asset-${String(index + 1).padStart(3, '0')}`,
    path: item.path,
    type: item.type,
    extension: item.extension,
    bytes: item.bytes,
    isImage: item.isImage,
    width: item.detail?.width ?? null,
    height: item.detail?.height ?? null,
    warning: item.warning ?? null
  }));
}

function priorityAssets(index, config, maximum) {
  const images = index.filter((item) => item.isImage && !item.warning);
  if (images.length <= maximum) return images;
  const logoNames = new Set(config.brandFacts.logoAssets.map((item) => item.replaceAll('\\', '/').toLowerCase()));
  const picked = [];
  for (const image of images) {
    const normalized = image.path.toLowerCase();
    if ([...logoNames].some((logo) => normalized === logo || normalized.endsWith(`/${logo}`))) picked.push(image);
  }
  const remainingSlots = Math.max(0, maximum - picked.length);
  const candidates = images.filter((item) => !picked.includes(item));
  for (let slot = 0; slot < remainingSlots && candidates.length; slot += 1) {
    const position = remainingSlots === 1
      ? Math.floor((candidates.length - 1) / 2)
      : Math.round(slot * (candidates.length - 1) / (remainingSlots - 1));
    if (!picked.includes(candidates[position])) picked.push(candidates[position]);
  }
  return picked.slice(0, maximum);
}

async function writeContactSheetPng(inventory, index, contactSheetPath) {
  const images = index.filter((item) => item.isImage && !item.warning);
  const columns = Math.min(4, Math.max(1, images.length));
  const tileWidth = 390;
  const tileHeight = 300;
  const headerHeight = 70;
  const width = columns * tileWidth;
  const rows = Math.ceil(images.length / columns);
  const height = headerHeight + Math.max(1, rows) * tileHeight;
  const composites = [];
  composites.push({
    input: Buffer.from(`<svg width="${width}" height="${headerHeight}">
      <text x="20" y="30" fill="#ffffff" font-family="Arial, sans-serif" font-size="20" font-weight="700">Masterpiece OS v5 · Batch Visual Contact Sheet</text>
      <text x="20" y="54" fill="#a8a8a8" font-family="Arial, sans-serif" font-size="13">${images.length} images · overview first, priority details only when necessary</text>
    </svg>`),
    top: 0,
    left: 0
  });
  for (const [position, item] of images.entries()) {
    const column = position % columns;
    const row = Math.floor(position / columns);
    const x = column * tileWidth;
    const y = headerHeight + row * tileHeight;
    const dimensions = item.width && item.height ? `${item.width}×${item.height}` : 'dimensions unknown';
    try {
      const thumbnail = await sharp(path.resolve(inventory.root, item.path), { animated: false })
        .rotate()
        .resize({ width: 354, height: 222, fit: 'contain', background: '#151515' })
        .png()
        .toBuffer();
      composites.push({ input: thumbnail, top: y + 18, left: x + 18 });
    } catch {
      // The inventory warning remains the source of truth; a failed thumbnail must not fail the project.
    }
    composites.push({
      input: Buffer.from(`<svg width="374" height="284">
        <rect x="0.5" y="0.5" width="373" height="283" rx="10" fill="none" stroke="#343434"/>
        <text x="10" y="252" fill="#ffffff" font-family="Arial, sans-serif" font-size="15">${escapeXml(item.assetId)} · ${escapeXml(item.path)}</text>
        <text x="10" y="274" fill="#a8a8a8" font-family="Arial, sans-serif" font-size="12">${escapeXml(dimensions)}</text>
      </svg>`),
      top: y + 8,
      left: x + 8
    });
  }
  await sharp({ create: { width, height, channels: 3, background: '#0b0b0b' } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(contactSheetPath);
}

async function readCache(cachePath, fingerprint) {
  try {
    const value = JSON.parse(await fs.readFile(cachePath, 'utf8'));
    if (value.version === CACHE_VERSION && value.fingerprint === fingerprint) return value;
  } catch (error) {
    if (error.code !== 'ENOENT' && error.name !== 'SyntaxError') throw error;
  }
  return null;
}

/** Prepare a batch-first visual package without performing any AI reasoning. */
export async function prepareVisualAssets(inventory, config, options = {}) {
  const cacheRoot = path.resolve(options.cacheRoot || path.join(options.projectRoot, CACHE_DIRECTORY));
  const cachePath = path.join(cacheRoot, CACHE_FILENAME);
  const contactSheetPath = path.join(cacheRoot, CONTACT_SHEET_FILENAME);
  const fingerprint = await assetFingerprint(inventory);
  const cached = options.disableCache ? null : await readCache(cachePath, fingerprint);
  const index = Object.freeze(metadataIndex(inventory));
  const maxDetailAssets = Math.max(1, Number(options.maxDetailAssets || config.performance.maxDetailAssets));
  const priority = Object.freeze(priorityAssets(index, config, maxDetailAssets));
  const useContactSheet = inventory.imageCount > maxDetailAssets;
  let contactSheetGenerated = false;
  let contactSheetTimeMs = 0;

  const contactSheetExists = (await fs.stat(contactSheetPath).catch(() => null))?.isFile() || false;
  if (!cached || (useContactSheet && !contactSheetExists)) {
    await ensureDir(cacheRoot);
    if (useContactSheet) {
      const contactSheetStarted = performance.now();
      await writeContactSheetPng(inventory, index, contactSheetPath);
      contactSheetTimeMs = performance.now() - contactSheetStarted;
      contactSheetGenerated = true;
    }
    await writeText(cachePath, `${JSON.stringify({
      version: CACHE_VERSION,
      fingerprint,
      generatedAt: new Date().toISOString(),
      contactSheet: CONTACT_SHEET_FILENAME,
      index
    }, null, 2)}\n`);
  }

  const attachments = [];
  if (useContactSheet) {
    attachments.push(Object.freeze({
      assetId: 'contact-sheet',
      path: contactSheetPath,
      mediaType: 'image',
      format: 'png-contact-sheet',
      readable: true
    }));
  }
  const priorityIds = new Set(priority.map((item) => item.assetId));
  for (const item of index) {
    if (item.isImage && useContactSheet && !priorityIds.has(item.assetId)) continue;
    attachments.push(Object.freeze({
      assetId: item.assetId,
      path: path.resolve(inventory.root, item.path),
      mediaType: item.isImage ? 'image' : 'document',
      format: item.extension,
      readable: !item.warning
    }));
  }

  return Object.freeze({
    cacheVersion: CACHE_VERSION,
    fingerprint,
    cacheHit: Boolean(cached) && !contactSheetGenerated,
    cachePath,
    contactSheetPath: useContactSheet ? contactSheetPath : null,
    contactSheetGenerated,
    contactSheetTimeMs,
    strategy: useContactSheet ? 'contact-sheet-plus-priority-details' : 'all-assets',
    totalAssets: inventory.totalFiles,
    totalImages: inventory.imageCount,
    maxDetailAssets,
    index,
    priorityAssetIds: Object.freeze(priority.map((item) => item.assetId)),
    attachmentCount: attachments.length,
    attachments: Object.freeze(attachments),
    runtimeFiles: Object.freeze([
      relativePortable(options.projectRoot, cachePath),
      ...(useContactSheet ? [relativePortable(options.projectRoot, contactSheetPath)] : [])
    ])
  });
}
