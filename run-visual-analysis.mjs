import fs from 'node:fs/promises';
import path from 'node:path';
import { runVisualTranslationV1 } from './src/v5/visual-translation/v1/index.js';
import { createQwenReasoner } from './src/v5/adapters/qwen-reasoner.js';

async function main() {
  const docPath = 'F:/咩咩/以往工作/2026/九州美学/九州美学品牌定位提案-1.1.txt';
  const outputDir = 'E:/Masterpiece-OS/projects/jiuzhou-aesthetics-test/outputs';
  const checkpointDir = 'E:/Masterpiece-OS/projects/jiuzhou-aesthetics-test/.runtime';

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(checkpointDir, { recursive: true });

  const text = await fs.readFile(docPath, 'utf8');
  console.log(`Document loaded: ${text.length} characters`);

  const reasoner = createQwenReasoner({ model: 'qwen3.6-plus' });

  const checkpoints = {};
  let checkpointCount = 0;

  const result = await runVisualTranslationV1({
    projectId: 'jiuzhou-aesthetics-test',
    corpus: {
      documents: [{
        id: 'doc-1',
        filename: '九州美学品牌定位提案-1.1(1).docx',
        sourceType: 'docx',
        rawText: text,
        characterCount: text.length
      }]
    },
    reasoner,
    provider: 'qwen',
    modelId: 'qwen3.6-plus',
    reportMode: 'decision',
    onCheckpoint(stage, value) {
      checkpoints[stage] = structuredClone(value);
      checkpointCount++;
      console.log(`[Checkpoint ${checkpointCount}] Stage: ${stage}`);
    }
  });

  const reportPath = path.join(outputDir, 'visual-directions-decision-report.md');
  await fs.writeFile(reportPath, result.reportMarkdown, 'utf8');
  console.log(`\nReport saved: ${reportPath}`);
  console.log(`Report length: ${result.reportMarkdown.length} characters`);
  console.log(`Total checkpoints: ${checkpointCount}`);

  // Save checkpoints for debugging
  const checkpointPath = path.join(checkpointDir, 'checkpoints.json');
  await fs.writeFile(checkpointPath, JSON.stringify({
    projectId: 'jiuzhou-aesthetics-test',
    savedAt: new Date().toISOString(),
    stages: Object.keys(checkpoints)
  }, null, 2), 'utf8');
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.code) console.error('Code:', err.code);
  process.exit(1);
});
