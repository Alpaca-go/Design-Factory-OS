import path from 'node:path';
import fs from 'node:fs/promises';
import { inventoryProject } from './inventory.js';
import { runPipeline } from './pipeline.js';
import { ensureDir, writeText } from './utils.js';

const HELP = `Design Factory OS v1.1\n\n用法：\n  design-factory analyze <素材目录> [--output <目录>] [--config <文件>] [--knowledge-dir <目录>] [--online]\n  design-factory inventory <素材目录> [--json]\n  design-factory init <项目目录> [--name <品牌名>]\n  design-factory help\n\n命令：\n  analyze    执行完整流水线并生成设计报告、Knowledge Candidate、Knowledge Analysis 及 JSON 数据\n  inventory  仅盘点 ZIP、PDF、PPT/PPTX、图片及常用文本素材\n  init       创建项目配置模板和素材目录\n\n选项：\n  -o, --output       报告输出目录，默认 <素材目录>/outputs\n  -c, --config       JSON 配置文件，默认 <素材目录>/design-factory.json\n  --knowledge-dir    Approved Rule 只读目录，默认系统 knowledge/approved\n  --online           联网检索对标候选；失败时自动使用内置案例库\n  --json             inventory 命令输出 JSON\n`;

function parseArgs(args) {
  const positional = [];
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--online' || arg === '--json') options[arg.slice(2)] = true;
    else if (['--output', '-o', '--config', '-c', '--name', '--knowledge-dir'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error(`${arg} 缺少参数值`);
      const key = ({ '--output': 'output', '-o': 'output', '--config': 'config', '-c': 'config', '--name': 'name', '--knowledge-dir': 'knowledgeDir' })[arg];
      options[key] = value;
    } else if (arg.startsWith('-')) throw new Error(`未知选项：${arg}`);
    else positional.push(arg);
  }
  return { positional, options };
}

async function initProject(dir, name) {
  const root = path.resolve(dir);
  await ensureDir(path.join(root, 'assets'));
  const configFile = path.join(root, 'design-factory.json');
  try { await fs.access(configFile); throw new Error(`配置已存在，未覆盖：${configFile}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = {
    projectName: name || path.basename(root), projectType: '品牌视觉优化', industry: '综合/待确认',
    brand: { name: name || path.basename(root), primaryColor: null, secondaryColors: [], fonts: [], fontTemperament: '', packaging: [], coreVisualAssets: [] },
    benchmarks: [], commonTraits: [], knowledgeCandidates: []
  };
  await writeText(configFile, `${JSON.stringify(config, null, 2)}\n`);
  return configFile;
}

export async function main(args) {
  const command = args[0] || 'help';
  const { positional, options } = parseArgs(args.slice(1));
  if (['help', '--help', '-h'].includes(command)) { console.log(HELP); return; }
  if (command === 'init') {
    if (!positional[0]) throw new Error('请提供项目目录');
    console.log(`已创建：${await initProject(positional[0], options.name)}`); return;
  }
  if (command === 'inventory') {
    if (!positional[0]) throw new Error('请提供素材目录');
    const result = await inventoryProject(positional[0]);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`文件：${result.totalFiles}，图片：${result.imageCount}，大小：${result.totalBytes} bytes`);
      for (const [type, count] of Object.entries(result.byType)) console.log(`- ${type}: ${count}`);
    }
    return;
  }
  if (command === 'analyze') {
    if (!positional[0]) throw new Error('请提供素材目录');
    const { result, output } = await runPipeline(positional[0], options);
    console.log(`分析完成：${result.brandLock.brandName}`);
    console.log(`素材 ${result.inventory.totalFiles} 个，规划图片 ${result.imagePlan.count} 张`);
    console.log(`知识建议：新增 ${result.knowledgeAnalysis.statistics.new}，更新 ${result.knowledgeAnalysis.statistics.update}，重复 ${result.knowledgeAnalysis.statistics.duplicate}，项目经验 ${result.knowledgeAnalysis.statistics.projectOnly}`);
    console.log(`输出目录：${output}`);
    return;
  }
  throw new Error(`未知命令：${command}\n\n${HELP}`);
}
