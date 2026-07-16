import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assessBenchmarkResults,
  validateBenchmarkManifest
} from '../../src/v5/brand-dna/benchmark-suite.js';

test('Brand DNA benchmark manifest contains 12 cross-domain projects and A/B/C comparisons', async () => {
  const filename = path.resolve('tests/fixtures/brand-dna-benchmark/manifest.json');
  const manifest = JSON.parse(await fs.readFile(filename, 'utf8'));
  assert.doesNotThrow(() => validateBenchmarkManifest(manifest));
  assert.equal(manifest.projects.length, 12);
  assert.ok(new Set(manifest.projects.map((item) => item.domain)).size >= 8);
});

test('system cannot claim benchmark or reusable protocol before real comparison records exist', () => {
  const assessment = assessBenchmarkResults([]);
  assert.equal(assessment.qualityTier, 'experimental');
  assert.equal(assessment.reusableProtocol, false);
  assert.match(assessment.reason, /不能宣称达到 GPT-5\.6 Benchmark/);
});

test('benchmark certification requires all hard thresholds and <=5 average point distance', () => {
  const records = Array.from({ length: 12 }, (_, index) => ({
    projectId: `project-${index + 1}`,
    deepProtocolScore: 88,
    gpt56BenchmarkScore: 92,
    evidenceScore: 18,
    strategyScore: 18,
    imageExecutionScore: 9,
    hardFailures: []
  }));
  const assessment = assessBenchmarkResults(records);
  assert.equal(assessment.qualityTier, 'benchmark');
  assert.equal(assessment.reusableProtocol, true);
  assert.equal(assessment.distanceFromBenchmark, 4);
});
