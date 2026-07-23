import path from 'node:path';
import {
  adaptReportQualityContext,
  adaptVisualDirectionQualityContext
} from '../../adapters/quality-context/index.js';

export function selectQualityAdapter(source, sourcePath = '') {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const stageId = source.checkpoint?.stageId;
  const run = source.result || source;
  const fileName = path.basename(sourcePath).toLowerCase();

  if (stageId === '10-local-report-compiler'
    || source.checkpoints?.['10-local-report-compiler']
    || source['10-local-report-compiler']
    || ((typeof run.reportMarkdown === 'string' || typeof run.markdown === 'string' || typeof run.report === 'string')
      && !hasDirectionOutput(source))) {
    return descriptor('report', adaptReportQualityContext);
  }

  if (stageId === '04-three-creative-directions'
    || stageId === '05-direction-recommendation'
    || source.checkpoints?.['04-three-creative-directions']
    || source['04-three-creative-directions']
    || hasDirectionOutput(source)
    || fileName.includes('visual-translation-result')) {
    return descriptor('visual_direction', adaptVisualDirectionQualityContext);
  }

  return null;
}

function descriptor(module, adapt) {
  return Object.freeze({ module, adapt });
}

function hasDirectionOutput(source) {
  const run = source.result || source;
  const value = run.directions || run.visualCreativeDirections || run.output?.directions;
  return Array.isArray(value) || Array.isArray(value?.directions) || Boolean(run.recommendation);
}
