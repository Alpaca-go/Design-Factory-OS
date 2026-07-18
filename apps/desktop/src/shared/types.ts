// Provider is user-defined metadata. Desktop accepts any OpenAI-compatible
// multimodal endpoint instead of restricting profiles to a vendor allow-list.
export type ProviderKind = string;
export type OutputLanguage = 'zh-CN' | 'en';
export type AnalysisProfile = 'fusion-enhanced';
export type ProjectStatus = 'draft' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ProjectNameSource =
  | 'visual-content'
  | 'logo-or-guideline'
  | 'pdf-content'
  | 'uploaded-archive-name'
  | 'uploaded-folder-name'
  | 'common-file-prefix'
  | 'fallback-datetime';

export type AnalysisStage =
  | 'preparing-assets'
  | 'extracting-project-facts'
  | 'building-contact-sheet'
  | 'building-prompt'
  | 'reasoning'
  | 'generating-report'
  | 'validating-output'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AnalysisProgress {
  projectId: string;
  stage: AnalysisStage;
  message: string;
  startedAt: string;
  elapsedMs?: number;
  assetCount?: number;
  model?: string;
  failedAtStage?: Exclude<AnalysisStage, 'failed' | 'cancelled' | 'completed'>;
  cacheStatus?: 'checking' | 'hit' | 'miss' | 'forced';
}

export interface ApiProfile {
  id: string;
  displayName: string;
  provider: ProviderKind;
  modelId: string;
  baseUrl: string;
  credentialKey: string;
  hasApiKey: boolean;
  isDefault: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failed';
}

export interface SaveApiProfileInput {
  id?: string;
  displayName: string;
  provider: ProviderKind;
  modelId: string;
  baseUrl: string;
  apiKey?: string;
  isDefault: boolean;
  isEnabled: boolean;
}

export interface PublicSettings {
  profiles: ApiProfile[];
  defaultProfileId: string | null;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  defaultDataPath: string;
  cacheEnabled: boolean;
  logLevel: 'error' | 'info' | 'debug';
  connectionStatus: 'untested' | 'connected' | 'failed';
}

export interface SaveSettingsInput {
  defaultDataPath: string;
  cacheEnabled: boolean;
  logLevel: 'error' | 'info' | 'debug';
}

export interface ProjectAsset {
  id: string;
  batchId: string;
  sourceType: 'file' | 'folder' | 'archive-extracted';
  originalName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  status: 'ready' | 'ignored' | 'deleted' | 'failed';
  archiveSourceName?: string;
}

export interface ProjectRecord {
  id: string;
  projectName: string;
  detectedProjectName: string;
  projectNameSource: ProjectNameSource;
  projectNameConfidence: number;
  brandName: string;
  industry: string;
  detectedBrandName: string;
  detectedIndustry: string;
  factConfidence: {
    brandName: number;
    industry: number;
  };
  description: string;
  logoLocked: boolean;
  lockedFacts: string[];
  outputLanguage: OutputLanguage;
  provider: ProviderKind;
  model: string;
  apiProfileId: string | null;
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
  assets: ProjectAsset[];
}

export interface CreateProjectInput {
  sourcePaths: string[];
  apiProfileId: string;
}

export interface AssetItem {
  id: string;
  batchId: string;
  sourceType: ProjectAsset['sourceType'];
  relativePath: string;
  name: string;
  extension: string;
  bytes: number;
  kind: 'image' | 'pdf' | 'unsupported';
  sha256: string;
  archiveSourceName?: string;
  thumbnailDataUrl?: string;
  warning?: string;
}

export interface AssetSummary {
  totalFiles: number;
  totalBytes: number;
  imageCount: number;
  pdfCount: number;
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
  apiProfileId: string;
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

export interface DocumentSection {
  heading?: string;
  level?: number;
  content: string;
  page?: number;
}

export interface DocumentTable {
  rows: string[][];
  markdown: string;
}

export interface NormalizedDocument {
  id: string;
  filename: string;
  mimeType: string;
  sourceType: 'pdf' | 'docx' | 'markdown' | 'text';
  title?: string;
  rawText: string;
  sections: DocumentSection[];
  tables: DocumentTable[];
  pageCount?: number;
  characterCount: number;
  parseWarnings: string[];
  documentRole?: 'brand-strategy' | 'creative-brief' | 'visual-guideline' | 'product-information' | 'market-research' | 'reference' | 'unknown';
}

export interface VisualStrategyCorpus {
  documents: NormalizedDocument[];
  sourceIndex: Array<{
    documentId: string;
    filename: string;
    section: string;
    page?: number;
    characterCount: number;
  }>;
  mergedText: string;
  warnings: string[];
}

export type VisualTranslationStage =
  | '00-document-preparation'
  | '01-visual-evidence'
  | '02-visual-signal-opportunity'
  | '04-three-creative-directions'
  | '05-direction-recommendation'
  | '10-local-report-compiler';

export type VisualTranslationRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface VisualTranslationDocumentSummary {
  path: string;
  filename: string;
  sourceType: NormalizedDocument['sourceType'];
  title?: string;
  characterCount: number;
  pageCount?: number;
  warnings: string[];
}

export interface VisualTranslationProgress {
  runId: string;
  projectName: string;
  stage: VisualTranslationStage;
  message: string;
  startedAt: string;
  elapsedMs: number;
  model: string;
}

export interface VisualTranslationRunRecord {
  id: string;
  analysisRunId: string;
  projectName: string;
  status: VisualTranslationRunStatus;
  apiProfileId: string;
  provider: string;
  model: string;
  documentCount: number;
  documentNames: string[];
  createdAt: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  currentStage?: VisualTranslationStage;
  lastError?: string | null;
  reportFilename?: string | null;
  modelCallCount?: number;
  resumedStageCount?: number;
  visualRatio?: number;
}

export interface StartVisualTranslationInput {
  projectName: string;
  documentPaths: string[];
  apiProfileId: string;
}

export interface VisualTranslationResult {
  run: VisualTranslationRunRecord;
  reportMarkdown: string;
}

export interface DesktopApi {
  settings: {
    get(): Promise<PublicSettings>;
    save(input: SaveSettingsInput): Promise<PublicSettings>;
    saveProfile(input: SaveApiProfileInput): Promise<PublicSettings>;
    deleteProfile(profileId: string): Promise<PublicSettings>;
    setDefaultProfile(profileId: string): Promise<PublicSettings>;
    setProfileEnabled(profileId: string, enabled: boolean): Promise<PublicSettings>;
    testProfile(input: SaveApiProfileInput): Promise<ConnectionTestResult>;
  };
  projects: {
    list(): Promise<ProjectRecord[]>;
    create(input: CreateProjectInput): Promise<ProjectRecord>;
    get(projectId: string): Promise<ProjectRecord>;
    remove(projectId: string): Promise<void>;
    chooseFiles(kind: 'assets' | 'logo' | 'brief'): Promise<string[]>;
    chooseFolder(): Promise<string[]>;
    importFiles(projectId: string, paths: string[], kind: 'assets' | 'logo' | 'brief'): Promise<ImportResult>;
    scanAssets(projectId: string): Promise<AssetSummary>;
    removeAsset(projectId: string, assetId: string): Promise<AssetSummary>;
    removeBatch(projectId: string, batchId: string): Promise<AssetSummary>;
    clearAssets(projectId: string): Promise<AssetSummary>;
  };
  analysis: {
    start(projectId: string, forceReasoning: boolean, apiProfileId?: string): Promise<AnalysisResult>;
    cancel(projectId: string): Promise<boolean>;
    onProgress(callback: (progress: AnalysisProgress) => void): () => void;
  };
  report: {
    read(projectId: string): Promise<string>;
    rename(projectId: string, filename: string): Promise<ProjectRecord>;
    export(projectId: string): Promise<string | null>;
    openFolder(projectId: string): Promise<void>;
  };
  visualTranslation: {
    chooseDocuments(): Promise<string[]>;
    inspectDocuments(paths: string[]): Promise<VisualTranslationDocumentSummary[]>;
    listRuns(): Promise<VisualTranslationRunRecord[]>;
    getRun(runId: string): Promise<VisualTranslationRunRecord>;
    start(input: StartVisualTranslationInput): Promise<VisualTranslationResult>;
    resume(runId: string, apiProfileId?: string): Promise<VisualTranslationResult>;
    cancel(runId: string): Promise<boolean>;
    readReport(runId: string): Promise<string>;
    exportReport(runId: string): Promise<string | null>;
    openFolder(runId: string): Promise<void>;
    onProgress(callback: (progress: VisualTranslationProgress) => void): () => void;
  };
  files: {
    getPathForFile(file: File): string;
  };
}
