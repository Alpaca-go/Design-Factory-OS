import path from 'node:path';
import { writeText } from '../../utils.js';

export async function writeV5RunReport(projectRoot, report) {
  const file = path.join(projectRoot, '.runtime', 'run-report.json');
  await writeText(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}
