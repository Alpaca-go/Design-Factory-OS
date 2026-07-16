export type ProviderKind = 'qwen' | 'openai-compatible' | 'custom-openai-compatible';
export type OutputLanguage = 'zh-CN' | 'en';
export type AnalysisProfile = 'fusion-enhanced';
export type ProjectStatus = 'draft' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled';

export type AnalysisStage =
  | 'preparing-assets'
  | 'locking-facts'
  | 'building-prompt'
  | 'reasoning'
  | 'generating-report'
  | 'validating-output'
  | 'completed';

export interface AnalysisProgress {
  projectId: string;
  stage: AnalysisStage;
  progress?: number;
  message: string;
  elapsedMs?: number;
  assetCount?: number;
  model?: string;
  cacheStatus?: 'checking' | 'hit' | 'miss' | 'forced';
}

export interface PublicSettings {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  defaultDataPath: string;
  cacheEnabled: boolean;
  logLevel: 'error' | 'info' | 'debug';
  connectionStatus: 'untested' | 'connected' | 'failed';
}

export interface SaveSettingsInput extends Omit<PublicSettings, 'hasApiKey' | 'connectionStatus'> {
  apiKey?: string;
}

export interface ProjectRecord {
  id: string;
  projectName: string;
  brandName: string;
  industry: string;
  description: string;
  logoLocked: boolean;
  lockedFacts: string[];
  outputLanguage: OutputLanguage;
  provider: ProviderKind;
  model: string;
  analysisProfile: AnalysisProfile;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  assetCount: number;
  imageCount: number;
  lastReportFilename: string | null;
  lastError: string | null;
  logoFiles: string[];
  briefFiles: string[];
}

export interface CreateProjectInput {
  projectName: string;
  brandName: string;
  industry: string;
  description: string;
  logoLocked: boolean;
  lockedFacts: string[];
  outputLanguage: OutputLanguage;
}

export interface AssetItem {
  relativePath: string;
  name: string;
  extension: string;
  bytes: number;
  kind: 'image' | 'pdf' | 'zip' | 'document' | 'unsupported';
  thumbnailDataUrl?: string;
  warning?: string;
}

export interface AssetSummary {
  totalFiles: number;
  totalBytes: number;
  imageCount: number;
  pdfCount: number;
  zipCount: number;
  logoDetected: boolean;
  unreadableFiles: string[];
  items: AssetItem[];
}

export interface ImportResult {
  imported: string[];
  extracted: string[];
  skipped: string[];
  summary: AssetSummary;
}

export interface AnalysisResult {
  project: ProjectRecord;
  reportFilename: string;
  reportPath: string;
  runtimeReportPath: string;
  provider: string;
  model: string;
  durationMs: number;
  assetCount: number;
  imageCount: number;
  reasoningCacheHit: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  model: string;
  supportsImages: boolean;
  elapsedMs: number;
}

export interface DesktopApi {
  settings: {
    get(): Promise<PublicSettings>;
    save(input: SaveSettingsInput): Promise<PublicSettings>;
    deleteCredentials(): Promise<PublicSettings>;
    test(input?: Partial<SaveSettingsInput> & { apiKey?: string }): Promise<ConnectionTestResult>;
  };
  projects: {
    list(): Promise<ProjectRecord[]>;
    create(input: CreateProjectInput): Promise<ProjectRecord>;
    get(projectId: string): Promise<ProjectRecord>;
    remove(projectId: string): Promise<void>;
    chooseFiles(kind: 'assets' | 'logo' | 'brief'): Promise<string[]>;
    importFiles(projectId: string, paths: string[], kind: 'assets' | 'logo' | 'brief'): Promise<ImportResult>;
    scanAssets(projectId: string): Promise<AssetSummary>;
  };
  analysis: {
    start(projectId: string, forceReasoning: boolean): Promise<AnalysisResult>;
    cancel(projectId: string): Promise<boolean>;
    onProgress(callback: (progress: AnalysisProgress) => void): () => void;
  };
  report: {
    read(projectId: string): Promise<string>;
    export(projectId: string): Promise<string | null>;
    openFolder(projectId: string): Promise<void>;
  };
  files: {
    getPathForFile(file: File): string;
  };
}
