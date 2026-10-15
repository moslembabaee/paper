import type {
  AppPlan,
  AppPlanAction,
  AppPlanFileTarget,
  AppPlanStatus,
} from './types.ts'
import { checkForbiddenKeys, normalizeAndValidatePath, parseJsonStrict } from './manifest.ts'

export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanValidationError'
  }
}

export class StalePlanApprovalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StalePlanApprovalError'
  }
}

export function validateAppPlan(input: unknown): AppPlan {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PlanValidationError('App plan must be a non-null object')
  }

  // Check forbidden prototype keys and descriptors
  try {
    checkForbiddenKeys(input)
  } catch (err) {
    throw new PlanValidationError((err as Error).message)
  }

  const raw = input as Record<string, unknown>

  const allowed = new Set([
    'planId',
    'appId',
    'baseRevision',
    'prompt',
    'summary',
    'files',
    'interactions',
    'risks',
    'status',
    'createdAt',
    'approvedAt',
    'revisedPrompt',
  ])

  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new PlanValidationError(`Unknown field in plan: "${key}"`)
    }
  }

  const required = ['planId', 'baseRevision', 'prompt', 'summary', 'files', 'interactions', 'risks', 'status', 'createdAt']
  for (const req of required) {
    if (!Object.hasOwn(raw, req)) {
      throw new PlanValidationError(`Missing required plan field: "${req}"`)
    }
  }

  if (typeof raw.planId !== 'string' || !raw.planId.trim() || raw.planId.length > 100) {
    throw new PlanValidationError('planId must be a non-empty string under 100 characters')
  }

  if (raw.appId !== undefined && (typeof raw.appId !== 'string' || !raw.appId.trim() || raw.appId.length > 100)) {
    throw new PlanValidationError('appId must be a string under 100 characters')
  }

  if (typeof raw.baseRevision !== 'number' || !Number.isSafeInteger(raw.baseRevision) || raw.baseRevision < 0) {
    throw new PlanValidationError('baseRevision must be a non-negative integer')
  }

  if (typeof raw.prompt !== 'string' || !raw.prompt.trim() || raw.prompt.length > 64 * 1024) {
    throw new PlanValidationError('prompt must be a non-empty string under 64 KiB')
  }

  if (typeof raw.summary !== 'string' || !raw.summary.trim() || raw.summary.length > 1000) {
    throw new PlanValidationError('summary must be a non-empty string under 1000 characters')
  }

  if (!Array.isArray(raw.files) || raw.files.length === 0 || raw.files.length > 50) {
    throw new PlanValidationError('files must be a non-empty array with at most 50 items')
  }

  const validatedFiles: AppPlanFileTarget[] = []
  const paths = new Set<string>()
  for (let i = 0; i < raw.files.length; i++) {
    const file = raw.files[i]
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw new PlanValidationError(`File target at index ${i} must be an object`)
    }
    const fObj = file as Record<string, unknown>
    if (Object.keys(fObj).some(key => !['path', 'description', 'action'].includes(key))) {
      throw new PlanValidationError('Unknown field in planned file')
    }
    if (typeof fObj.path !== 'string') {
      throw new PlanValidationError(`File target at index ${i} missing valid path`)
    }
    let normPath: string
    try {
      normPath = normalizeAndValidatePath(fObj.path)
    } catch (err) {
      throw new PlanValidationError(`Invalid file target path: ${(err as Error).message}`)
    }
    if (paths.has(normPath)) throw new PlanValidationError('Duplicate planned file path')
    paths.add(normPath)
    if (typeof fObj.description !== 'string' || !fObj.description.trim() || fObj.description.length > 500) {
      throw new PlanValidationError(`File target at index ${i} description must be a non-empty string under 500 characters`)
    }
    let action: AppPlanAction | undefined
    if (fObj.action !== undefined) {
      if (fObj.action !== 'create' && fObj.action !== 'modify' && fObj.action !== 'delete') {
        throw new PlanValidationError(`Invalid file target action at index ${i}: "${String(fObj.action)}"`)
      }
      action = fObj.action
    }
    validatedFiles.push({ path: normPath, description: fObj.description.trim(), action })
  }

  if (!Array.isArray(raw.interactions) || raw.interactions.length === 0 || raw.interactions.length > 50) {
    throw new PlanValidationError('interactions must be a non-empty array with at most 50 items')
  }
  const validatedInteractions: string[] = []
  for (let i = 0; i < raw.interactions.length; i++) {
    const item = raw.interactions[i]
    if (typeof item !== 'string' || !item.trim() || item.length > 500) {
      throw new PlanValidationError(`Interaction at index ${i} must be a non-empty string under 500 characters`)
    }
    validatedInteractions.push(item.trim())
  }

  if (!Array.isArray(raw.risks) || raw.risks.length > 50) {
    throw new PlanValidationError('risks must be an array with at most 50 items')
  }
  const validatedRisks: string[] = []
  for (let i = 0; i < raw.risks.length; i++) {
    const item = raw.risks[i]
    if (typeof item !== 'string' || !item.trim() || item.length > 500) {
      throw new PlanValidationError(`Risk at index ${i} must be a non-empty string under 500 characters`)
    }
    validatedRisks.push(item.trim())
  }

  const validStatuses = new Set<AppPlanStatus>(['draft', 'approved', 'rejected', 'revised'])
  if (typeof raw.status !== 'string' || !validStatuses.has(raw.status as AppPlanStatus)) {
    throw new PlanValidationError(`Invalid plan status: "${String(raw.status)}"`)
  }

  if (typeof raw.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.createdAt))) {
    throw new PlanValidationError('createdAt must be a valid ISO date timestamp')
  }

  let approvedAt: string | undefined
  if (raw.approvedAt !== undefined) {
    if (typeof raw.approvedAt !== 'string' || !Number.isFinite(Date.parse(raw.approvedAt))) {
      throw new PlanValidationError('approvedAt must be a valid ISO date timestamp')
    }
    approvedAt = raw.approvedAt
  }

  let revisedPrompt: string | undefined
  if (raw.revisedPrompt !== undefined) {
    if (typeof raw.revisedPrompt !== 'string' || raw.revisedPrompt.length > 64 * 1024) {
      throw new PlanValidationError('revisedPrompt must be a string under 64 KiB')
    }
    revisedPrompt = raw.revisedPrompt
  }

  return {
    planId: raw.planId,
    appId: raw.appId ? String(raw.appId) : undefined,
    baseRevision: raw.baseRevision,
    prompt: raw.prompt.trim(),
    summary: raw.summary.trim(),
    files: validatedFiles,
    interactions: validatedInteractions,
    risks: validatedRisks,
    status: raw.status as AppPlanStatus,
    createdAt: raw.createdAt,
    approvedAt,
    revisedPrompt,
  }
}

export function createAppPlan(params: {
  planId?: string
  appId?: string
  baseRevision?: number
  prompt: string
  summary: string
  files: readonly AppPlanFileTarget[]
  interactions: readonly string[]
  risks?: readonly string[]
  status?: AppPlanStatus
  createdAt?: string
}): AppPlan {
  const planId =
    params.planId ??
    ('plan_' +
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        : Math.random().toString(36).slice(2, 14)))
  const createdAt = params.createdAt ?? new Date().toISOString()
  const baseRevision = params.baseRevision ?? 0
  const risks = params.risks ?? []
  const status = params.status ?? 'draft'

  return validateAppPlan({
    planId,
    appId: params.appId,
    baseRevision,
    prompt: params.prompt,
    summary: params.summary,
    files: params.files,
    interactions: params.interactions,
    risks,
    status,
    createdAt,
  })
}

export function isPlanStale(plan: AppPlan, currentRevision: number): boolean {
  return plan.baseRevision !== currentRevision
}

export function approvePlan(plan: AppPlan, currentRevision: number): AppPlan {
  const validated = validateAppPlan(plan)
  if (validated.status !== 'draft') throw new PlanValidationError('Only a draft plan can be approved')
  if (isPlanStale(validated, currentRevision)) {
    throw new StalePlanApprovalError(
      `Stale plan approval: plan was created for revision ${validated.baseRevision} but current revision is ${currentRevision}`
    )
  }
  return validateAppPlan({
    ...validated,
    status: 'approved',
    approvedAt: new Date().toISOString(),
  })
}

export function revisePlan(plan: AppPlan, newPrompt: string): AppPlan {
  const validated = validateAppPlan(plan)
  return validateAppPlan({
    ...validated,
    status: 'revised',
    revisedPrompt: newPrompt,
  })
}

export function parseModelPlanResponse(
  content: string,
  options: { prompt: string; appId?: string; baseRevision: number }
): AppPlan {
  if (!content || typeof content !== 'string') {
    throw new PlanValidationError('Model response is empty or not a string')
  }

  if (new TextEncoder().encode(content).byteLength > 64 * 1024) {
    throw new PlanValidationError('Model plan exceeds 64 KiB')
  }
  const text = content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1')
  let raw: Record<string, unknown>
  try {
    raw = parseJsonStrict(text) as Record<string, unknown>
  } catch {
    throw new PlanValidationError('Model output must contain a valid JSON plan')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlanValidationError('Model plan must be an object')
  }
  if (Object.keys(raw).some(key => !['summary', 'files', 'interactions', 'risks'].includes(key))) {
    throw new PlanValidationError('Unknown field in model plan')
  }
  return validateAppPlan({
    ...raw,
    planId: 'plan_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    appId: options.appId,
    baseRevision: options.baseRevision,
    prompt: options.prompt,
    status: 'draft',
    createdAt: new Date().toISOString(),
  })
}

export function formatPlanPrompt(
  prompt: string,
  projectContext?: { name?: string; revision?: number; files?: Record<string, { path: string }> }
): {
  systemPrompt: string
  userPrompt: string
} {
  const fileList = projectContext?.files ? Object.keys(projectContext.files).join(', ') : 'src/App.tsx, src/styles.css'
  const systemPrompt = `You are the Paper Make App Planner.
Your role is PLANNING ONLY. DO NOT write code or artifact files.
Turn the user request into a concise, inspectable app plan outlining:
1. "summary": One-sentence summary of the proposed app changes.
2. "files": List of files to touch [{ "path": "src/App.tsx", "description": "...", "action": "modify"|"create"|"delete" }].
3. "interactions": List of interactive user flows (e.g. click events, state changes, form controls).
4. "risks": List of technical risks, edge cases, performance considerations, or sandbox constraints.

Existing project files: ${fileList}.
Current project revision: ${projectContext?.revision ?? 1}.

Allowed libraries: react, react-dom, lucide-react, @paper-design/shaders-react. No arbitrary npm packages.
No arbitrary network calls or eval.

Respond ONLY with a valid JSON object in this exact format:
{
  "summary": "Concise summary",
  "files": [
    { "path": "src/App.tsx", "description": "...", "action": "modify" }
  ],
  "interactions": [
    "User click action..."
  ],
  "risks": [
    "Constraint or edge case..."
  ]
}`

  return {
    systemPrompt,
    userPrompt: prompt,
  }
}
