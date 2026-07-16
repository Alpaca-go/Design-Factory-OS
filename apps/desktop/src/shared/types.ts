// Provider is user-defined metadata. Desktop accepts any OpenAI-compatible
// multimodal endpoint instead of restricting profiles to a vendor allow-list.
export type ProviderKind = string;
export type OutputLanguage = 'zh-CN' | 'en';
export type AnalysisMode = 'visual-evolution' | 'brand-dna';
export type AnalysisProfile = 'fusion-enhanced' | 'brand-dna';
export type ConnectionCapability = 'vision' | 'text';
export type ReasoningQualityTier = 'benchmark' | 'qualified' | 'experimental' | 'unsupported';
export type BrandDnaResumeMode = 'continue' | 'rerun-current' | 'restart-all';
export type UsageSource = 'provider' | 'provider-partial' | 'estimated' | 'missing';
export type ModelCallStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';
export type CostEstimateStatus =
  | 'calculated'
  | 'usage-missing'
  | 'pricing-rule-missing'
  | 'unsupported'
  | 'not-applicable';
export type ProjectStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'failed-schema'
  | 'failed-timeout'
  | 'failed-time-budget'
  | 'failed-quality-gate'
  | 'unsupported-model-tier'
  | 'cancelled';
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

export type BrandDnaAnalysisStage =
  | 'preparing-documents'
  | 'parsing-documents'
  | 'normalizing-content'
  | 'extracting-project-facts'
  | 'building-brand-dna'
  | 'diagnosing-strategy'
  | 'translating-creative-direction'
  | 'planning-generation-tasks'
  | 'validating-output'
  | 'generating-report'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AnalysisProgress {
  projectId: string;
  mode: AnalysisMode;
  stage: AnalysisStage | BrandDnaAnalysisStage;
  message: string;
  startedAt: string;
  elapsedMs?: number;
  assetCount?: number;
  model?: string;
  failedAtStage?: Exclude<AnalysisStage | BrandDnaAnalysisStage, 'failed' | 'cancelled' | 'completed'>;
  stageId?: string | null;
  failedAtStageId?: string | null;
  completedStageCount?: number;
  totalStageCount?: number;
  currentStageStartedAt?: string;
  completedStageIds?: string[];
  reusableCheckpointIds?: string[];
  resumeAvailable?: boolean;
  resumed?: boolean;
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
  qualityTier: ReasoningQualityTier;
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
  usageTrackingEnabled: boolean;
  showUsageSummary: boolean;
  showCostEstimate: boolean;
  connectionStatus: 'untested' | 'connected' | 'failed';
}

export interface SaveSettingsInput {
  defaultDataPath: string;
  cacheEnabled: boolean;
  logLevel: 'error' | 'info' | 'debug';
  usageTrackingEnabled: boolean;
  showUsageSummary: boolean;
  showCostEstimate: boolean;
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

export interface ProjectDocument {
  id: string;
  originalName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  sourceType: 'pdf' | 'docx' | 'markdown' | 'text';
  status: 'ready' | 'failed';
  parseStatus: 'pending' | 'parsed' | 'warning' | 'failed';
  pageCount?: number;
  characterCount?: number;
  parseWarnings: string[];
}

export interface ProjectRecord {
  id: string;
  mode: AnalysisMode;
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
  reasoningQualityTier: ReasoningQualityTier;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastAnalysisRunId: string | null;
  assetCount: number;
  imageCount: number;
  lastReportFilename: string | null;
  lastError: string | null;
  logoFiles: string[];
  briefFiles: string[];
  assets: ProjectAsset[];
  documents: ProjectDocument[];
}

export interface CreateProjectInput {
  sourcePaths: string[];
  apiProfileId: string;
  mode?: AnalysisMode;
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
}

export interface SourceIndexItem {
  documentId: string;
  filename: string;
  section: string;
  page?: number;
  characterCount: number;
}

export interface BrandStrategyCorpus {
  documents: NormalizedDocument[];
  sourceIndex: SourceIndexItem[];
  mergedText: string;
  warnings: string[];
}

export interface DocumentItem {
  id: string;
  relativePath: string;
  name: string;
  extension: string;
  bytes: number;
  sourceType: ProjectDocument['sourceType'];
  parseStatus: ProjectDocument['parseStatus'];
  pageCount?: number;
  characterCount?: number;
  parseWarnings: string[];
}

export interface DocumentSummary {
  totalFiles: number;
  totalBytes: number;
  totalPages: number;
  totalCharacters: number;
  parsedCount: number;
  warningCount: number;
  failedCount: number;
  items: DocumentItem[];
}

export interface DocumentImportResult {
  imported: string[];
  skipped: string[];
  summary: DocumentSummary;
}

export interface AnalysisResult {
  project: ProjectRecord;
  analysisRunId: string;
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
  mode: AnalysisMode;
  warnings?: string[];
}

export interface NormalizedModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  textInputTokens: number | null;
  imageInputTokens: number | null;
  videoInputTokens: number | null;
  audioInputTokens: number | null;
  textOutputTokens: number | null;
  audioOutputTokens: number | null;
  usageSource: UsageSource;
  providerRawUsage?: Record<string, unknown>;
}

export interface ModelUsageRecord {
  id: string;
  analysisRunId: string;
  projectId: string | null;
  projectNameSnapshot: string | null;
  analysisMode: AnalysisMode | 'packaging' | 'ip-character' | 'ui' | 'illustration' | 'unknown';
  pipelineStage: string;
  attemptNumber: number;
  parentCallId: string | null;
  apiProfileId: string;
  apiProfileNameSnapshot: string;
  provider: string;
  protocol: string;
  region: string | null;
  modelId: string;
  localRequestId: string;
  providerRequestId: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  firstTokenDurationMs: number | null;
  status: ModelCallStatus;
  httpStatus: number | null;
  errorCode: string | null;
  errorCategory: string | null;
  finishReason: string | null;
  thinkingEnabled: boolean | null;
  thinkingBudgetTokens: number | null;
  structuredOutputMode: string | null;
  maxOutputTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  textInputTokens: number | null;
  imageInputTokens: number | null;
  videoInputTokens: number | null;
  audioInputTokens: number | null;
  textOutputTokens: number | null;
  audioOutputTokens: number | null;
  usageSource: UsageSource;
  pricingRuleId: string | null;
  pricingSnapshotJson: string | null;
  estimatedCostMicros: number | null;
  currency: string | null;
  costEstimateStatus: CostEstimateStatus;
  providerRawUsageJson: string | null;
  validationWarningsJson: string | null;
  createdAt: string;
}

export interface AnalysisRunUsageSummary {
  analysisRunId: string;
  projectId: string | null;
  projectName: string | null;
  analysisMode: string;
  modelCallCount: number;
  successfulCallCount: number;
  failedCallCount: number;
  cancelledCallCount: number;
  retryCallCount: number;
  pricedCallCount: number;
  unpricedCallCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCachedInputTokens: number;
  totalReasoningTokens: number;
  estimatedCostMicros: number;
  currency: string;
  usageCompleteness: 'complete' | 'partial' | 'missing';
  startedAt: string;
  completedAt: string | null;
}

export interface UsageRecordQuery {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  projectId?: string;
  analysisMode?: string;
  provider?: string;
  modelId?: string;
  apiProfileId?: string;
  pipelineStage?: string;
  status?: ModelCallStatus;
}

export interface UsageRecordPage {
  items: ModelUsageRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ModelUsageSummary {
  modelId: string;
  provider: string;
  callCount: number;
  unpricedCallCount: number;
  totalTokens: number;
  estimatedCostMicros: number;
  currency: string;
}

export interface MonthlyUsageSummary {
  month: string;
  callCount: number;
  failedCallCount: number;
  pricedCallCount: number;
  unpricedCallCount: number;
  totalTokens: number;
  failedCallTokens: number;
  cachedInputTokens: number;
  estimatedCostMicros: number;
  currency: string;
  models: ModelUsageSummary[];
}

export interface PricingRule {
  id: string;
  provider: string;
  modelPattern: string;
  region: string | null;
  protocol: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: 'CNY' | 'USD';
  minInputTokensExclusive: number | null;
  maxInputTokensInclusive: number | null;
  inputPricePerMillionMicros: string;
  outputPricePerMillionMicros: string;
  cachedInputMultiplierPpm: number | null;
  batchMultiplierPpm: number | null;
  sourceName: string | null;
  sourceUpdatedAt: string | null;
  notes: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavePricingRuleInput extends Omit<PricingRule, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  model: string;
  supportsImages: boolean;
  supportsText: boolean;
  elapsedMs: number;
}

export interface DesktopApi {
  settings: {
    get(): Promise<PublicSettings>;
    save(input: SaveSettingsInput): Promise<PublicSettings>;
    saveProfile(input: SaveApiProfileInput): Promise<PublicSettings>;
    deleteProfile(profileId: string): Promise<PublicSettings>;
    setDefaultProfile(profileId: string): Promise<PublicSettings>;
    setProfileEnabled(profileId: string, enabled: boolean): Promise<PublicSettings>;
    testProfile(input: SaveApiProfileInput, capability?: ConnectionCapability): Promise<ConnectionTestResult>;
  };
  projects: {
    list(): Promise<ProjectRecord[]>;
    create(input: CreateProjectInput): Promise<ProjectRecord>;
    get(projectId: string): Promise<ProjectRecord>;
    remove(projectId: string): Promise<void>;
    chooseFiles(kind: 'assets' | 'logo' | 'brief' | 'documents'): Promise<string[]>;
    chooseFolder(): Promise<string[]>;
    importFiles(projectId: string, paths: string[], kind: 'assets' | 'logo' | 'brief'): Promise<ImportResult>;
    scanAssets(projectId: string): Promise<AssetSummary>;
    removeAsset(projectId: string, assetId: string): Promise<AssetSummary>;
    removeBatch(projectId: string, batchId: string): Promise<AssetSummary>;
    clearAssets(projectId: string): Promise<AssetSummary>;
    importDocuments(projectId: string, paths: string[]): Promise<DocumentImportResult>;
    scanDocuments(projectId: string): Promise<DocumentSummary>;
    removeDocument(projectId: string, documentId: string): Promise<DocumentSummary>;
    clearDocuments(projectId: string): Promise<DocumentSummary>;
  };
  analysis: {
    start(
      projectId: string,
      forceReasoning: boolean,
      apiProfileId?: string,
      resumeMode?: BrandDnaResumeMode
    ): Promise<AnalysisResult>;
    cancel(projectId: string): Promise<boolean>;
    onProgress(callback: (progress: AnalysisProgress) => void): () => void;
  };
  report: {
    read(projectId: string): Promise<string>;
    rename(projectId: string, filename: string): Promise<ProjectRecord>;
    export(projectId: string): Promise<string | null>;
    openFolder(projectId: string): Promise<void>;
  };
  usage: {
    listRecords(query?: UsageRecordQuery): Promise<UsageRecordPage>;
    getRunSummary(analysisRunId: string): Promise<AnalysisRunUsageSummary>;
    getStageDetails(analysisRunId: string): Promise<ModelUsageRecord[]>;
    getMonthSummary(month?: string): Promise<MonthlyUsageSummary>;
    exportCsv(query?: UsageRecordQuery): Promise<string | null>;
    openDatabaseFolder(): Promise<void>;
    clearHistory(): Promise<void>;
    listPricingRules(): Promise<PricingRule[]>;
    savePricingRule(input: SavePricingRuleInput): Promise<PricingRule[]>;
    deletePricingRule(ruleId: string): Promise<PricingRule[]>;
  };
  files: {
    getPathForFile(file: File): string;
  };
}
