// Regenerate A/B snapshots for the v2.1 good-set fixtures (doc deliverable).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as v2 from '../src/v5/visual-translation/v2/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'tests', 'fixtures', 'visual-direction-v2');
const SNAP = join(HERE, '..', 'tests', 'snapshots', 'visual-direction-v2');
mkdirSync(SNAP, { recursive: true });
const PROJECTS = ['jiuzhou-meixue', 'mingjitang', 'vanke-suwan'];

function load(project, file) {
  return JSON.parse(readFileSync(join(FIX, project, file), 'utf8'));
}
function projectContext(project) {
  const ei = load(project, 'evidence-index.json');
  const ab = load(project, 'asset-boundary.json');
  return {
    evidenceIndex: ei, assetBoundary: ab,
    audienceBoundary: load(project, 'audience-boundary.json'),
    selectedTouchpoints: load(project, 'selected-touchpoints.json'),
    brandFacts: { reportLanguage: 'zh-CN' },
    evidenceIds: new Set(ei.map((e) => e.evidence_id)),
    allowedAssetIds: new Set(ab.allowed_assets.map((a) => a.asset_id)),
    restrictedAssetIds: new Set(ab.restricted_assets.map((a) => a.asset_id))
  };
}
function projectConfig(project, humanPreference = 'v2') {
  const ctx = projectContext(project);
  return {
    projectId: project,
    brandFacts: ctx.brandFacts,
    evidenceIndex: ctx.evidenceIndex,
    assetBoundary: ctx.assetBoundary,
    audienceBoundary: ctx.audienceBoundary,
    selectedTouchpoints: ctx.selectedTouchpoints,
    v1Directions: load(project, 'v1-directions.json'),
    v2Directions: load(project, 'v2-directions.json'),
    humanPreference
  };
}

const configs = PROJECTS.map((p) => projectConfig(p));
for (const project of PROJECTS) {
  const cfg = projectConfig(project);
  const cmp = v2.runABComparison(cfg);
  writeFileSync(join(SNAP, `${project}-ab.json`), JSON.stringify(cmp, null, 2) + '\n', 'utf8');
  console.log(`wrote ${project}-ab.json (verdict=${cmp.project_verdict})`);
}
const summary = v2.runABRunner(configs);
writeFileSync(join(SNAP, 'ab-runner-summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
console.log(`wrote ab-runner-summary.json (meeting=${summary.projects_meeting_criteria}/${summary.project_count}, merge=${summary.merge_recommendation})`);
