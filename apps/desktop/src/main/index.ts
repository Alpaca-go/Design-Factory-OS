import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type {
  AnalysisProgress,
  ConnectionCapability,
  CreateProjectInput,
  SavePricingRuleInput,
  SaveApiProfileInput,
  SaveSettingsInput,
  UsageRecordQuery
} from '../shared/types';
import { createProjectStore } from './project-store';
import {
  deleteApiProfile,
  getProviderCredentials,
  getSettings,
  saveApiProfile,
  saveSettings,
  setApiProfileEnabled,
  setDefaultApiProfile,
  testApiProfile
} from './settings-store';
import { createPipelineService } from './pipeline-service';
import { createBrandDnaPipelineService } from './brand-dna-pipeline-service';
import { assertInside, sanitizeFilenamePart } from './analysis-contract';
import { createUsageDatabase, type UsageDatabase } from './usage-database';
import { createUsageTracker } from './usage-tracker';

// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { usageRecordsToCsv } from '../../../../src/v5/usage/usage-exporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;

const projects = createProjectStore(getSettings);
let usageDatabase: UsageDatabase | null = null;
try {
  usageDatabase = createUsageDatabase(path.join(app.getPath('userData'), 'usage', 'usage.sqlite'));
  usageDatabase.markInterruptedPending();
} catch (error) {
  console.warn('Usage 数据库初始化失败，模型分析将继续但本次不会记录用量', error);
}
const usageTracker = usageDatabase
  ? createUsageTracker(
      usageDatabase,
      getSettings,
      (message, error) => console.warn(message, error)
    )
  : undefined;
const pipeline = createPipelineService(
  projects,
  getProviderCredentials,
  getSettings,
  (progress: AnalysisProgress) => mainWindow?.webContents.send('analysis:progress', progress),
  usageTracker
);
const brandDnaPipeline = createBrandDnaPipelineService(
  projects,
  getProviderCredentials,
  (progress: AnalysisProgress) => mainWindow?.webContents.send('analysis:progress', progress),
  usageTracker
);

function safeUsageQuery(input: UsageRecordQuery | undefined): UsageRecordQuery {
  const query = input && typeof input === 'object' ? input : {};
  const text = (value: unknown, maximum = 200) => (
    typeof value === 'string' && value.length <= maximum ? value : undefined
  );
  const date = (value: unknown) => {
    const normalized = text(value);
    return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : undefined;
  };
  const statuses = new Set(['pending', 'success', 'failed', 'cancelled', 'timeout']);
  const status = text(query.status, 30);
  return {
    page: Number.isFinite(query.page) ? Math.max(1, Math.trunc(query.page!)) : 1,
    pageSize: Number.isFinite(query.pageSize) ? Math.min(200, Math.max(1, Math.trunc(query.pageSize!))) : 50,
    dateFrom: date(query.dateFrom),
    dateTo: date(query.dateTo),
    projectId: text(query.projectId),
    analysisMode: text(query.analysisMode),
    provider: text(query.provider),
    modelId: text(query.modelId),
    apiProfileId: text(query.apiProfileId),
    pipelineStage: text(query.pipelineStage),
    status: status && statuses.has(status) ? status as UsageRecordQuery['status'] : undefined
  };
}

function safeIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw new Error(`${label} 无效`);
  }
  return value.trim();
}

function requireUsageDatabase(): UsageDatabase {
  if (!usageDatabase) throw new Error('Usage 数据库当前不可用，模型分析功能不受影响');
  return usageDatabase;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#f4f2ed',
    title: 'Masterpiece OS Desktop',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:save', (_event, input: SaveSettingsInput) => saveSettings(input));
  ipcMain.handle('settings:save-profile', (_event, input: SaveApiProfileInput) => saveApiProfile(input));
  ipcMain.handle('settings:delete-profile', (_event, profileId: string) => deleteApiProfile(profileId));
  ipcMain.handle('settings:set-default-profile', (_event, profileId: string) => setDefaultApiProfile(profileId));
  ipcMain.handle('settings:set-profile-enabled', (_event, profileId: string, enabled: boolean) => setApiProfileEnabled(profileId, enabled));
  ipcMain.handle('settings:test-profile', (
    _event,
    input: SaveApiProfileInput,
    capability?: ConnectionCapability
  ) => testApiProfile(input, capability));

  ipcMain.handle('projects:list', () => projects.list());
  ipcMain.handle('projects:create', (_event, input: CreateProjectInput) => projects.create(input));
  ipcMain.handle('projects:get', (_event, projectId: string) => projects.get(projectId));
  ipcMain.handle('projects:remove', async (_event, projectId: string) => {
    const project = await projects.get(projectId);
    if (project.status === 'running') throw new Error('正在分析的项目不能删除，请先取消分析');
    await projects.remove(projectId);
  });
  ipcMain.handle('projects:scan-assets', (_event, projectId: string) => projects.scan(projectId));
  ipcMain.handle('projects:remove-asset', (_event, projectId: string, assetId: string) => projects.removeAsset(projectId, assetId));
  ipcMain.handle('projects:remove-batch', (_event, projectId: string, batchId: string) => projects.removeBatch(projectId, batchId));
  ipcMain.handle('projects:clear-assets', (_event, projectId: string) => projects.clearAssets(projectId));
  ipcMain.handle('projects:import-documents', (_event, projectId: string, paths: string[]) => projects.importDocuments(projectId, paths));
  ipcMain.handle('projects:scan-documents', (_event, projectId: string) => projects.scanDocuments(projectId));
  ipcMain.handle('projects:remove-document', (_event, projectId: string, documentId: string) => projects.removeDocument(projectId, documentId));
  ipcMain.handle('projects:clear-documents', (_event, projectId: string) => projects.clearDocuments(projectId));
  ipcMain.handle('projects:choose-files', async (_event, kind: 'assets' | 'logo' | 'brief' | 'documents') => {
    const filters = kind === 'documents'
      ? [{ name: '品牌策划文档', extensions: ['pdf', 'docx', 'md', 'markdown', 'txt'] }]
      : kind === 'logo'
      ? [{ name: 'Logo 图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
      : kind === 'brief'
        ? [{ name: '项目说明', extensions: ['md', 'txt', 'json', 'pdf'] }]
        : [{ name: '视觉方案', extensions: ['zip', 'jpg', 'jpeg', 'png', 'webp', 'pdf'] }];
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('projects:choose-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('projects:import-files', (
    _event,
    projectId: string,
    paths: string[],
    kind: 'assets' | 'logo' | 'brief'
  ) => projects.importFiles(projectId, paths, kind));

  ipcMain.handle('analysis:start', async (
    _event,
    projectId: string,
    forceReasoning: boolean,
    apiProfileId?: string,
    resumeMode?: 'continue' | 'rerun-current' | 'restart-all'
  ) => {
    const project = await projects.get(projectId);
    return project.mode === 'brand-dna'
      ? brandDnaPipeline.start(projectId, forceReasoning, apiProfileId, resumeMode)
      : pipeline.start(projectId, forceReasoning, apiProfileId);
  });
  ipcMain.handle('analysis:cancel', (_event, projectId: string) => (
    pipeline.cancel(projectId) || brandDnaPipeline.cancel(projectId)
  ));

  ipcMain.handle('report:read', async (_event, projectId: string) => {
    const project = await projects.get(projectId);
    if (!project.lastReportFilename) throw new Error('项目尚未生成报告');
    const paths = await projects.paths(projectId);
    return fs.readFile(assertInside(paths.outputs, path.join(paths.outputs, project.lastReportFilename)), 'utf8');
  });
  ipcMain.handle('report:rename', async (_event, projectId: string, requestedFilename: string) => {
    const project = await projects.get(projectId);
    if (!project.lastReportFilename) throw new Error('项目尚未生成报告');
    const base = sanitizeFilenamePart(path.parse(String(requestedFilename || '')).name);
    if (!base || base === '未命名') throw new Error('报告文件名不能为空');
    const filename = `${base}.md`;
    if (filename === project.lastReportFilename) return project;
    const paths = await projects.paths(projectId);
    const source = assertInside(paths.outputs, path.join(paths.outputs, project.lastReportFilename));
    const destination = assertInside(paths.outputs, path.join(paths.outputs, filename));
    if (await fs.stat(destination).then(() => true).catch(() => false)) throw new Error('输出目录中已存在同名报告');
    await fs.rename(source, destination);
    return projects.update(projectId, { lastReportFilename: filename });
  });
  ipcMain.handle('report:export', async (_event, projectId: string) => {
    const project = await projects.get(projectId);
    if (!project.lastReportFilename) throw new Error('项目尚未生成报告');
    const paths = await projects.paths(projectId);
    const source = assertInside(paths.outputs, path.join(paths.outputs, project.lastReportFilename));
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: project.lastReportFilename,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (result.canceled || !result.filePath) return null;
    await fs.copyFile(source, result.filePath);
    return result.filePath;
  });
  ipcMain.handle('report:open-folder', async (_event, projectId: string) => {
    const paths = await projects.paths(projectId);
    const result = await shell.openPath(paths.outputs);
    if (result) throw new Error(result);
  });

  ipcMain.handle('usage:list-records', (_event, query?: UsageRecordQuery) => (
    requireUsageDatabase().listRecords(safeUsageQuery(query))
  ));
  ipcMain.handle('usage:get-run-summary', (_event, analysisRunId: string) => (
    requireUsageDatabase().runSummary(safeIdentifier(analysisRunId, '分析运行 ID'))
  ));
  ipcMain.handle('usage:get-stage-details', (_event, analysisRunId: string) => (
    requireUsageDatabase().stageDetails(safeIdentifier(analysisRunId, '分析运行 ID'))
  ));
  ipcMain.handle('usage:get-month-summary', (_event, month?: string) => (
    requireUsageDatabase().monthSummary(month ? safeIdentifier(month, '月份') : undefined)
  ));
  ipcMain.handle('usage:export-csv', async (_event, query?: UsageRecordQuery) => {
    const database = requireUsageDatabase();
    const normalized = safeUsageQuery(query);
    const records = [];
    let page = 1;
    while (true) {
      const result = database.listRecords({ ...normalized, page, pageSize: 200 });
      records.push(...result.items);
      if (records.length >= result.total) break;
      page += 1;
    }
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `masterpiece-os-model-usage-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, usageRecordsToCsv(records), 'utf8');
    return result.filePath;
  });
  ipcMain.handle('usage:open-database-folder', async () => {
    const result = await shell.openPath(path.dirname(requireUsageDatabase().databasePath));
    if (result) throw new Error(result);
  });
  ipcMain.handle('usage:clear-history', () => requireUsageDatabase().clearHistory());
  ipcMain.handle('usage:list-pricing-rules', () => requireUsageDatabase().listPricingRules());
  ipcMain.handle('usage:save-pricing-rule', (_event, input: SavePricingRuleInput) => (
    requireUsageDatabase().savePricingRule(input)
  ));
  ipcMain.handle('usage:delete-pricing-rule', (_event, ruleId: string) => (
    requireUsageDatabase().deletePricingRule(safeIdentifier(ruleId, '价格规则 ID'))
  ));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
