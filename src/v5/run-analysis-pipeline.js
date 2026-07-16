import { runV5Pipeline } from './bootstrap.js';
import { runBrandDnaPipeline } from './brand-dna/run-brand-dna-pipeline.js';

export async function runAnalysisPipeline(input) {
  if (input?.mode === 'visual-evolution') {
    return runV5Pipeline(input.input, input.options || {});
  }
  if (input?.mode === 'brand-dna') {
    return runBrandDnaPipeline(input);
  }
  throw new Error(`未知 AnalysisMode：${String(input?.mode || '')}`);
}
