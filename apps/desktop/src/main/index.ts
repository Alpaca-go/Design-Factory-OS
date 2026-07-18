import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type {
  AnalysisProgress,
  CreateProjectInput,
  SaveApiProfileInput,
  SaveSettingsInput,
  StartVisualTranslationInput,
  VisualTranslationProgress
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
import { createVisualTranslationService } from './visual-translation-service';
import { assertInside, sanitizeFilenamePart } from './analysis-contract';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;

const projects = createProjectStore(getSettings);
const pipeline = createPipelineService(
  projects,
  getProviderCredentials,
  getSettings,
  (progress: AnalysisProgress) => mainWindow?.webContents.send('analysis:progress', progress)
);
const visualTranslation = createVisualTranslationService(
  getProviderCredentials,
  getSettings,
  (progress: VisualTranslationProgress) => mainWindow?.webContents.send('visual-translation:progress', progress)
);

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
  ipcMain.handle('settings:test-profile', (_event, input: SaveApiProfileInput) => testApiProfile(input));

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
  ipcMain.handle('projects:choose-files', async (_event, kind: 'assets' | 'logo' | 'brief') => {
    const filters = kind === 'logo'
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

  ipcMain.handle('analysis:start', (_event, projectId: string, forceReasoning: boolean, apiProfileId?: string) => pipeline.start(projectId, forceReasoning, apiProfileId));
  ipcMain.handle('analysis:cancel', (_event, projectId: string) => pipeline.cancel(projectId));

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

  ipcMain.handle('visual-translation:choose-documents', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '策略文档', extensions: ['pdf', 'docx', 'md', 'markdown', 'txt'] }]
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('visual-translation:inspect-documents', (_event, paths: string[]) => visualTranslation.inspectDocuments(paths));
  ipcMain.handle('visual-translation:list-runs', () => visualTranslation.listRuns());
  ipcMain.handle('visual-translation:get-run', (_event, runId: string) => visualTranslation.getRun(runId));
  ipcMain.handle('visual-translation:start', (_event, input: StartVisualTranslationInput) => visualTranslation.start(input));
  ipcMain.handle('visual-translation:resume', (_event, runId: string, apiProfileId?: string) => visualTranslation.resume(runId, apiProfileId));
  ipcMain.handle('visual-translation:cancel', (_event, runId: string) => visualTranslation.cancel(runId));
  ipcMain.handle('visual-translation:read-report', async (_event, runId: string) => fs.readFile(await visualTranslation.reportPath(runId), 'utf8'));
  ipcMain.handle('visual-translation:export-report', async (_event, runId: string) => {
    const source = await visualTranslation.reportPath(runId);
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: path.basename(source),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (result.canceled || !result.filePath) return null;
    await fs.copyFile(source, result.filePath);
    return result.filePath;
  });
  ipcMain.handle('visual-translation:open-folder', async (_event, runId: string) => {
    const root = await visualTranslation.runRoot(runId);
    const result = await shell.openPath(path.join(root, 'outputs'));
    if (result) throw new Error(result);
  });
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
