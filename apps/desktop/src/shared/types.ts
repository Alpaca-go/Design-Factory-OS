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

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type CurrentProjectAssetRole =
  | 'logo_evidence'
  | 'logo_typography_evidence'
  | 'brand_name_evidence'
  | 'product_fact_evidence'
  | 'packaging_structure_evidence'
  | 'product_structure_evidence'
  | 'touchpoint_evidence'
  | 'locked_asset_evidence'
  | 'brand_copy_evidence'
  | 'spatial_structure_evidence'
  | 'legacy_visual_style_only'
  | 'duplicate'
  | 'irrelevant'
  | 'uncertain';

export interface CurrentProjectAssetDecision {
  assetId: string;
  filename: string;
  role: CurrentProjectAssetRole;
  roles?: CurrentProjectAssetRole[];
  keepInCorePack: boolean;
  includeInAnalysisEvidencePack?: boolean;
  includeInGenerationIdentityPack?: boolean;
  generationUsage?: 'identity' | 'product' | 'structure_only' | 'locked_asset' | 'exclude';
  keepReason: string;
  extractedFacts: string[];
  lockedEvidence: string[];
  containsLegacyStyle: boolean;
  legacyStyleShouldInfluenceOutput: false;
  confidence: number;
  requiresHumanReview: boolean;
}

export interface PackagingStructureEvidence {
  assetId: string;
  description: string;
  confidence: number;
}

export interface LockedAssetEvidence {
  name: string;
  assetIds: string[];
  reason: string;
}

export interface CurrentProjectCorePack {
  projectId: string;
  brandName: string;
  industry: string;
  productFacts: string[];
  targetAudience?: string[];
  brandPositioning?: string;
  logoAssetIds: string[];
  logoTypographyAssetIds: string[];
  packagingStructures: PackagingStructureEvidence[];
  productAssets: string[];
  touchpoints: ProjectTouchpointInventory;
  confirmedBrandCopy: string[];
  lockedAssets: LockedAssetEvidence[];
  excludedLegacyStyleAssetIds: string[];
  uncertainAssetIds: string[];
  sourceAssetIds: string[];
  schemaVersion: 'current-project-core-pack-v1';
}

export interface CurrentProjectCorePackValidation {
  hasBrandName: boolean;
  hasLogoEvidence: boolean;
  hasLogoTypographyEvidence: boolean;
  hasProductFactEvidence: boolean;
  hasRequiredStructureEvidence: boolean;
  hasLockedAssetEvidence: boolean;
  excludesLegacyStyleOnlyAssets: boolean;
  excludesDuplicateAssets: boolean;
  noReferenceAssetsMixedIn: boolean;
  unresolvedUncertainAssets: string[];
  passed: boolean;
  warnings: string[];
}

export type ReferenceAssetRole =
  | 'system_overview'
  | 'packaging'
  | 'packaging_detail'
  | 'poster'
  | 'vi_application'
  | 'material_detail'
  | 'typography_detail'
  | 'graphic_detail'
  | 'spatial'
  | 'display_layout'
  | 'photography_style'
  | 'brand_strategy_text'
  | 'pure_text_slide'
  | 'duplicate'
  | 'irrelevant'
  | 'uncertain';

export type GenerationOutputType =
  | 'anchor_vi_system'
  | 'packaging_single'
  | 'packaging_series'
  | 'brand_poster'
  | 'product_poster'
  | 'vi_application'
  | 'spatial_scene'
  | 'digital_campaign';

export type StyleCarrierCategory =
  | 'color'
  | 'layout'
  | 'typography'
  | 'graphic'
  | 'material'
  | 'photography'
  | 'display'
  | 'spatial';

export interface ReferenceAssetDecision {
  assetId: string;
  filename: string;
  role: ReferenceAssetRole;
  primaryRole?: ReferenceAssetRole;
  secondaryRoles?: ReferenceAssetRole[];
  styleCarrierStrength: ConfidenceLevel;
  includeInMasterSet: boolean;
  eligibleOutputTypes: GenerationOutputType[];
  representedStyleCarriers: StyleCarrierCategory[];
  duplicationGroupId?: string;
  confidence: number;
  reason: string;
  requiresHumanReview: boolean;
}

export interface StyleCarrier {
  id: string;
  category: StyleCarrierCategory;
  description: string;
  priority: 'primary' | 'secondary' | 'optional';
  supportingAssetIds: string[];
  mustBeVisibleInOutput: boolean;
  confidence: number;
}

export interface ReferenceMasterSet {
  assetIds: string[];
  decisions: ReferenceAssetDecision[];
  styleCarriers: StyleCarrier[];
  schemaVersion: 'reference-master-set-v1';
}

export interface ReferenceMasterSetValidation {
  hasSystemOverview: boolean;
  hasCrossTouchpointCoverage: boolean;
  hasPrimaryStyleCarrierEvidence: boolean;
  hasPackagingEvidence: boolean;
  hasPosterOrLayoutEvidence: boolean;
  hasMaterialOrDetailEvidence: boolean;
  excludesPureTextSlides: boolean;
  excludesBusinessAnalysisPages: boolean;
  excludesNearDuplicates: boolean;
  missingCoverageRoles: ReferenceAssetRole[];
  passed: boolean;
  warnings: string[];
}

export interface TaskReferenceSubset {
  outputType: GenerationOutputType;
  selectedAssetIds: string[];
  primaryReferenceAssetId: string;
  supportingReferenceAssetIds: string[];
  coveredPrimaryStyleCarrierIds: string[];
  missingStyleCarrierIds: string[];
  selectionReason: string;
  confidence: number;
  matchLevel?: 'exact' | 'compatible' | 'inferred' | 'insufficient';
  requiresHumanReview?: boolean;
  coveredStyleCarrierIds?: string[];
  missingEvidence?: string[];
}

export interface TaskSubsetValidation {
  matchesOutputType: boolean;
  hasHighStrengthPrimaryReference: boolean;
  coversPrimaryStyleCarriers: boolean;
  avoidsCrossTypeNoise: boolean;
  avoidsNearDuplicates: boolean;
  assetCountValid: boolean;
  passed: boolean;
}

export interface AssetSelectionProtocolResult {
  currentProjectAssetDecisions: CurrentProjectAssetDecision[];
  currentProjectCorePack: CurrentProjectCorePack;
  currentCorePackValidation: CurrentProjectCorePackValidation;
  referenceAssetDecisions: ReferenceAssetDecision[];
  referenceMasterSet: ReferenceMasterSet;
  referenceMasterSetValidation: ReferenceMasterSetValidation;
  taskReferenceSubsets: TaskReferenceSubset[];
  taskSubsetValidations: TaskSubsetValidation[];
  requiresHumanConfirmation: boolean;
  schemaVersion: 'asset-selection-protocol-v1';
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

export interface ReferenceLedDirection {
  directionName: string;
  coreProposition: string;
  visualAnchor: string;
  compositionSystem: string[];
  graphicSystem: string[];
  colorSystem: string[];
  materialSystem: string[];
  typographySystem: string[];
  touchpointRules: {
    packaging: string[];
    poster: string[];
    vi: string[];
    spatial?: string[];
  };
  prohibitedActions: string[];
}

export interface CurrentProjectProfile {
  schemaVersion: string;
  projectId: string;
  projectName: string;
  brandName: string;
  industry: string;
  coreProducts: string[];
  targetAudience: string[];
  pricePositioning?: string;
  brandPositioning: string;
  usageScenarios: string[];
  businessTouchpoints: string[];
  lockedAssets: string[];
  packagingStructures: string[];
  confirmedFacts: string[];
  sourceArtifactIds: string[];
  currentVisualAssets?: string[];
  existingBrandCopy?: string[];
  visualSources: CurrentProjectVisualSources;
  touchpointInventory: ProjectTouchpointInventory;
}

export interface CurrentProjectVisualSources {
  productForms: string[];
  cookingActions: string[];
  sensorySignals: string[];
  consumptionActions: string[];
  brandNameSemantics: string[];
  spatialObjects: string[];
}

export interface ProjectTouchpointInventory {
  primaryPackaging: string[];
  secondaryPackaging: string[];
  serviceMaterials: string[];
  viApplications: string[];
  spatialTouchpoints: string[];
  digitalTouchpoints: string[];
}

export type ReferenceInheritanceLevel = 'principle' | 'relationship' | 'surface';

export interface ReferenceInheritanceRule {
  level: ReferenceInheritanceLevel;
  weight: number;
  rule: string;
}

export type ExecutionDetailLevel = 'gpt_visual' | 'design_guideline' | 'production_spec';

export interface VisualAnchor {
  name: string;
  sourceElements: string[];
  transformationLogic: string;
  visualForm: string;
  extensionTouchpoints: string[];
  referenceSurfaceSimilarityRisk: 'low' | 'medium' | 'high';
}

export interface FlexibleColorSystem {
  identityColorRole: string;
  backgroundOptions: string[];
  textAndStructureColors: string[];
  accentOptions: string[];
  saturationGuideline: string;
  touchpointVariations: string[];
}

export interface FlexibleCompositionSystem {
  fixedPrinciples: string[];
  allowedVariations: string[];
  seriesConsistencyRules: string[];
  prohibitedLayouts: string[];
}

export interface ReferenceStyleRule {
  rule: string;
  inheritanceLevel?: ReferenceInheritanceLevel;
  evidence: string[];
  designEffect: string;
  confidence: number;
}

export type VisualAnalysisPurpose = 'current_project_audit' | 'reference_style';

export interface ReferenceStyleProfile {
  schemaVersion: string;
  overallTemperament: ReferenceStyleRule[];
  colorSystem: ReferenceStyleRule[];
  compositionSystem: ReferenceStyleRule[];
  graphicLanguage: ReferenceStyleRule[];
  typographySystem: ReferenceStyleRule[];
  materialSystem: ReferenceStyleRule[];
  lightingSystem: ReferenceStyleRule[];
  photographySystem: ReferenceStyleRule[];
  packagingPresentation: ReferenceStyleRule[];
  posterPresentation: ReferenceStyleRule[];
  viExtensionSystem: ReferenceStyleRule[];
  excludedIdentityTerms: string[];
  sourceAssetIds: string[];
  portfolioPresentation?: ReferenceStyleRule[];
}

export interface StyleApplicationPlan {
  retainedProjectIdentity: string[];
  currentVisualElementsToRetain: string[];
  currentVisualElementsToRedesign: string[];
  referenceStyleToApply: Array<{
    referenceRule: string;
    applicationToCurrentProject: string;
    affectedTouchpoints: string[];
  }>;
  projectSpecificReinterpretation: Array<{
    sourceVisualFunction: string;
    projectSpecificSource: string;
    reconstructionRule: string;
  }>;
  touchpointStrategy: Record<string, string[]>;
  prohibitedActions: string[];
}

export interface VisualReconstructionDirection {
  directionName: string;
  coreProposition: string;
  visualAnchor: string;
  visualAnchorDefinition: VisualAnchor;
  executionDetailLevel: ExecutionDetailLevel;
  referenceInheritance: ReferenceInheritanceRule[];
  flexibleColorSystem: FlexibleColorSystem;
  flexibleCompositionSystem: FlexibleCompositionSystem;
  currentProjectIdentityToRetain: string[];
  currentVisualElementsToRedesign: string[];
  compositionSystem: string[];
  graphicSystem: string[];
  colorSystem: string[];
  typographySystem: string[];
  materialSystem: string[];
  lightingSystem: string[];
  photographySystem: string[];
  touchpointRules: {
    packaging: string[];
    poster: string[];
    vi: string[];
    space?: string[];
  };
  prohibitedActions: string[];
}

export type ReconstructionPermission =
  | 'locked'
  | 'retained_by_user'
  | 'replaceable'
  | 'adopt_from_reference'
  | 'reconstruct_from_reference'
  | 'forbidden';

export interface ReferenceFirstPermissionMatrix {
  currentProject: {
    brandName: 'locked';
    logoGraphic: 'locked';
    logoTypography: 'locked';
    industry: 'locked';
    productFacts: 'locked';
    packagingStructures: 'locked';
    confirmedBrandCopy: 'retained_by_user';
    colorSystem: 'replaceable';
    layoutSystem: 'replaceable';
    typographySystem: 'replaceable';
    graphicSystem: 'replaceable';
    materialSystem: 'replaceable';
    photographySystem: 'replaceable';
    lightingSystem: 'replaceable';
    spatialSystem: 'replaceable';
    displaySystem: 'replaceable';
  };
  referenceProject: {
    brandName: 'forbidden';
    logoGraphic: 'forbidden';
    logoTypography: 'forbidden';
    slogan: 'forbidden';
    productNames: 'forbidden';
    signatureSymbols: 'forbidden';
    colorSystem: 'adopt_from_reference';
    layoutSystem: 'adopt_from_reference';
    typographySystem: 'adopt_from_reference';
    materialSystem: 'adopt_from_reference';
    photographySystem: 'adopt_from_reference';
    displaySystem: 'adopt_from_reference';
    graphicSystem: 'reconstruct_from_reference';
  };
}

export interface CurrentProjectVisualPermissions {
  lockedAssets: string[];
  replaceableLegacyVisuals: string[];
  userRetainedAssets: string[];
}

export interface ReferenceIdentityBoundary {
  forbiddenBrandNames: string[];
  forbiddenLogos: string[];
  forbiddenCopy: string[];
  forbiddenProductNames: string[];
  forbiddenSignatureGraphics: string[];
}

export interface AdoptedVisualRule {
  description: string;
  supportingAssetIds: string[];
  priority: 'primary' | 'secondary' | 'optional';
  mustBeVisibleInOutput: boolean;
}

export interface ReferenceFirstAdoption {
  colorSystem: AdoptedVisualRule[];
  layoutSystem: AdoptedVisualRule[];
  typographySystem: AdoptedVisualRule[];
  materialSystem: AdoptedVisualRule[];
  photographySystem: AdoptedVisualRule[];
  displaySystem: AdoptedVisualRule[];
  graphicStructure: AdoptedVisualRule[];
}

export interface SystemAnchor {
  colorRelationship: string;
  layoutGrammar: string;
  typographyHierarchy: string;
  materialLanguage: string;
  displayMode: string;
  primaryStyleCarrierIds: string[];
}

export interface ProjectGraphicAnchor {
  sourceElements: string[];
  reconstructedForm: string;
  usageRole: 'primary' | 'secondary';
  extensionTouchpoints: string[];
}

export interface AnchorImageDefinition {
  outputType: GenerationOutputType;
  primaryVisualSubject: string;
  referenceAssetIds: string[];
  forbiddenOutputPatterns: string[];
}

export interface UserReadableAssetReference {
  assetId: string;
  filename: string;
  thumbnailPath?: string;
  role: string;
  styleCarrierStrength?: ConfidenceLevel;
  selectedAs: 'core_pack' | 'master_set' | 'task_primary' | 'task_supporting';
  selectionReason: string;
  confidence: number;
}

export interface TaskReferenceConfidence {
  outputType: GenerationOutputType;
  hasDirectTypeMatch: boolean;
  inferredFromOtherTypes: boolean;
  confidence: number;
  requiresHumanReview: boolean;
  warning?: string;
}

export interface EvidenceBoundFact {
  id?: string;
  value: string;
  sourceAssetIds: string[];
  evidenceAssetIds?: string[];
  evidenceRegions?: Array<{
    assetId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  classification?: 'identity_fact' | 'product_fact' | 'structure_fact' | 'touchpoint_fact'
    | 'observed_copy' | 'legacy_visual_observation';
  confidence: number;
  status: 'confirmed' | 'inferred' | 'unverified';
  entersGenerationIdentityPack?: boolean;
  influencesGenerationStyle?: boolean;
}

export interface ReferenceFirstGenerationContext {
  currentProjectCorePackId?: string;
  executionBriefId?: string;
  generationIdentityPackId: string;
  generationBriefId: string;
  taskReferenceSubsetId: string;
  approvedAnchorContextId?: string;
  outputType: GenerationOutputType;
  prompt: string;
}

export interface LegacyVisualSuppressionValidation {
  oldColorSystemSuppressed: boolean;
  oldLayoutSuppressed: boolean;
  oldTypographySuppressed: boolean;
  oldGraphicSystemSuppressed: boolean;
  oldPhotographySuppressed: boolean;
  oldMaterialSystemSuppressed: boolean;
}

export interface ReferenceFirstReportValidation {
  hasMinimumIdentityCore: boolean;
  hasReplaceableLegacyVisuals: boolean;
  hasReferenceStyleCarriers: boolean;
  hasPermissionMatrix: boolean;
  hasSystemAnchor: boolean;
  hasProjectGraphicAnchor: boolean;
  hasDefinedAnchorImageType: boolean;
  hasReadableAssetReferences: boolean;
  hasTaskReferenceSubsets: boolean;
  hasGenerationContextInstructions: boolean;
  hasLegacyStyleSuppression: boolean;
  passed: boolean;
  issues: string[];
}

export interface ReferenceFirstStrategy {
  permissionMatrix: ReferenceFirstPermissionMatrix;
  currentProjectVisualPermissions: CurrentProjectVisualPermissions;
  referenceIdentityBoundary: ReferenceIdentityBoundary;
  adoption: ReferenceFirstAdoption;
  systemAnchor: SystemAnchor;
  projectGraphicAnchor: ProjectGraphicAnchor;
  anchorImage: AnchorImageDefinition;
  currentProjectReadableAssets: UserReadableAssetReference[];
  referenceReadableAssets: UserReadableAssetReference[];
  taskReferenceConfidence: TaskReferenceConfidence[];
  evidenceBoundFacts: EvidenceBoundFact[];
  generationContexts: ReferenceFirstGenerationContext[];
  legacyVisualSuppression: LegacyVisualSuppressionValidation;
  reportValidation: ReferenceFirstReportValidation;
  betaClosure: ReferenceFirstBetaClosure;
  schemaVersion: 'reference-first-strategy-v1';
}

export interface AssetFilename {
  originalName: string;
  normalizedName: string;
  displayName: string;
}

export interface StructureOnlyAsset {
  sourceAssetId: string;
  usage: 'structure_only';
  cropRegion?: { x: number; y: number; width: number; height: number };
  maskLegacyVisual?: boolean;
  textualStructureDescription?: string;
}

export interface CurrentProjectAnalysisEvidencePack {
  id: string;
  assetIds: string[];
  purpose: 'analysis_only';
  schemaVersion: 'current-project-analysis-evidence-pack-v1';
}

export interface CurrentProjectGenerationIdentityPack {
  id: string;
  brandName: string;
  identityAssetIds: string[];
  productAssetIds: string[];
  structureOnlyAssets: StructureOnlyAsset[];
  lockedAssetIds: string[];
  retainedCopy: string[];
  assetIds: string[];
  schemaVersion: 'current-project-generation-identity-pack-v1';
}

export interface GenerationIdentityPackValidation {
  hasLogo: boolean;
  hasLogoTypography: boolean;
  hasProductEvidence: boolean;
  hasRequiredStructureEvidence: boolean;
  hasLockedAssets: boolean;
  excludesLegacyPosters: boolean;
  excludesLegacyColorBoards: boolean;
  excludesLegacyGraphicSystems: boolean;
  excludesLegacySpatialStyle: boolean;
  passed: boolean;
  errors: Array<'GENERATION_IDENTITY_PACK_CONTAMINATED' | 'GENERATION_IDENTITY_PACK_INCOMPLETE'>;
}

export interface BrandCopyRecord {
  text: string;
  status: 'observed' | 'replaceable' | 'user_retained' | 'locked';
  evidenceAssetIds: string[];
  useInGeneration: boolean;
}

export interface ReferenceGraphicStructure {
  structuralRole: string;
  layoutPosition: string;
  repetitionLogic: string;
  density: string;
  crossTouchpointUsage: string[];
}

export interface ReferenceSignatureGraphic {
  description: string;
  forbiddenToCopy: boolean;
  evidenceAssetIds: string[];
}

export interface GraphicReconstructionOutput {
  reconstructedGraphic: string;
  sourceElements: string[];
  structuralSimilarity: string;
  identitySimilarityRisk: 'low' | 'medium' | 'high';
}

export interface OutputStyleCarrierRequirement {
  outputType: GenerationOutputType;
  requiredPrimaryCarrierIds: string[];
  optionalSecondaryCarrierIds: string[];
}

export interface TouchpointVisualRule {
  outputType: GenerationOutputType;
  primarySubjectType: 'typography' | 'graphic_system' | 'material_system' | 'product' | 'space';
  productPhotographyAllowed: boolean;
  productPhotographyMayDominate: boolean;
}

export interface ReferenceFirstBetaFinalValidation {
  analysisAndGenerationPacksSeparated: boolean;
  generationIdentityPackHasNoLegacyStylePollution: boolean;
  factsHavePreciseEvidence: boolean;
  observedCopyNotAutoRetained: boolean;
  primaryStyleCarrierCountValid: boolean;
  referenceSignatureGraphicsExcluded: boolean;
  projectGraphicAnchorIsNonBadge: boolean;
  taskReferenceMatchTextConsistent: boolean;
  referenceAssetsSupportMultipleRoles: boolean;
  brandAndProductPosterRulesSeparated: boolean;
  auditAndGenerationDocsSeparated: boolean;
  generationBriefWithinLengthLimit: boolean;
  filenamesReadable: boolean;
  passed: boolean;
  errors: string[];
}

export interface ReferenceFirstBetaClosure {
  currentProjectAssetDecisions: Array<{
    assetId: string;
    filename: AssetFilename;
    roles: CurrentProjectAssetRole[];
    includeInAnalysisEvidencePack: boolean;
    includeInGenerationIdentityPack: boolean;
    generationUsage: 'identity' | 'product' | 'structure_only' | 'locked_asset' | 'exclude';
    reason: string;
    confidence: number;
  }>;
  analysisEvidencePack: CurrentProjectAnalysisEvidencePack;
  generationIdentityPack: CurrentProjectGenerationIdentityPack;
  generationIdentityPackValidation: GenerationIdentityPackValidation;
  observedCopy: BrandCopyRecord[];
  legacyVisualObservations: EvidenceBoundFact[];
  referenceGraphicStructures: ReferenceGraphicStructure[];
  referenceSignatureGraphics: ReferenceSignatureGraphic[];
  graphicReconstruction: GraphicReconstructionOutput;
  styleCarrierRanking: StyleCarrier[];
  outputStyleCarrierRequirements: OutputStyleCarrierRequirement[];
  touchpointVisualRules: TouchpointVisualRule[];
  analysisAuditMarkdown: string;
  generationBriefMarkdown: string;
  finalValidation: ReferenceFirstBetaFinalValidation;
}

export interface BetaContentValidation {
  visualAnchorUsesCurrentProjectSources: boolean;
  noGenericTraditionalSymbolStacking: boolean;
  noSurfaceStyleOverCopying: boolean;
  colorRulesAreFlexible: boolean;
  compositionAllowsVariation: boolean;
  noUnnecessaryProductionParameters: boolean;
  packagingAndTouchpointsSeparated: boolean;
  touchpointRulesAreDistinct: boolean;
  directionNameIsSpecific: boolean;
  gptExecutionReady: boolean;
}

export interface ReconstructionQualityValidation extends BetaContentValidation {
  currentProjectContextComplete: boolean;
  lockedAssetsPresent: boolean;
  referenceStyleProfilePresent: boolean;
  noReferenceBrandPollution: boolean;
  noInternalSystemTerms: boolean;
  noMarkdownFragments: boolean;
  styleApplicationIsProjectSpecific: boolean;
  visualDirectionIsExecutable: boolean;
  touchpointRulesPresent: boolean;
  gptExecutionConstraintsPresent: boolean;
  projectProfileClean?: boolean;
  outputNotDuplicated?: boolean;
  visualDirectionSpecific?: boolean;
  passed: boolean;
  issues: string[];
}

export interface ReferenceStyleReconstruction {
  currentProjectProfile: CurrentProjectProfile;
  referenceStyleProfile: ReferenceStyleProfile;
  styleApplicationPlan?: StyleApplicationPlan;
  visualReconstructionDirection: VisualReconstructionDirection;
  assetSelectionProtocol?: AssetSelectionProtocolResult;
  referenceFirstStrategy?: ReferenceFirstStrategy;
  validation: ReconstructionQualityValidation;
}

export type ReferenceTranslationStage =
  | 'PREPARING_ASSETS'
  | 'SELECTING_CURRENT_CORE_PACK'
  | 'SELECTING_REFERENCE_MASTER_SET'
  | 'BUILDING_TASK_REFERENCE_SUBSETS'
  | 'ANALYZING_REFERENCE'
  | 'LOADING_PROJECT_CONTEXT'
  | 'SYNTHESIZING_REFERENCE_DNA'
  | 'CLASSIFYING_TRANSFERABILITY'
  | 'MAPPING_TO_PROJECT'
  | 'GENERATING_DIRECTION'
  | 'COMPILING_REPORT'
  | 'VALIDATING_REPORT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ReferenceTranslationRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface ReferenceTranslationError {
  code:
    | 'REFERENCE_ASSET_PREPARATION_FAILED'
    | 'CURRENT_CORE_PACK_INCOMPLETE'
    | 'CURRENT_CORE_PACK_CONTAMINATED'
    | 'REFERENCE_MASTER_SET_INSUFFICIENT'
    | 'TASK_REFERENCE_SUBSET_MISMATCH'
    | 'TASK_REFERENCE_SUBSET_TOO_WEAK'
    | 'REFERENCE_ANALYSIS_FAILED'
    | 'CURRENT_PROJECT_CONTEXT_INCOMPLETE'
    | 'CURRENT_PROJECT_PROFILE_CONTAMINATED'
    | 'REFERENCE_STYLE_INSUFFICIENT'
    | 'REFERENCE_STYLE_PROFILE_CONTAMINATED'
    | 'REFERENCE_BRAND_CONTAMINATION'
    | 'REFERENCE_IDENTITY_LEAKAGE'
    | 'RECONSTRUCTION_OUTPUT_DUPLICATED'
    | 'VISUAL_DIRECTION_NOT_EXECUTABLE'
    | 'RECONSTRUCTION_QUALITY_FAILED'
    | 'REFERENCE_FIRST_LEGACY_STYLE_NOT_SUPPRESSED'
    | 'REFERENCE_FIRST_REPORT_VALIDATION_FAILED'
    | 'PROJECT_CONTEXT_LOAD_FAILED'
    | 'REFERENCE_DNA_FAILED'
    | 'TRANSFERABILITY_FAILED'
    | 'PROJECT_MAPPING_FAILED'
    | 'DIRECTION_GENERATION_FAILED'
    | 'MARKDOWN_COMPILE_FAILED'
    | 'MARKDOWN_VALIDATION_FAILED'
    | 'REPORT_WRITE_FAILED'
    | 'CANCELLED';
  message: string;
  stage: ReferenceTranslationStage;
  recoverable: boolean;
  retryFromStage?: ReferenceTranslationStage;
}

export interface ReferenceTranslationProgress {
  jobId: string;
  projectId: string;
  jobType: 'reference_translation';
  status: ReferenceTranslationRunStatus;
  stage: ReferenceTranslationStage;
  stageIndex: number;
  stageCount: number;
  progress: number;
  analyzedAssetCount?: number;
  totalAssetCount?: number;
  startedAt: string;
  updatedAt: string;
  message?: string;
}

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
  projectId?: string;
  stage?: ReferenceTranslationStage;
  progress?: number;
  analyzedAssetCount?: number;
  totalAssetCount?: number;
  reportFilename?: string | null;
  error?: ReferenceTranslationError | null;
  apiProfileId?: string;
  modelCallCount?: number;
  resumedStageCount?: number;
}

export interface StartReferenceTranslationInput {
  visualAnalysisPath: string;
  projectContextPath: string;
  referenceStylePreference?: string;
  preference?: string;
  force?: boolean;
}

export interface StartReferenceTranslationUserInput {
  referenceAssetPaths: string[];
  currentProjectId?: string;
  currentProjectSourcePaths?: string[];
  apiProfileId?: string;
  referenceStylePreference?: string;
  preference?: string;
  force?: boolean;
}

export interface ReferenceAssetSelectionItem {
  sourcePath: string;
  name: string;
  extension: string;
  sizeBytes: number;
  fingerprint: string;
  thumbnailDataUrl?: string;
}

export interface ReferenceAssetSelection {
  items: ReferenceAssetSelectionItem[];
  skipped: string[];
  duplicateCount: number;
}

export interface ReferenceTranslationResult {
  run: ReferenceTranslationRunRecord;
  profile?: ReferenceTranslationProfile;
  direction?: ReferenceLedDirection;
  reportMarkdown?: string;
  reconstruction?: ReferenceStyleReconstruction;
  assetSelectionProtocol?: AssetSelectionProtocolResult;
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
    inspectAssets(paths: string[]): Promise<ReferenceAssetSelection>;
    runUserInput(input: StartReferenceTranslationUserInput): Promise<ReferenceTranslationResult>;
    run(input: StartReferenceTranslationInput): Promise<ReferenceTranslationResult>;
    listRuns(): Promise<ReferenceTranslationRunRecord[]>;
    getActive(): Promise<ReferenceTranslationProgress | null>;
    getProfile(runId: string): Promise<ReferenceTranslationProfile>;
    getDirection(runId: string): Promise<ReferenceLedDirection>;
    getReconstruction(runId: string): Promise<ReferenceStyleReconstruction>;
    readReport(runId: string): Promise<string>;
    resume(runId: string, apiProfileId?: string): Promise<ReferenceTranslationResult>;
    retryReport(runId: string): Promise<ReferenceTranslationResult>;
    cancel(runId: string): Promise<boolean>;
    remove(runId: string): Promise<void>;
    openFolder(runId: string): Promise<void>;
    onProgress(callback: (progress: ReferenceTranslationProgress) => void): () => void;
  };
  files: {
    getPathForFile(file: File): string;
  };
}
