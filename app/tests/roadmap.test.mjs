import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseRoadmap, roadmapProgress, visibleTasks, utcTimestamp } from '../src/roadmap/model.ts'

const date = '2026-10-13T05:15:57Z'
const task = (id, status, extra = {}) => ({ id, title: `Feature ${id}`, status, phase: 'Canvas', assigned_agent: 'codex', ...extra })

test('community projection strips prompts, commands and internal metadata, and treats orchestrator dates as UTC', () => {
  const feed = parseRoadmap({ updated_at: date, current_task_id: 'private', tasks: [task('done', 'completed', {
    completed_at: '2026-10-13T04:49:12.245572', description: 'internal prompt', verification_cmd: '/private/path', retry_count: 3,
  })] }, { mode: 'live' })
  assert.equal(feed.mode, 'live')
  assert.deepEqual(Object.keys(feed.tasks[0]).sort(), ['assigned_agent', 'completed_at', 'id', 'phase', 'status', 'title'])
  assert.equal(feed.tasks[0].completed_at, '2026-10-13T04:49:12.245Z')
  assert.equal(utcTimestamp('2026-10-13 04:49:12'), '2026-10-13T04:49:12.000Z')
  assert.equal(utcTimestamp('2026-10-13T06:49:12+02:00'), '2026-10-13T04:49:12.000Z')
  assert.equal(utcTimestamp('not a date'), undefined)
})

test('failed tasks count toward total without being counted as completed; empty queues are zero percent', () => {
  assert.deepEqual(roadmapProgress([task('a', 'completed'), task('b', 'pending'), task('c', 'failed'), task('d', 'in_progress')]), { completed: 1, total: 4, percent: 25 })
  assert.deepEqual(roadmapProgress([]), { completed: 0, total: 0, percent: 0 })
})

test('active work precedes queue priority and completed work is newest first; search includes task ID, phase and agent', () => {
  const tasks = [
    task('old', 'completed', { completed_at: '2026-10-12T04:49:12Z' }),
    task('queue-first', 'pending'), task('queue-second', 'pending'), task('active', 'in_progress'),
    task('attention', 'failed'), task('new', 'completed', { completed_at: '2026-10-13T04:49:12Z', assigned_agent: 'claude' }),
  ]
  assert.deepEqual(visibleTasks(tasks, 'all', '').map(item => item.id), ['active', 'queue-first', 'queue-second', 'attention', 'new', 'old'])
  assert.deepEqual(visibleTasks(tasks, 'completed', ' CLAUDE ').map(item => item.id), ['new'])
  assert.equal(visibleTasks(tasks, 'pending', 'canvas').length, 2)
  assert.equal(visibleTasks(tasks, 'all', 'queue-second')[0].id, 'queue-second')
  assert.equal(visibleTasks(tasks, 'completed', 'nothing').length, 0)
  assert.equal(tasks[0].id, 'old')
})

test('invalid feeds fail atomically so callers can retain their last snapshot', () => {
  for (const invalid of [null, {}, { tasks: [] }, { updated_at: date, tasks: [task('a', 'unknown')] },
    { updated_at: date, tasks: [task('a', 'pending'), task('a', 'pending')] },
    { updated_at: date, tasks: [task('a', 'completed', { completed_at: 'broken' })] }]) {
    assert.throws(() => parseRoadmap(invalid), /Invalid/)
  }
})

test('standalone snapshot preserves all sixteen issue deliverables and its published timestamp', async () => {
  const feed = parseRoadmap(JSON.parse(await readFile(new URL('../src/roadmap/snapshot.json', import.meta.url), 'utf8')))
  assert.equal(feed.mode, 'snapshot')
  assert.equal(feed.updated_at, '2026-10-13T05:15:57.000Z')
  assert.deepEqual(roadmapProgress(feed.tasks), { completed: 16, total: 16, percent: 100 })
  assert.equal(visibleTasks(feed.tasks, 'completed', '')[0].id, 'T-OFFICIAL-DOCS-FEATURE-PARITY')
})
