export interface AppSourceFile {
  readonly path: string
  readonly content: string
}

export interface AppSceneReference {
  readonly projectId?: string
  readonly sceneId?: string
  readonly revision?: number | string
  readonly frameId?: string
  readonly snapshotAt?: string
}

export type AppReleaseStatus = 'draft' | 'published' | 'archived'

export interface AppReleaseMetadata {
  readonly status: AppReleaseStatus
  readonly channel?: string
  readonly notes?: string
  readonly publishedAt?: string
  readonly url?: string
}

export type AppPreviewStatus = 'idle' | 'building' | 'ready' | 'error'

export interface AppPreviewConfig {
  readonly status: AppPreviewStatus
  readonly entryPoint: string
  readonly error?: string
}

export interface AppProject {
  readonly format: 'paper-app'
  readonly version: 1
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly revision: number
  readonly sceneReference: AppSceneReference | null
  readonly files: Record<string, AppSourceFile>
  readonly assetIds: readonly string[]
  readonly release: AppReleaseMetadata
  readonly preview: AppPreviewConfig
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AppProjectInput {
  readonly id?: string
  readonly name?: string
  readonly description?: string
  readonly revision?: number
  readonly sceneReference?: AppSceneReference | null
  readonly files?: Record<string, AppSourceFile | string> | readonly AppSourceFile[]
  readonly assetIds?: readonly string[]
  readonly release?: Partial<AppReleaseMetadata>
  readonly preview?: Partial<AppPreviewConfig>
  readonly createdAt?: string
  readonly updatedAt?: string
}

export interface AppProjectLimits {
  readonly MAX_FILE_BYTES: number
  readonly MAX_TOTAL_FILES_BYTES: number
  readonly MAX_FILES_COUNT: number
  readonly MAX_ASSET_IDS_COUNT: number
  readonly MAX_NAME_LENGTH: number
  readonly MAX_PATH_LENGTH: number
  readonly MAX_MANIFEST_BYTES: number
}

export interface AppProjectSummary {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly revision: number
  readonly release: AppReleaseMetadata
  readonly preview: AppPreviewConfig
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AppRevisionRecord {
  readonly revision: number
  readonly hash: string
  readonly timestamp: string
  readonly project: AppProject
}

export type ModelTurnStatus = 'pending' | 'success' | 'cancelled' | 'error' | 'rate_limited' | 'budget_exceeded'

export interface ModelTurnUsage {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly totalTokens: number
  readonly durationMs: number
}

export interface ModelBudget {
  readonly usedTurns: number
  readonly remainingTurns: number
  readonly limitTurns: number
  readonly usedTokens: number
  readonly remainingTokens: number
  readonly limitTokens: number
  readonly resetAt?: string
}

export interface ModelTurnRecord {
  readonly turnId: string
  readonly userId: string
  readonly appId?: string
  readonly provider: string
  readonly model: string
  readonly status: ModelTurnStatus
  readonly usage: ModelTurnUsage
  readonly promptBytes: number
  readonly outputBytes: number
  readonly createdAt: string
  readonly errorMessage?: string
  readonly generation?: AppGenerationRecord
}

export interface AppGenerationRecord {
  readonly plan: AppPlan
  readonly sourceRevision: number
  readonly resultRevision?: number
  readonly validation: 'pending' | 'passed' | 'failed' | 'conflict' | 'cancelled'
  readonly diagnostics: readonly import('./compiler.ts').CompileDiagnostic[]
  readonly changedFiles: readonly string[]
  readonly diff?: import('./diff.ts').BoundedDiff
  readonly rollbackRevision?: number
}

export interface ModelRequest {
  readonly prompt: string
  readonly systemPrompt?: string
  readonly model?: string
  readonly appId?: string
  readonly expectedRevision?: number
  readonly temperature?: number
  readonly maxTokens?: number
  readonly context?: Record<string, unknown>
}

export interface ModelResponse {
  readonly turnId: string
  readonly provider: string
  readonly model: string
  readonly content: string
  readonly usage: ModelTurnUsage
  readonly budget: ModelBudget
  readonly timestamp: string
}

export interface ModelGatewayLimits {
  readonly MAX_PROMPT_BYTES: number
  readonly MAX_REQUEST_BYTES: number
  readonly MAX_OUTPUT_TOKENS: number
  readonly MAX_OUTPUT_BYTES: number
  readonly DEFAULT_TIMEOUT_MS: number
  readonly DEFAULT_RATE_LIMIT_PER_MINUTE: number
  readonly DEFAULT_ACCOUNT_TURN_BUDGET: number
  readonly DEFAULT_ACCOUNT_TOKEN_BUDGET: number
}

export type AppPlanAction = 'create' | 'modify' | 'delete'

export interface AppPlanFileTarget {
  readonly path: string
  readonly description: string
  readonly action?: AppPlanAction
}

export type AppPlanStatus = 'draft' | 'approved' | 'rejected' | 'revised'

export type { BoundedDesignContext, BoundedDesignAsset, LinkedDesignToken } from './design-context.ts'
export type {
  AppAsset,
  AppAssetType,
  ApprovedImageMimeType,
  ApprovedFontMimeType,
  ApprovedAssetMimeType,
  AppAssetExportRecord,
  AppProjectPackage,
} from './assets.ts'


export interface AppPlan {
  readonly planId: string
  readonly appId?: string
  readonly baseRevision: number
  readonly prompt: string
  readonly summary: string
  readonly files: readonly AppPlanFileTarget[]
  readonly interactions: readonly string[]
  readonly risks: readonly string[]
  readonly status: AppPlanStatus
  readonly createdAt: string
  readonly approvedAt?: string
  readonly revisedPrompt?: string
  readonly sceneReference?: AppSceneReference | null
  readonly designContext?: import('./design-context.ts').BoundedDesignContext | null
}

export interface AppPlanRequest {
  readonly prompt: string
  readonly appId?: string
  readonly expectedRevision?: number
  readonly context?: Record<string, unknown>
  readonly project?: AppProject
  readonly sceneReference?: AppSceneReference | null
}

export interface AppPlanResponse {
  readonly plan: AppPlan
  readonly turnId?: string
  readonly usage?: ModelTurnUsage
  readonly budget?: ModelBudget
}

export interface AppPlanApprovalRequest {
  readonly plan: AppPlan
  readonly expectedRevision?: number
}

export interface AppPlanApprovalResult {
  readonly ok: boolean
  readonly plan: AppPlan
  readonly approvedAt: string
}

export interface AppGenerateRequest {
  readonly plan: AppPlan
  readonly appId?: string
  readonly expectedRevision?: number
  readonly project?: AppProject
}

export interface AppGenerateResult {
  readonly success: boolean
  readonly project?: AppProject
  readonly files?: Record<string, AppSourceFile>
  readonly generatedFiles?: Record<string, AppSourceFile>
  readonly assets?: import('./compiler.ts').CompilePreviewAssets | null
  readonly diagnostics: readonly import('./compiler.ts').CompileDiagnostic[]
  readonly plan: AppPlan
  readonly diff?: import('./diff.ts').BoundedDiff
  readonly rollbackRevision?: number
  readonly turnId?: string
  readonly usage?: ModelTurnUsage
  readonly budget?: ModelBudget
  readonly error?: string
}

export interface AppProjectRollbackRequest {
  readonly expectedRevision: number
  readonly targetRevision?: number
}

export interface AppProjectRollbackResult {
  readonly ok: boolean
  readonly project: AppProject
  readonly rolledBackTo: number
  readonly assets: import('./compiler.ts').CompilePreviewAssets
  readonly diagnostics: readonly import('./compiler.ts').CompileDiagnostic[]
}
