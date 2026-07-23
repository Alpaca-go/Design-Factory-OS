#!/usr/bin/env node
import { runReferenceTranslation } from '../src/reference-translation/run-reference-translation.js';

function parse(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === '--force') {
      options.force = true;
      continue;
    }
    if (!['--visual-analysis', '--project-context', '--output', '--preference'].includes(key)) {
      throw new Error(`未知参数：${key}`);
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${key} 缺少参数值`);
    options[{
      '--visual-analysis': 'visualAnalysisPath',
      '--project-context': 'projectContextPath',
      '--output': 'outputPath',
      '--preference': 'preference'
    }[key]] = value;
  }
  return options;
}

try {
  const result = await runReferenceTranslation(parse(process.argv.slice(2)));
  console.log(`Reference Translation：${result.run.cache_hit ? '复用缓存' : '已完成'}`);
  console.log(`输出：${result.outputPath}`);
  console.log(`运行记录：${result.runPath}`);
  console.log(`参考完整度：${result.profile.referenceIdentity.completeness}`);
  console.log(`转译矩阵：${result.profile.projectTranslationMatrix.length} 项`);
} catch (error) {
  console.error(`Reference Translation 失败：${error.message}`);
  process.exitCode = 1;
}

