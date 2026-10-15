export interface AppSourceFile {
  readonly path: string
  readonly content: string
}

export interface AppSceneReference {
  readonly projectId?: string
  readonly sceneId?: string
  readonly revision?: number
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
