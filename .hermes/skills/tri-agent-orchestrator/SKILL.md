---
name: tri-agent-orchestrator
description: "Use when running long-running multi-agent coding pipelines."
version: 1.3.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [Orchestration, Multi-Agent, Claude, Codex, Antigravity, Watchdog, Cron, Continuous-Evolution, GitHub-Issues]
    related_skills: [claude-code, codex, antigravity, github]
---

# Tri-Agent Orchestrator

Supervisor, watchdog, and failover orchestration engine driving Claude Code, OpenAI Codex, and Google Antigravity in an autonomous, continuous loop.

## When to use

- Launching or monitoring multi-hour / 24-hour product builds.
- Orchestrating tasks across Claude, Codex, and Antigravity with automated failover.
- Managing persistent disk roadmaps (`ROADMAP.json`), watchdogs, and automated verification gates.
- Running perpetual software evolution and autonomous polish loops with complete GitHub Issue visibility.

## Core principles

1. **Zero-Context Bloat**: Break products into 15–40 granular micro-tasks (30–60 min each) on disk (`ROADMAP.json`). Never run an agent in a single unbounded session; invoke each task with a fresh context turn.
2. **Sequential Resource Management**: On machines with bounded RAM (e.g. 4GB), never run agents concurrently. Execute one agent at a time to prevent OOM kills.
3. **Failover Relay Chain**: Route tasks in order: `Claude -> Codex -> Antigravity (Gemini)`. If an agent hits rate limits, quota exhaustion, or fails tests, immediately pass the failure output to the next agent.
4. **Mandatory Watchdog & Keep-Alive**: An orchestrator must have an independent cron watchdog (`watchdog.sh` running every 2 minutes) to auto-revive the daemon if it crashes, kill hung child processes (>25m), and drop OS cache on low memory.
5. **Batch Checkpoints vs Direct-to-Main Churn**: Commit checkpoints to git so progress survives restarts, but NEVER push rapid, unverified micro-commits to `main` every few minutes in an unconstrained loop. If continuous deployment is attached to `main`, rapid micro-commits cause constant container rebuilds, transient broken states, and user frustration. Keep evolution tasks on an evolution/staging branch or batch multiple verified tasks into cohesive milestone commits.
6. **No Separate Infrastructure/Maintenance Commits**: Watchdogs, internal cron tasks, deploy scripts, and supervisor daemons must NEVER make independent commits to git. Infrastructure scripts are silent observers; git history belongs strictly to clean, verified application feature/fix milestones.
7. **Strict Runtime Log Isolation**: Runtime logs (`orchestrator.log`, `watchdog.log`, `deploy.log`, `issue_bot.log`) must ALWAYS be directed to a dedicated `logs/` directory and explicitly excluded via `.gitignore`. Never leave logs in repository root or allow them to be tracked by git (`git add .`), as log churn dirties worktrees, triggers git merge conflicts, and pollutes git commit diffs with thousands of irrelevant log lines.
8. **Dual Verification Gate (No False Completions)**: A task must NEVER be marked as completed based solely on a passing build if the agent exited non-zero (`exit_code != 0`). Require both `exit_code == 0` AND verification test passing (`v_code == 0`).
9. **Iterative Dynamic Replanning (Never Waterfall)**: Planning is not a static one-off list. After every 2–3 milestones, run an automated gap analysis against the target product specs (e.g. protocol compliance, data schema completeness, undo/redo). Dynamically mutate `ROADMAP.json` by inserting newly discovered requirements.
10. **Perpetual Evolution Loop (Kaizen Mode) with Approval Gate**: Reaching 100% on initial roadmap tasks is not "done". The orchestrator transitions into Continuous Polish & Audit. However, before entering perpetual loops that push code, require either explicit user confirmation or gate auto-deploys behind a stable tag. The loop halts when `STOP_IMPROVEMENTS` is touched.
11. **Deep Functional Validation over Superficial Mockups**: Complex products are defined by deep mechanics (real MCP servers, WebGL canvas shaders, AST code generators). Prevent superficial UI shells by requiring end-to-end headless Playwright tests that actively click, drag, zoom, and assert canvas state.
12. **Issue-Driven Lifecycle with Transparency & Authorization Gates**:
    - **Visibility for All Planned Work**: Every planned task (including autonomous evolution features proposed by AI) must create a visible GitHub Issue so stakeholders see who planned it, what agent is assigned (`Claude`, `Codex`, `Antigravity`), and what is currently `in-progress`.
    - **Owner-Gated External Issues**: Never auto-schedule untrusted issues from external users (which may contain destructive prompts like 'delete all features'). External issues are analyzed, labeled `triaged` (or `conflict`), and held behind a mandatory **Owner Authorization Gate** (requiring the owner's label `approved` or `/approve` comment).
    - **Owner Auto-Approval**: Issues submitted directly by the repository owner (e.g. @moslembabaee) are trusted and auto-approved into the roadmap.
    - **Active Tracking & Auto-Closure**: When an agent begins execution, label the issue `in-progress`. Once verification passes and commits land on `main`, immediately comment with the resolving commit hash and close the issue.
    - **Roadmap Reconciliation**: If an issue is already marked `approved` or `in-progress` on GitHub but missing from local `ROADMAP.json` (due to restart/reset), the bot must immediately re-inject it at index 0.
13. **User Visibility & Reporting**: Report milestone transitions, active agent assignments, and git commit hashes clearly in chat turns so the user always has live visibility into system state.
14. **Live Single-Source GitHub Roadmap Dashboard**: Never force users to inspect raw JSON or terminal logs to understand project status. The orchestrator must automatically generate and sync a formatted `ROADMAP.md` at repository root (and mirror it to a pinned GitHub Issue, e.g. Issue #1) showing real-time progress percentage, currently active task with assigned agent, upcoming priority queue, and completed deliverables changelog. This document must be re-synced and committed on every state transition.

## Critical Pitfalls & Lessons

- **Unsynchronized Issue Lifecycle & Missing Autonomous Issue Creation**: If the orchestrator creates tasks solely in an internal JSON roadmap without corresponding GitHub issues, stakeholders lose visibility into what is planned, who is assigned, and what is executing. Every planned evolution milestone should have an accompanying GitHub Issue labeled `approved` and assigned appropriately, transitioning to `in-progress` during execution and `closed` upon verification. For community-submitted issues, enforce strict owner-approval gates (label `approved` or `/approve` comment by authorized approvers) to protect the codebase from malicious or destructive prompts (e.g. 'delete all features'), while auto-approving issues submitted directly by repository owners.
- **Orphaned In-Progress GitHub Issues from Roadmap Desynchronization**: Never check only `"in-progress" not in labels` when deciding whether to dispatch an approved GitHub issue to `ROADMAP.json`. If the local roadmap was regenerated or reverted after an issue was labeled `in-progress`, the bot skips re-adding it, leaving the issue orphaned indefinitely while the orchestrator pursues internal tasks. Always check `if is_approved and not existing_task:` so any approved issue missing from the local roadmap is restored to the front of the queue immediately.
- **Rapid Unverified Commits to Main Break Stability**: Never let an autonomous loop commit and push to `main` every few minutes without throttling or manual inspection. When automated CI/CD watchdogs trigger on git changes, unvetted intermediate commits disrupt running environments and deploy half-baked features. Always consolidate evolution sprints into batched checkpoints or require user confirmation before pushing to production branches.
- **Log Files Tracked in Git Create Continuous Git Noise**: If logs (`*.log`) reside in repository root and get swept into commits via `git add .`, every log append marks the repo dirty, causes merge conflicts on pull, and pollutes commit diffs. Always isolate all logs in a dedicated `logs/` directory, untrack existing `.log` files via `git rm --cached`, and enforce `logs/` and `*.log` in `.gitignore`.
- **Audit / Task Generation Turn-Limit Exhaustion**: When prompting an autonomous coding agent CLI (e.g. `claude -p`) solely to generate new tasks or output structured JSON, instruct it explicitly: "Do not use shell tools or read files. Output ONLY raw JSON." and clamp turns (e.g. `--max-turns 2`). Without this directive, the agent exhausts its turn budget exploring the filesystem, exits non-zero (`Error: Reached max turns`), and leaves an empty output that crashes JSON parsers.
- **Alpine Nginx Docker Healthcheck IPv6 / Localhost Mismatch**: In Alpine Linux containers, `wget -qO- http://localhost/...` resolves `localhost` to IPv6 (`::1`). If Nginx configuration only has `listen 80;` without `listen [::]:80;`, the connection is refused, causing Docker healthchecks to fail and marking containers `unhealthy` despite the server running fine on IPv4. Always use `http://127.0.0.1/...` in `HEALTHCHECK` test commands or add `listen [::]:80;` in Nginx.
- **Cron Minimal PATH Pitfall**: Cron executes with a stripped PATH (`/usr/bin:/bin`). When `watchdog.sh` is invoked by cron and revives the orchestrator in `tmux`, `tmux` inherits this stripped PATH. Agent CLI binaries (`codex`, `claude`, `agy`) fail immediately with exit code 127 ("command not found"). Always explicitly export the complete PATH in `watchdog.sh` and set `os.environ["PATH"]` in Python scripts.
- **Shell Metacharacter Escaping (`shlex.quote`)**: Prompts containing `<` and `>` (e.g. placeholder tags `<title>`) or nested quotes trigger shell redirection syntax errors (`cannot open title: No such file`), causing the CLI to fail or receive an empty prompt. Always wrap prompt strings with `shlex.quote(prompt)` when invoking CLIs via shell subprocesses.
- **Self-Reflecting Progress Staleness Check**: Checking only if the Python process exists is insufficient; a daemon can be trapped in an internal retry loop without making progress. The watchdog must check the timestamp of the latest commit (`git log -1 --format=%ct`). If no commit has landed for > 30 minutes, flag a stall, test model gateway status (e.g. 503 limits), auto-switch to fallback models, and unblock the queue.

## Pre-flight checklist

Before launching long-running product development, ensure all verification layers are installed:
- **Visual & UI QA**: Playwright with system libraries (`npm install -g playwright && npx playwright install --with-deps chromium`).
- **Container Testing**: Docker daemon & Docker Compose plugin running (`docker compose version`).
- **Memory Guard**: Ensure at least 2GB Swap space exists to prevent OOM during heavy Vite/Next/Rust builds.
- **Reverse Engineering**: Use REA (`rea-agents`) to extract design tokens, CSS variables, and canvas shaders from reference web bundles before generating the roadmap.

## Watchdog implementation pattern

Deploy `/path/to/project/watchdog.sh` running via cron (`*/2 * * * *`):

```bash
#!/bin/bash
export PATH="/root/.local/bin:/root/.hermes/tools/node-26.7.0-linux-x64/bin:/root/.hermes/tools/python-3.14.7+20260901-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

PROJECT_DIR="/path/to/project"
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/watchdog.log"
NOW=$(date -u "+%Y-%m-%d %H:%M:%S UTC")

# 1. Low memory recovery
FREE_MEM=$(free -m | awk '/^Mem:/{print $7}')
if [ "$FREE_MEM" -lt 350 ]; then
    sync && echo 3 > /proc/sys/vm/drop_caches
fi

# 2. Process keep-alive
if ! pgrep -f "python3 orchestrator.py" > /dev/null; then
    tmux kill-session -t orchestrator 2>/dev/null || true
    tmux new-session -d -s orchestrator "cd $PROJECT_DIR && python3 orchestrator.py"
fi

# 3. Progress staleness & self-reflection (Check last commit timestamp)
LAST_COMMIT_TS=$(git -C "$PROJECT_DIR" log -1 --format=%ct 2>/dev/null || echo 0)
CURRENT_TS=$(date +%s)
COMMIT_AGE=$((CURRENT_TS - LAST_COMMIT_TS))

if [ "$COMMIT_AGE" -gt 1800 ]; then
    # Kill hung child agents (>20 mins) to trigger orchestrator failover
    ps -eo pid,etime,cmd | grep -E "claude -p|codex exec|agy -p" | grep -v grep | while read -r pid etime cmd; do
        if [[ "$etime" =~ [0-9]+:[2-5][0-9]:[0-9]{2} ]] || [[ "$etime" =~ [2-9][5-9]:[0-9]{2} ]]; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
fi

# 4. Process GitHub Issue pipeline
python3 "$PROJECT_DIR/issue_bot.py" >> "$LOG_FILE" 2>&1
```

## GitHub Issue Bot Authorization & Lifecycle Pattern

```python
# Maintainer authorization config: maintainers.json
# { "authorized_approvers": ["moslembabaee"], "approval_keywords": ["/approve", "LGTM"] }

# 1. Autonomous Evolution: Whenever AI plans new tasks, create GitHub issues labeled 'enhancement,approved'.
# 2. Community Issue Triage: AI assesses community issues, checks conflicts, comments, labels 'triaged'.
# 3. Authorization Gate: External issues stay queued until an authorized approver labels 'approved' or comments '/approve'.
#    Issues opened by repository owner (@moslembabaee) are trusted and auto-approved.
# 4. Active Execution: When orchestrator begins work on a task, add label 'in-progress'.
# 5. Closure: When verification passes and commits land on main, comment with the commit hash and close the issue.
```

## Management commands

- **Start in background**:
  ```bash
  tmux new-session -d -s orchestrator "cd /path/to/project && python3 orchestrator.py"
  ```
- **Check live log**:
  ```bash
  tail -f /path/to/project/logs/orchestrator.log
  ```
- **Inspect roadmap status**:
  ```bash
  python3 -c "import json; d=json.load(open('ROADMAP.json')); print([f\"{t['id']}: {t['status']}\" for t in d['tasks']])"
  ```
- **Signal completion / stop improvements**:
  ```bash
  touch /path/to/project/STOP_IMPROVEMENTS
  ```
- **Attach to tmux session**:
  ```bash
  tmux attach -t orchestrator
  ```
