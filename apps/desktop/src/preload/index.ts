import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AnalysisProgress, DesktopApi, VisualTranslationProgress } from '../shared/types';

const api: DesktopApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (input) => ipcRenderer.invoke('settings:save', input),
    saveProfile: (input) => ipcRenderer.invoke('settings:save-profile', input),
    deleteProfile: (profileId) => ipcRenderer.invoke('settings:delete-profile', profileId),
    setDefaultProfile: (profileId) => ipcRenderer.invoke('settings:set-default-profile', profileId),
    setProfileEnabled: (profileId, enabled) => ipcRenderer.invoke('settings:set-profile-enabled', profileId, enabled),
    testProfile: (input) => ipcRenderer.invoke('settings:test-profile', input)
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (input) => ipcRenderer.invoke('projects:create', input),
    get: (projectId) => ipcRenderer.invoke('projects:get', projectId),
    remove: (projectId) => ipcRenderer.invoke('projects:remove', projectId),
    chooseFiles: (kind) => ipcRenderer.invoke('projects:choose-files', kind),
    chooseFolder: () => ipcRenderer.invoke('projects:choose-folder'),
    importFiles: (projectId, paths, kind) => ipcRenderer.invoke('projects:import-files', projectId, paths, kind),
    scanAssets: (projectId) => ipcRenderer.invoke('projects:scan-assets', projectId),
    removeAsset: (projectId, assetId) => ipcRenderer.invoke('projects:remove-asset', projectId, assetId),
    removeBatch: (projectId, batchId) => ipcRenderer.invoke('projects:remove-batch', projectId, batchId),
    clearAssets: (projectId) => ipcRenderer.invoke('projects:clear-assets', projectId)
  },
  analysis: {
    start: (projectId, forceReasoning, apiProfileId) => ipcRenderer.invoke('analysis:start', projectId, forceReasoning, apiProfileId),
    cancel: (projectId) => ipcRenderer.invoke('analysis:cancel', projectId),
    onProgress(callback) {
      const listener = (_event: Electron.IpcRendererEvent, progress: AnalysisProgress) => callback(progress);
      ipcRenderer.on('analysis:progress', listener);
      return () => ipcRenderer.removeListener('analysis:progress', listener);
    }
  },
  report: {
    read: (projectId) => ipcRenderer.invoke('report:read', projectId),
    rename: (projectId, filename) => ipcRenderer.invoke('report:rename', projectId, filename),
    export: (projectId) => ipcRenderer.invoke('report:export', projectId),
    openFolder: (projectId) => ipcRenderer.invoke('report:open-folder', projectId)
  },
  visualTranslation: {
    chooseDocuments: () => ipcRenderer.invoke('visual-translation:choose-documents'),
    inspectDocuments: (paths) => ipcRenderer.invoke('visual-translation:inspect-documents', paths),
    listRuns: () => ipcRenderer.invoke('visual-translation:list-runs'),
    getRun: (runId) => ipcRenderer.invoke('visual-translation:get-run', runId),
    start: (input) => ipcRenderer.invoke('visual-translation:start', input),
    resume: (runId, apiProfileId) => ipcRenderer.invoke('visual-translation:resume', runId, apiProfileId),
    cancel: (runId) => ipcRenderer.invoke('visual-translation:cancel', runId),
    remove: (runId) => ipcRenderer.invoke('visual-translation:remove', runId),
    readReport: (runId) => ipcRenderer.invoke('visual-translation:read-report', runId),
    exportReport: (runId) => ipcRenderer.invoke('visual-translation:export-report', runId),
    openFolder: (runId) => ipcRenderer.invoke('visual-translation:open-folder', runId),
    onProgress(callback) {
      const listener = (_event: Electron.IpcRendererEvent, progress: VisualTranslationProgress) => callback(progress);
      ipcRenderer.on('visual-translation:progress', listener);
      return () => ipcRenderer.removeListener('visual-translation:progress', listener);
    }
  },
  files: {
    getPathForFile: (file) => webUtils.getPathForFile(file)
  }
};

contextBridge.exposeInMainWorld('masterpiece', api);
