import { buildBrandDnaReportViewModel } from './report-v2/build-report-view-model.js';
import { compileBrandDnaReportV2 } from './report-v2/compile-brand-dna-report-v2.js';

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export { buildBrandDnaReportViewModel, compileBrandDnaReportV2 };

export function compileBrandDnaReport(dna, options = {}) {
  return compileBrandDnaReportV2(buildBrandDnaReportViewModel(dna, options));
}

export function recompileLegacyBrandDnaReport({
  brandDna,
  intermediates = {},
  metadata = {},
  sourceDocuments = []
}) {
  return compileBrandDnaReport(brandDna, {
    ...intermediates,
    metadata,
    sourceDocuments
  });
}

export function validateBrandDnaReport(markdown, options = {}) {
  for (let index = 0; index <= 9; index += 1) {
    if (!markdown.includes(`## ${index}.`)) {
      throw new Error(`品牌 DNA 报告 v2 缺少第 ${index} 章`);
    }
  }
  for (const appendix of ['## A1.', '## B.', '## C.', '## D.', '## E.']) {
    if (!markdown.includes(appendix)) throw new Error(`品牌 DNA 报告 v2 缺少附录：${appendix}`);
  }
  if (UUID_PATTERN.test(markdown)) throw new Error('品牌 DNA 报告不得显示 UUID');
  const mainReport = markdown.split('# 执行附录')[0];
  for (const internalEnum of ['anchor-image', 'product-or-service-scene', 'visual-system', 'detail-craft']) {
    if (mainReport.includes(internalEnum)) throw new Error(`主报告不得显示内部英文枚举：${internalEnum}`);
  }
  if (!markdown.includes('### 最终英文 Prompt\n\n```text')) {
    throw new Error('品牌 DNA 报告缺少独立 Prompt 代码块');
  }
  if (options.imageSystem && !options.imageSystem.systemId) {
    throw new Error('品牌 DNA 报告缺少图片系统 ID');
  }
  if (options.imageTasks?.some((task) => !(task.finalPrompt || task.prompt))) {
    throw new Error('品牌 DNA 报告包含缺少 finalPrompt 的图片任务');
  }
}
