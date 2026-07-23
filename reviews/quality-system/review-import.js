import fs from 'node:fs/promises';
import { validateReviewImportRow } from './review-schema.js';

export async function importHumanReviews({ store, input, format } = {}) {
  if (!store || typeof store.load !== 'function' || typeof store.upsertReview !== 'function') throw new TypeError('A Shadow Result Store is required');
  const rows = await readRows(input, format);
  const items = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const validation = validateReviewImportRow(row);
    if (!validation.valid) {
      items.push({ index, status: 'failed', errors: validation.errors });
      continue;
    }
    const locator = { projectId: row.project_id, runId: row.run_id, module: row.module };
    try {
      const record = await store.load(locator);
      if (!record) throw new Error('Shadow validation result not found');
      const existing = (record.human_reviews || []).find((review) => review.anti_pattern_id === row.anti_pattern_id && review.reviewer_type === row.reviewer_type);
      const review = pickReview(row);
      if (existing && sameReview(existing, review)) {
        items.push({ index, status: 'skipped', reason: 'idempotent_duplicate' });
        continue;
      }
      await store.upsertReview(locator, review);
      items.push({ index, status: existing ? 'updated' : 'imported' });
    } catch (error) {
      items.push({ index, status: 'failed', errors: [error instanceof Error ? error.message : String(error)] });
    }
  }
  return {
    total: rows.length,
    imported: items.filter((item) => item.status === 'imported').length,
    updated: items.filter((item) => item.status === 'updated').length,
    skipped: items.filter((item) => item.status === 'skipped').length,
    failed: items.filter((item) => item.status === 'failed').length,
    items
  };
}

async function readRows(input, format) {
  const text = typeof input === 'string' && !looksLikeDocument(input) ? await fs.readFile(input, 'utf8') : String(input || '');
  const resolvedFormat = format || (text.trimStart().startsWith('{') || text.trimStart().startsWith('[') ? 'json' : 'jsonl');
  if (resolvedFormat === 'jsonl') return text.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line));
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.reviews)) return parsed.reviews;
  if (parsed && typeof parsed === 'object' && parsed.anti_pattern_id) return [parsed];
  throw new TypeError('JSON review import must be an array or contain reviews[]');
}

function looksLikeDocument(value) {
  const first = value.trimStart()[0];
  return first === '{' || first === '[' || value.includes('\n');
}

function pickReview(row) {
  return Object.fromEntries(['anti_pattern_id', 'system_detected', 'human_judgement', 'notes', 'reviewed_at', 'reviewer_type'].map((key) => [key, row[key]]));
}

function sameReview(left, right) {
  return Object.keys(right).every((key) => left[key] === right[key]);
}
