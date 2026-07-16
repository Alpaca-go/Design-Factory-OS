import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AnalysisProgress, DesktopApi } from '../shared/types';

const api: DesktopApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (input) => ipcRenderer.invoke('settings:save', input),
    deleteCredentials: () => ipcRenderer.invoke('settings:delete-credentials'),
    test: (input) => ipcRenderer.invoke('settings:test', input)
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (input) => ipcRenderer.invoke('projects:create', input),
    get: (projectId) => ipcRenderer.invoke('projects:get', projectId),
    remove: (projectId) => ipcRenderer.invoke('projects:remove', projectId),
    chooseFiles: (kind) => ipcRenderer.invoke('projects:choose-files', kind),
    importFiles: (projectId, paths, kind) => ipcRenderer.invoke('projects:import-files', projectId, paths, kind),
    scanAssets: (projectId) => ipcRenderer.invoke('projects:scan-assets', projectId)
  },
  analysis: {
    start: (projectId, forceReasoning) => ipcRenderer.invoke('analysis:start', projectId, forceReasoning),
    cancel: (projectId) => ipcRenderer.invoke('analysis:cancel', projectId),
    onProgress(callback) {
      const listener = (_event: Electron.IpcRendererEvent, progress: AnalysisProgress) => callback(progress);
      ipcRenderer.on('analysis:progress', listener);
      return () => ipcRenderer.removeListener('analysis:progress', listener);
    }
  },
  report: {
    read: (projectId) => ipcRenderer.invoke('report:read', projectId),
    export: (projectId) => ipcRenderer.invoke('report:export', projectId),
    openFolder: (projectId) => ipcRenderer.invoke('report:open-folder', projectId)
  },
  files: {
    getPathForFile: (file) => webUtils.getPathForFile(file)
  }
};

contextBridge.exposeInMainWorld('masterpiece', api);
