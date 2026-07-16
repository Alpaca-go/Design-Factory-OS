import { sanitizeFilenamePart } from './analysis-contract.ts';

export function buildBrandDnaReportFilename(projectName: string, model: string): string {
  return `${sanitizeFilenamePart(projectName)}-品牌DNA与创意转译报告-${sanitizeFilenamePart(model)}.md`;
}
