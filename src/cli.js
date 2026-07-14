import path from 'node:path';
import fs from 'node:fs/promises';
import { inventoryProject } from './inventory.js';
import { runPipeline } from './pipeline.js';
import { initializeProject, formatInitializationSummary } from './project-initializer.js';
import { selectProject } from './project-selector.js';
import { ensureDir, writeText } from './utils.js';

const HELP = `Masterpiece-OS v3.2 — AI Creative Brief Generator

用法：
  masterpiece-os analyze --project <项目名称> [--online] [--debug]
  masterpiece-os analyze <素材目录> [--output <目录>] [--config <文件>] [--online]
  masterpiece-os inventory <素材目录> [--json]
  masterpiece-os init <项目目录> [--name <品牌名>]
  masterpiece-os help

命令：
  analyze    从视觉素材生成项目分析、Creative Brief 与两份评审
  inventory  盘点 ZIP、PDF、PPT/PPTX、图片及常用文本素材
  init       创建独立项目配置模板和 assets 目录

Creative Brief 工作流：
  Original Intent → Industry Benchmark → Creative Decision → Approved Brand DNA → Creative Brief

固定输出：
  01-项目分析报告.md
  02-Creative-Brief.md
  03-Knowledge-Review.md
  04-Design-Review.md

选项：
  --project          projects/ 下的一级项目名称；只有一个项目时可省略
  -o, --output       直接素材目录模式的输出目录；项目模式固定写入项目 outputs/
  -c, --config       JSON 配置文件；项目模式默认读取项目根目录 masterpiece-os.json
  --thinking-dir     五个 Thinking Framework 文件所在目录
  --online           联网检索对标候选；失败时使用内置案例库
  --debug            额外输出 masterpiece-os-result.json
  --json             inventory 命令输出 JSON
`;

function parseArgs(args) {
  const positional = [];
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--online' || arg === '--json' || arg === '--debug') options[arg.slice(2)] = true;
    else if (arg === '--review' || arg === '--research') options.mode = 'brief';
    else if (['--output', '-o', '--config', '-c', '--name', '--thinking-dir', '--knowledge-dir', '--history-dir', '--project', '--mode'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error(`${arg} 缺少参数值`);
      const key = ({
        '--output': 'output', '-o': 'output', '--config': 'config', '-c': 'config', '--name': 'name',
        '--thinking-dir': 'thinkingDir', '--knowledge-dir': 'thinkingDir', '--history-dir': 'historyDir',
        '--project': 'project', '--mode': 'mode'
      })[arg];
      options[key] = value;
    } else if (arg.startsWith('-')) throw new Error(`未知选项：${arg}`);
    else positional.push(arg);
  }
  return { positional, options };
}

function initialConfig(name) {
  return {
    projectName: name,
    projectType: '待确认',
    industry: '待确认',
    brand: {
      name,
      primaryColor: null,
      secondaryColors: [],
      fonts: [],
      fontTemperament: '',
      packaging: [],
      coreVisualAssets: []
    },
    benchmarks: [],
    commonTraits: [],
    visualInspection: {
      verified: false,
      inspectedImageCount: 0,
      inspectedImages: [],
      findings: []
    },
    brandDnaDecision: {
      originalIntent: { statement: '', evidence: [] },
      industryBenchmark: { observations: [], opportunities: [], references: [] },
      creativeDecision: { statement: '', rationale: [], tradeoffs: [] },
      approvedBrandDNA: {
        logo: '', color: '', typography: '', composition: '', whitespace: '', photography: '',
        materials: '', packaging: '', craft: ''
      },
      approval: { status: 'draft', approvedBy: '', approvedAt: '' }
    },
    creativeReasoning: {
      brandIdentity: { statement: '', evidence: [] },
      brandPositioning: { statement: '', evidence: [] },
      designLanguage: { statement: '', rationale: [], principles: [] },
      emotionalDirection: { statement: '', desiredFeelings: [], avoidFeelings: [], evidence: [] },
      photographyDirection: { lighting: '', framing: '', depth: '', materials: '', atmosphere: '' },
      designRisks: [],
      mustKeep: [],
      canExplore: [],
      designGoal: ''
    },
    thinkingQuestions: { identity: [], emotion: [], visual: [], brand: [], portfolio: [] }
  };
}

async function createStandaloneProject(dir, name) {
  const root = path.resolve(dir);
  await ensureDir(path.join(root, 'assets'));
  const configFile = path.join(root, 'masterpiece-os.json');
  try {
    await fs.access(configFile);
    throw new Error(`配置已存在，未覆盖：${configFile}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeText(configFile, `${JSON.stringify(initialConfig(name || path.basename(root)), null, 2)}\n`);
  return configFile;
}

export async function main(args) {
  const command = args[0] || 'help';
  const { positional, options } = parseArgs(args.slice(1));
  if (['help', '--help', '-h'].includes(command)) {
    console.log(HELP);
    return;
  }
  if (command === 'init') {
    if (!positional[0]) throw new Error('请提供项目目录');
    console.log(`已创建：${await createStandaloneProject(positional[0], options.name)}`);
    return;
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
    if (positional.length > 1) throw new Error('analyze 最多接受一个素材目录');
    if (positional[0] && options.project) throw new Error('不能同时使用素材目录和 --project，请选择一种分析模式');
    let input = positional[0];
    const pipelineOptions = { ...options };
    if (!input) {
      if (options.output) throw new Error('项目模式的输出目录固定为 projects/<项目>/outputs/，不能使用 --output');
      const selected = await selectProject({ projectName: options.project });
      const initialized = await initializeProject(selected.projectRoot, { projectsRoot: selected.projectsRoot });
      console.log(formatInitializationSummary(initialized));
      input = initialized.inputDir;
      pipelineOptions.output = initialized.outputsDir;
      delete pipelineOptions.project;
      try {
        await fs.access(selected.configFile);
        if (!pipelineOptions.config) pipelineOptions.config = selected.configFile;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const { result, output } = await runPipeline(input, pipelineOptions);
    console.log(`Creative Brief 已完成：${result.brandLock.brandName}`);
    console.log(`素材 ${result.inventory.totalFiles} 个，其中图片 ${result.inventory.imageCount} 张`);
    console.log(`视觉核验：${result.creativeReasoning.visualInspection.inspectedImageCount}/${result.creativeReasoning.visualInspection.totalImages} 张`);
    console.log(`Brand DNA Decision：${result.brandDnaDecision.status}`);
    console.log(`输出文件：${result.outputFiles.join('、')}`);
    console.log(`耗时：${result.durationMs} ms`);
    console.log(`输出目录：${output}`);
    return;
  }
  throw new Error(`未知命令：${command}\n\n${HELP}`);
}
