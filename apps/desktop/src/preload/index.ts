import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AnalysisProgress, DesktopApi } from '../shared/types';

const api: DesktopApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (input) => ipcRenderer.invoke('settings:save', input),
    saveProfile: (input) => ipcRenderer.invoke('settings:save-profile', input),
    deleteProfile: (profileId) => ipcRenderer.invoke('settings:delete-profile', profileId),
    setDefaultProfile: (profileId) => ipcRenderer.invoke('settings:set-default-profile', profileId),
    setProfileEnabled: (profileId, enabled) => ipcRenderer.invoke('settings:set-profile-enabled', profileId, enabled),
    testProfile: (input, capability) => ipcRenderer.invoke('settings:test-profile', input, capability)
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
    clearAssets: (projectId) => ipcRenderer.invoke('projects:clear-assets', projectId),
    importDocuments: (projectId, paths) => ipcRenderer.invoke('projects:import-documents', projectId, paths),
    scanDocuments: (projectId) => ipcRenderer.invoke('projects:scan-documents', projectId),
    removeDocument: (projectId, documentId) => ipcRenderer.invoke('projects:remove-document', projectId, documentId),
    clearDocuments: (projectId) => ipcRenderer.invoke('projects:clear-documents', projectId)
  },
  analysis: {
    start: (projectId, forceReasoning, apiProfileId, resumeMode) => (
      ipcRenderer.invoke('analysis:start', projectId, forceReasoning, apiProfileId, resumeMode)
    ),
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
  usage: {
    listRecords: (query) => ipcRenderer.invoke('usage:list-records', query),
    getRunSummary: (analysisRunId) => ipcRenderer.invoke('usage:get-run-summary', analysisRunId),
    getStageDetails: (analysisRunId) => ipcRenderer.invoke('usage:get-stage-details', analysisRunId),
    getMonthSummary: (month) => ipcRenderer.invoke('usage:get-month-summary', month),
    exportCsv: (query) => ipcRenderer.invoke('usage:export-csv', query),
    openDatabaseFolder: () => ipcRenderer.invoke('usage:open-database-folder'),
    clearHistory: () => ipcRenderer.invoke('usage:clear-history'),
    listPricingRules: () => ipcRenderer.invoke('usage:list-pricing-rules'),
    savePricingRule: (input) => ipcRenderer.invoke('usage:save-pricing-rule', input),
    deletePricingRule: (ruleId) => ipcRenderer.invoke('usage:delete-pricing-rule', ruleId)
  },
  files: {
    getPathForFile: (file) => webUtils.getPathForFile(file)
  }
};

contextBridge.exposeInMainWorld('masterpiece', api);
