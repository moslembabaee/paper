export const taskStatuses = ['in_progress', 'approved', 'pending', 'waiting_approval', 'failed', 'completed'] as const
export type TaskStatus = typeof taskStatuses[number]
export type RoadmapFilter = 'all' | TaskStatus

export interface RoadmapTask {
  id: string
  title: string
  phase: string
  assigned_agent: string
  status: TaskStatus
  completed_at?: string
}

export interface RoadmapFeed {
  project: string
  updated_at: string
  mode: 'live' | 'snapshot'
  tasks: RoadmapTask[]
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// The orchestrator writes naive UTC timestamps; browsers must not interpret them as local time.
export function utcTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/.test(normalized)) return undefined
  const date = new Date(/(Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}Z`)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

/** Publish only community-facing fields, never prompts, paths, or verification commands. */
export function parseRoadmap(value: unknown, options: { mode?: RoadmapFeed['mode']; updatedAt?: string } = {}): RoadmapFeed {
  if (!record(value) || !Array.isArray(value.tasks)) throw new Error('Invalid roadmap feed.')
  const ids = new Set<string>()
  const tasks = value.tasks.map((task: unknown): RoadmapTask => {
    const status = record(task) && task.status === 'pending_approval' ? 'waiting_approval' : (record(task) ? task.status : undefined)
    if (!record(task) || typeof task.id !== 'string' || !task.id.trim() || ids.has(task.id)
      || typeof task.title !== 'string' || !task.title.trim()
      || !taskStatuses.includes(status as TaskStatus)) throw new Error('Invalid roadmap task.')
    ids.add(task.id)
    const completedAt = utcTimestamp(task.completed_at)
    if (task.completed_at !== undefined && !completedAt) throw new Error('Invalid completion date.')
    return {
      id: task.id, title: task.title,
      phase: typeof task.phase === 'string' ? task.phase : 'Community & Issues',
      assigned_agent: typeof task.assigned_agent === 'string' ? task.assigned_agent : 'unassigned',
      status: status as TaskStatus,
      ...(completedAt ? { completed_at: completedAt } : {}),
    }
  })
  const updatedAt = utcTimestamp(options.updatedAt ?? value.updated_at)
  if (!updatedAt) throw new Error('Invalid roadmap update date.')
  return {
    project: typeof value.project === 'string' ? value.project : 'Paper',
    updated_at: updatedAt,
    mode: options.mode ?? (value.mode === 'live' ? 'live' : 'snapshot'),
    tasks,
  }
}

export function roadmapProgress(tasks: RoadmapTask[]) {
  const completed = tasks.filter(task => task.status === 'completed').length
  return { completed, total: tasks.length, percent: tasks.length ? Math.floor(completed / tasks.length * 100) : 0 }
}

export function visibleTasks(tasks: RoadmapTask[], filter: RoadmapFilter, query: string): RoadmapTask[] {
  const search = query.trim().toLowerCase()
  return tasks.filter(task => (filter === 'all' || task.status === filter)
    && [task.id, task.title, task.phase, task.assigned_agent].some(value => value.toLowerCase().includes(search)))
    .sort((a, b) => {
      const statusOrder = taskStatuses.indexOf(a.status) - taskStatuses.indexOf(b.status)
      if (statusOrder) return statusOrder
      if (a.status === 'completed') return (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
      return 0 // Preserve queue priority from the orchestrator.
    })
}

export function formatRoadmapDate(value: string): string {
  return `${value.slice(0, 19).replace('T', ' ')} UTC`
}
