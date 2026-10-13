---
name: tri-agent-watchdog
description: "Use when running long agent loops with watchdog monitoring."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [Orchestration, Watchdog, Cron, Failover, Self-Reflection]
    related_skills: [tri-agent-orchestrator, claude-code, codex, antigravity]
---

# Tri-Agent Self-Reflecting Watchdog

Standard operating procedures and failover patterns for autonomous, multi-hour coding loops.

## When to use

- Supervising 24-hour autonomous multi-agent coding sessions.
- Implementing progress staleness monitoring and cron-based self-reflection.
- Preventing deadlocks from quota limits, PATH isolation, or prompt escaping errors.
- Hooking continuous auto-deployment (CD) for live web applications developed by autonomous agent loops.

## Core principles

1. **Progress Staleness over Process Keep-Alive**: Never rely solely on `pgrep` to confirm an agent loop is healthy. A process can run for hours stuck in an internal retry loop without generating progress. Always compare git commit timestamps (`git log -1 --format=%ct`) against current time. If no new commit has occurred within 25–30 minutes, treat the pipeline as stalled.
2. **Cron Minimal PATH Isolation**: Cron environments execute with a bare minimal PATH (`/usr/bin:/bin`). Watchdogs and revived tmux processes must explicitly export the full toolchain PATH (`node`, `claude`, `codex`, `agy`, `python`) at the top of the script, or CLI invocations fail with exit code 127 (`command not found`).
3. **Strict Shell Escaping with shlex.quote**: Non-interactive prompts frequently contain angle brackets (e.g. `<clear title>`), quotes, or JSON formatting. Raw shell string interpolation causes `/bin/sh` syntax errors and redirection failures (`cannot open file: No such file`). Always wrap prompts in `shlex.quote(prompt)` or pass argument vectors directly without shell evaluation.
4. **Dual Verification Gate (Agent Success + Test Suite)**: Never mark a task completed based on the test command passing alone if the agent command exited with a non-zero code (`agent_code != 0`). A pre-existing build can pass, falsely completing skipped or crashed tasks. Both `agent_code == 0` AND `verify_code == 0` are mandatory.
5. **Gateway Quota & 503 Auto-Failover**: When a proxy gateway returns 503 or quota limits on a specific model, dynamically patch CLI configs (e.g. switch `~/.claude/settings.json` from `claude-sonnet` to `ag/gemini-3.8-flash-high`) or route directly to native CLIs (`codex`, `agy`).
6. **Continuous Auto-Deployment (CD) with Non-Blocking File Locks**: When the agent loop pushes commits for a live web service, hook an auto-deploy script into the watchdog:
   - Compare `.last_deployed_commit` with `git rev-parse HEAD`.
   - Guard builds with `exec 200>/tmp/deploy.lock; flock -n 200 || exit 0` so 2-minute cron ticks never trigger concurrent image builds while one is in progress.
   - Use `git pull --rebase --autostash origin main` so uncommitted files do not block pulling incoming commits.
   - Recreate containers with `docker compose up -d --force-recreate` to reliably swap updated fingerprinted frontend assets.
7. **Observer-Only Contract (No Git Commits from Watchdogs)**: The watchdog is strictly an external supervisor/observer. It must NEVER run `git commit` or `git push`. Maintenance and keep-alive actions belong in log files, not repository commit history. Commits belong exclusively to verified feature milestones.
8. **Strict Log Directory Isolation**: All watchdog, orchestrator, and deploy logs must reside in a dedicated `$PROJECT_DIR/logs/` directory and be added to `.gitignore`. Keeping logs in root causes `git add .` to track log files, dirtying the working directory and polluting git history.

## Watchdog script pattern

Deploy a cron job (`*/2 * * * *`) executing the self-reflection script:

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

# 3. Progress staleness monitoring
LAST_COMMIT_TS=$(git -C "$PROJECT_DIR" log -1 --format=%ct 2>/dev/null || echo 0)
CURRENT_TS=$(date +%s)
COMMIT_AGE=$((CURRENT_TS - LAST_COMMIT_TS))

if [ "$COMMIT_AGE" -gt 1800 ]; then
    echo "[$NOW] [WATCHDOG] Stalled progress detected ($((COMMIT_AGE / 60))m since last commit)!" >> "$LOG_FILE"
    # Kill hung agents (>20m) to force orchestrator failover
    ps -eo pid,etime,cmd | grep -E "claude -p|codex exec|agy -p" | grep -v grep | while read -r pid etime cmd; do
        if [[ "$etime" =~ [0-9]+:[2-5][0-9]:[0-9]{2} ]] || [[ "$etime" =~ [2-9][0-9]:[0-9]{2} ]]; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    # Gateway 503 auto-failover
    if claude -p "ping" --max-turns 1 2>&1 | grep -qE "503|Unavailable"; then
        sed -i 's/"model": ".*"/"model": "ag\/gemini-3.8-flash-high"/' /root/.claude/settings.json
    fi
fi

# 4. Continuous deployment check (logs to logs/deploy.log)
"$PROJECT_DIR/auto_deploy.sh" >> "$LOG_DIR/deploy.log" 2>&1
```
