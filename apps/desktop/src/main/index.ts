import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { AnalysisProgress, CreateProjectInput, SaveSettingsInput } from '../shared/types';
import { createProjectStore } from './project-store';
import {
  deleteCredentials,
  getProviderCredentials,
  getSettings,
  saveSettings,
  testConnection
} from './settings-store';
import { createPipelineService } from './pipeline-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;

const projects = createProjectStore(getSettings);
const pipeline = createPipelineService(
  projects,
  getProviderCredentials,
  getSettings,
  (progress: AnalysisProgress) => mainWindow?.webContents.send('analysis:progress', progress)
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
      preload: path.join(__dirname, '../preload/index.js'),
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
  ipcMain.handle('settings:delete-credentials', () => deleteCredentials());
  ipcMain.handle('settings:test', (_event, input?: Partial<SaveSettingsInput> & { apiKey?: string }) => testConnection(input));

  ipcMain.handle('projects:list', () => projects.list());
  ipcMain.handle('projects:create', (_event, input: CreateProjectInput) => projects.create(input));
  ipcMain.handle('projects:get', (_event, projectId: string) => projects.get(projectId));
  ipcMain.handle('projects:remove', (_event, projectId: string) => projects.remove(projectId));
  ipcMain.handle('projects:scan-assets', (_event, projectId: string) => projects.scan(projectId));
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
  ipcMain.handle('projects:import-files', (
    _event,
    projectId: string,
    paths: string[],
    kind: 'assets' | 'logo' | 'brief'
  ) => projects.importFiles(projectId, paths, kind));

  ipcMain.handle('analysis:start', (_event, projectId: string, forceReasoning: boolean) => pipeline.start(projectId, forceReasoning));
  ipcMain.handle('analysis:cancel', (_event, projectId: string) => pipeline.cancel(projectId));

  ipcMain.handle('report:read', async (_event, projectId: string) => {
    const project = await projects.get(projectId);
    if (!project.lastReportFilename) throw new Error('项目尚未生成报告');
    const paths = await projects.paths(projectId);
    return fs.readFile(path.join(paths.outputs, project.lastReportFilename), 'utf8');
  });
  ipcMain.handle('report:export', async (_event, projectId: string) => {
    const project = await projects.get(projectId);
    if (!project.lastReportFilename) throw new Error('项目尚未生成报告');
    const paths = await projects.paths(projectId);
    const source = path.join(paths.outputs, project.lastReportFilename);
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
