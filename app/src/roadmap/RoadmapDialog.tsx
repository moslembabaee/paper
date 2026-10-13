import { useId, useState } from 'react'
import { ArrowUpRight, Check, Circle, Clock3, ListChecks, RefreshCw, Search, X } from 'lucide-react'
import { Dialog } from '../workspace/Dialog'
import { formatRoadmapDate, roadmapProgress, taskStatuses, visibleTasks } from './model'
import type { RoadmapFilter, RoadmapTask, TaskStatus } from './model'
import { useRoadmap } from './useRoadmap'
import './roadmap.css'

const statusLabels: Record<TaskStatus, string> = {
  in_progress: 'In progress', pending: 'Upcoming', failed: 'Needs attention', completed: 'Completed',
}
const filters: { id: RoadmapFilter; label: string }[] = [
  { id: 'all', label: 'All tasks' },
  ...taskStatuses.map(id => ({ id, label: statusLabels[id] })),
]

function TaskRow({ task, priority }: { task: RoadmapTask; priority: number }) {
  return <article className="roadmap-task" data-status={task.status}>
    <span className="roadmap-task-symbol" aria-hidden="true">{task.status === 'completed' ? <Check size={15} /> : task.status === 'in_progress' ? <Circle size={12} /> : <Clock3 size={15} />}</span>
    <div className="roadmap-task-content">
      <div className="roadmap-task-meta"><span className="roadmap-task-status">{statusLabels[task.status]}{task.status === 'pending' ? ` · #${priority}` : ''}</span><span>{task.assigned_agent.toUpperCase()}</span></div>
      <h4>{task.title}</h4>
      <p>{task.phase}</p>
      <div className="roadmap-task-details"><code>{task.id}</code>{task.completed_at && <time dateTime={task.completed_at}>{formatRoadmapDate(task.completed_at)}</time>}</div>
    </div>
  </article>
}

export function RoadmapDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const { feed, loading, error, verified, refresh } = useRoadmap()
  const [filter, setFilter] = useState<RoadmapFilter>('all')
  const [query, setQuery] = useState('')
  const progress = roadmapProgress(feed.tasks)
  const tasks = visibleTasks(feed.tasks, filter, query)
  const active = feed.tasks.filter(task => task.status === 'in_progress').length
  const upcoming = feed.tasks.filter(task => task.status === 'pending').length
  const attention = feed.tasks.filter(task => task.status === 'failed').length
  const live = verified && !error && feed.mode === 'live'

  return <Dialog className="roadmap-dialog workspace-surface" labelledBy={titleId} onClose={onClose}>
    <div className="workspace-dialog-heading roadmap-heading">
      <div><span className="workspace-eyebrow">PAPER / COMMUNITY / ISSUE #1</span><h2 id={titleId}>The work, in the open.</h2><p>Our development roadmap. From the first grid to what comes next.</p></div>
      <button className="quiet-button" aria-label="Close roadmap" onClick={onClose}><X size={18} /></button>
    </div>
    <div className="roadmap-body">
      <div className="roadmap-progress-heading"><span><ListChecks size={14} />Development progress</span><strong>{progress.completed}<span> / {progress.total} completed</span></strong></div>
      <div className="roadmap-progress-track" role="progressbar" aria-label="Tasks completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${progress.completed} of ${progress.total} tasks completed`}><span style={{ width: `${progress.percent}%` }} /></div>
      <div className="roadmap-summary"><span><i />{active ? `${active} ${active === 1 ? 'task' : 'tasks'} in progress` : 'No task currently executing'}</span><span>{upcoming ? `${upcoming} upcoming` : 'Queue complete'}{attention > 0 && ` · ${attention} need attention`}</span><strong>{progress.percent}%</strong></div>
      <div className="roadmap-feed-status" role="status"><span>{error ? 'Snapshot · refresh unavailable' : loading ? 'Checking for updates…' : live ? 'Live · checks every 30 seconds' : 'Published snapshot'}</span><button className="workspace-secondary" onClick={() => void refresh()} disabled={loading} aria-label="Refresh roadmap"><RefreshCw size={12} />{loading ? 'Checking…' : 'Refresh'}</button></div>
      {error && <p className="roadmap-notice" role="alert">{error}</p>}
      <label className="roadmap-search"><Search size={14} /><input type="search" aria-label="Search roadmap" placeholder="Search features, phases or agents…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="quiet-button" aria-label="Clear roadmap search" onClick={() => setQuery('')}><X size={13} /></button>}</label>
      <div className="roadmap-filters" role="group" aria-label="Filter roadmap by status">{filters.map(({ id, label }) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span>{id === 'all' ? feed.tasks.length : feed.tasks.filter(task => task.status === id).length}</span></button>)}</div>
      <div className="roadmap-results-heading"><h3>{filter === 'all' ? 'Every step forward' : statusLabels[filter]}</h3><span aria-live="polite">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span></div>
      <div className="roadmap-task-list">{tasks.length ? tasks.map(task => <TaskRow key={task.id} task={task} priority={feed.tasks.filter(item => item.status === 'pending').findIndex(item => item.id === task.id) + 1} />) : <div className="roadmap-empty"><ListChecks size={24} /><h4>{query ? 'No matching tasks' : filter === 'in_progress' ? 'A quiet moment.' : filter === 'pending' ? 'This queue is complete.' : 'Nothing here yet.'}</h4><p>{query ? 'Try another feature, task ID, phase or agent.' : filter === 'in_progress' ? 'No task currently executing. The roadmap will update when work begins.' : filter === 'pending' ? 'All queued tasks in this cycle are completed.' : 'Tasks will appear here as the roadmap evolves.'}</p>{query && <button className="workspace-secondary" onClick={() => setQuery('')}>Clear search</button>}</div>}</div>
    </div>
    <footer className="roadmap-dialog-footer"><div><span>LAST UPDATED</span><time dateTime={feed.updated_at}>{formatRoadmapDate(feed.updated_at)}</time></div><a href="https://github.com/moslembabaee/paper/issues/1" target="_blank" rel="noopener noreferrer">Community tracker <ArrowUpRight size={13} /></a></footer>
    <p className="roadmap-supervisor">Autonomous Tri-Agent Orchestra · Claude Code ↔ OpenAI Codex ↔ Google Antigravity</p>
  </Dialog>
}
