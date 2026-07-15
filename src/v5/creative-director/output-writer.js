import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, writeText } from '../../utils.js';
import { V5_OFFICIAL_OUTPUT_FILES } from '../config/defaults.js';

export async function publishCreativeUpgradeReport(result, output, config) {
  await ensureDir(output);
  const filename = config.runtime.officialOutputFile;
  for (const retiredVariant of Object.values(V5_OFFICIAL_OUTPUT_FILES)) {
    if (retiredVariant !== filename) await fs.rm(path.join(output, retiredVariant), { force: true });
  }
  const reportPath = path.join(output, filename);
  await writeText(reportPath, `${result.reportMarkdown.trim()}\n`);
  return Object.freeze({ filename, path: reportPath, outputFiles: Object.freeze([filename]) });
}
