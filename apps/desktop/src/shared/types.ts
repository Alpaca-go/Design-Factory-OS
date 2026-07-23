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
  directionGenerationMode?: DirectionGenerationMode;
  analysisPipelineMode?: AnalysisPipelineMode;
  connectionStatus: 'untested' | 'connected' | 'failed';
}

export interface SaveSettingsInput {
  defaultDataPath: string;
  cacheEnabled: boolean;
  logLevel: 'error' | 'info' | 'debug';
  directionGenerationMode?: DirectionGenerationMode;
  analysisPipelineMode?: AnalysisPipelineMode;
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

export type DirectionGenerationMode = 'execution_oriented_v2' | 'conceptual_v1';
export type AnalysisPipelineMode =
  | 'retrieval_first'
  | 'visual_fact_first_legacy'
  | 'deep_analysis_legacy'
  | 'visual_fact_first'
  | 'legacy_deep_analysis';

export type VisualTranslationStage =
  | '00-document-preparation'
  | '01-visual-evidence'
  | '01-visual-relevant-facts'
  | '01-visual-brief'
  | '01b-visual-brief-review'
  | '01b-visual-facts-review'
  | '02-visual-signal-opportunity'
  | '02-visual-asset-evidence'
  | '02b-visual-asset-evidence-review'
  | '03a-benchmark-query-compiler'
  | '03b-benchmark-retrieval'
  | '03c-visual-opportunity-synthesis'
  | '03d-visual-opportunity-review'
  | '04-three-creative-directions'
  | '04b-compile-execution-directions'
  | '05-direction-recommendation'
  | '10-local-report-compiler'
  | '10b-local-audit-compiler';

export type VisualTranslationRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timed_out' | 'cancelled';
export type VisualTranslationStep4Status = VisualTranslationRunStatus;
export type VisualTranslationAnalysisStatus = 'pending' | 'running' | 'validated' | 'result_committed' | 'completed' | 'failed_before_completion';
export type VisualTranslationPersistenceStatus = 'healthy' | 'degraded' | 'projection_sync_failed' | 'recovery_required';

export interface VisualTranslationRuntimeIssue {
  category: 'ANALYSIS_ERROR' | 'RESULT_COMMIT_ERROR' | 'PROJECTION_WRITE_ERROR' | 'EVENT_LOG_ERROR' | 'RECOVERY_ERROR';
  code: string;
  message: string;
  severity: 'warning' | 'error';
  recoverable: boolean;
  analysisCompleted: boolean;
  tempPath?: string;
}

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
  activeRunId?: string;
  projectName: string;
  status: VisualTranslationRunStatus;
  analysisStatus?: VisualTranslationAnalysisStatus;
  persistenceStatus?: VisualTranslationPersistenceStatus;
  recoverable?: boolean;
  revision?: number;
  checkpointRefs?: string[];
  artifactRefs?: string[];
  runtimeIssue?: VisualTranslationRuntimeIssue | null;
  uiMessage?: string | null;
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
  step4Status?: VisualTranslationStep4Status;
  step4ErrorCode?: string | null;
  step4UpdatedAt?: string;
  lastError?: string | null;
  userError?: VisualTranslationUserError | null;
  reportFilename?: string | null;
  modelCallCount?: number;
  resumedStageCount?: number;
  visualRatio?: number;
}

export interface StartVisualTranslationInput {
  documentPaths: string[];
  apiProfileId: string;
}

// Structured, user-facing explanation of a Visual Translation failure
// (doc: v2 Stage 04 输出截断修复, §5). Falls back to a generic message when
// the error is not a known Visual Translation error.
export interface VisualTranslationUserError {
  code: string;
  title: string;
  message: string;
  recoverable: boolean;
  stageId?: string | null;
  modelId?: string | null;
  requestedMaxOutputTokens?: number | null;
  providerMaxOutputTokens?: number | null;
  retried?: boolean;
  suggestedAction?: string;
}

export interface VisualTranslationResult {
  run: VisualTranslationRunRecord;
  reportMarkdown: string;
}

// ── Reference-Led Visual Direction（Reference Translation Profile）──
// 离线确定性引擎：从参考项目视觉分析中提取可迁移机制，
// 在不复制签名资产的前提下映射到当前项目。零模型调用。

export interface ReferenceTranslationRule {
  name: string;
  evidence: string[];
  mechanism: string;
  function: string;
  confidence: number;
}

export interface ReferenceTransferabilityItem {
  item_id: string;
  name: string;
  source_rule: string;
  reason: string;
  evidence: string[];
  confidence: number;
}

export interface ReferenceTranslationMatrixItem {
  translation_id: string;
  referenceMechanism: string;
  referenceFunction: string;
  projectCondition: string;
  translatedMechanism: string;
  retainedProperties: string[];
  changedProperties: string[];
  prohibitedElements: string[];
  confidence: number;
}

export interface ReferenceTranslationProfile {
  schema_version: string;
  source_role: string;
  referenceIdentity: {
    detectedIndustry?: string;
    touchpoints: string[];
    assetCount: number;
    completeness: 'low' | 'medium' | 'high';
    consistency: 'low' | 'medium' | 'high';
    missingEvidence: string[];
  };
  referenceVisualDNA: Record<string, ReferenceTranslationRule[]>;
  transferability: {
    directlyTransferable: ReferenceTransferabilityItem[];
    requiresReinterpretation: ReferenceTransferabilityItem[];
    prohibitedToCopy: ReferenceTransferabilityItem[];
  };
  sourceRisks: {
    signatureAssets: string[];
    recognizableCombinations: string[];
    similarityWarnings: string[];
  };
  projectTranslationMatrix: ReferenceTranslationMatrixItem[];
}

export type ReferenceTranslationRunStatus = 'completed' | 'failed';

export interface ReferenceTranslationRunRecord {
  id: string;
  status: ReferenceTranslationRunStatus;
  createdAt: string;
  completedAt?: string;
  durationMs?: number;
  cacheHit: boolean;
  visualAnalysisFilename: string;
  projectContextFilename: string;
  preference: string;
  completeness?: string;
  consistency?: string;
  matrixCount?: number;
  prohibitedCount?: number;
  lastError?: string | null;
}

export interface StartReferenceTranslationInput {
  visualAnalysisPath: string;
  projectContextPath: string;
  preference?: string;
  force?: boolean;
}

export interface StartReferenceTranslationUserInput {
  referenceAssetPaths: string[];
  currentProjectId?: string;
  currentProjectSourcePaths?: string[];
  apiProfileId?: string;
  preference?: string;
  force?: boolean;
}

export interface ReferenceTranslationResult {
  run: ReferenceTranslationRunRecord;
  profile: ReferenceTranslationProfile;
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
    remove(runId: string): Promise<void>;
    readReport(runId: string): Promise<string>;
    exportReport(runId: string): Promise<string | null>;
    openFolder(runId: string): Promise<void>;
    onProgress(callback: (progress: VisualTranslationProgress) => void): () => void;
  };
  referenceTranslation: {
    chooseInput(): Promise<string[]>;
    chooseReferenceAssets(): Promise<string[]>;
    chooseProjectSources(): Promise<string[]>;
    runUserInput(input: StartReferenceTranslationUserInput): Promise<ReferenceTranslationResult>;
    run(input: StartReferenceTranslationInput): Promise<ReferenceTranslationResult>;
    listRuns(): Promise<ReferenceTranslationRunRecord[]>;
    getProfile(runId: string): Promise<ReferenceTranslationProfile>;
    remove(runId: string): Promise<void>;
    openFolder(runId: string): Promise<void>;
  };
  files: {
    getPathForFile(file: File): string;
  };
}
