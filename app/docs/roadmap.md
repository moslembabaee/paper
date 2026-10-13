# Community roadmap

Open **Roadmap** in the editor footer to see Issue #1's development tracker. The dialog shows task counts, progress, agent assignments, phases and UTC completion dates. Search by feature, task ID, phase or agent; filter by active, upcoming, completed or failed work. Completed tasks appear newest first, and upcoming tasks retain their source priority.

The Vite plugin reads the repository's `../ROADMAP.json` on every development request. The dialog checks every 30 seconds while it is open and the tab is visible, on returning to the tab, and on reconnecting. **Refresh** checks immediately. Requests time out after eight seconds; unavailable or malformed feeds leave the last successful data visible with an error message. Closing the dialog cancels its requests and timers.

`npm run build` emits a sanitized `dist/roadmap.json` alongside the app. Only task IDs, titles, statuses, phases, agents and completion dates are published; internal task descriptions, verification commands and retry metadata stay private. The update timestamp comes from the canonical file's modification time. If the canonical file is absent, standalone app checkouts use the included sixteen-deliverable snapshot published on October 13, 2026, at 05:15:57 UTC. Static builds label this data **Published snapshot**.

To publish changes on a static host, rebuild and redeploy, or replace the hosted `roadmap.json` atomically with a new feed. The feed URL respects Vite's configured base path. Use this public format:

```json
{
  "project": "Paper",
  "updated_at": "2026-10-13T05:15:57Z",
  "mode": "snapshot",
  "tasks": [
    {
      "id": "T-EXAMPLE",
      "title": "Build a community feature",
      "phase": "Community & Issues",
      "assigned_agent": "codex",
      "status": "completed",
      "completed_at": "2026-10-13T05:00:00Z"
    }
  ]
}
```

Statuses are `in_progress`, `pending`, `failed`, and `completed`. IDs must be unique. Completion dates are optional; timestamps without a timezone are interpreted as UTC to match the orchestrator. `mode: "live"` is reserved for feeds backed by a running updater. Empty feeds show zero percent completion. Search and status filters do not change overall progress counts.

The Community tracker link opens the public GitHub issue. Viewing this panel does not require GitHub access or credentials and does not edit or close the issue.
