# Autonomous Agent Guidelines & Architecture: Paper

This repository is maintained and developed autonomously using the **Tri-Agent Orchestra** architecture (`Claude Code`, `OpenAI Codex`, and `Google Antigravity`).

Any AI agent (Hermes Agent, Claude Code, Codex, or Cursor) working on this codebase should follow these guidelines.

---

## 🏗 Project Architecture & Layout

- **`app/`**: Core React + Vite + TypeScript application (Infinite Canvas, Shaders, Scene Graph, UI).
  - Framework: React 19, Tailwind CSS v4, Vite 8, TypeScript 6.
  - Dependencies: `@paper-design/shaders-react`, `lucide-react`.
  - Quality Gate Verification: `cd app && npm run build`.
- **`orchestrator.py`**: Multi-agent task runner with automatic agent failover (`Claude -> Codex -> Antigravity`).
- **`watchdog.sh`**: 2-minute cron supervisor that checks memory, revives crashed sessions in `tmux`, checks progress staleness, and runs auto-deployment.
- **`issue_bot.py`**: GitHub Issue lifecycle manager with authorization gates for community contributions.
- **`roadmap_sync.py`**: Synchronizes `ROADMAP.json` to `ROADMAP.md` and the pinned GitHub Issue #1.
- **`auto_deploy.sh`**: Zero-downtime containerized Continuous Deployment for Docker Compose.
- **`docker-compose.yml` & `Dockerfile`**: Production Alpine Nginx serving SPA on port `3000`.
- **`.hermes/skills/`**: Portable Hermes skills bundled directly with this repository.

---

## 🧠 Project Skills

Project-specific Hermes skills are stored in `.hermes/skills/`:
- **`tri-agent-orchestrator`** (`.hermes/skills/tri-agent-orchestrator/SKILL.md`): Long-running multi-agent coding pipelines, task scheduling, failover chains, and quality gates.
- **`tri-agent-watchdog`** (`.hermes/skills/tri-agent-watchdog/SKILL.md`): Cron monitoring, memory cache shedding, progress staleness detection, and continuous auto-deployment.

When launching a new Hermes Agent instance in this repo, enable project skills:
```yaml
# In config.yaml or skills config:
skills:
  trusted_project_dirs:
    - /path/to/paper
```

---

## 📋 Task & GitHub Issue Workflow

1. **Roadmap as Source of Truth:**
   Tasks are defined in `ROADMAP.json`. Each task has an `id`, `phase`, `title`, `description`, `assigned_agent`, `status`, and `verification_cmd`.

2. **GitHub Issue Transparency:**
   - Every planned evolution task creates a corresponding GitHub Issue with label `enhancement` and `approved`.
   - When an agent begins work, the issue receives the `in-progress` label.
   - When verification passes and commits are pushed to `main`, the issue is automatically commented with the commit reference and closed.

3. **Community Issues & Security Gate:**
   - Issues opened by the repository owner (`@moslembabaee`) are automatically approved and dispatched into `ROADMAP.json`.
   - Issues opened by external users are labeled `triaged` (or `conflict`) and **held behind an owner authorization gate**. They will NEVER execute unless `@moslembabaee` adds the `approved` label or comments `/approve`.

4. **Git & Commit Standards:**
   - Micro-tasks are verified with `cd app && npm run build` before committing.
   - Commit messages follow Conventional Commits: `feat(Phase): Title`.
   - Never commit runtime logs or watchdog artifacts (`logs/` is in `.gitignore`).

---

## 🚀 How to Run Autonomous Development

1. **Verify Environment:**
   ```bash
   cd /root/projects/paper/app && npm run build
   ```
2. **Start Orchestrator Daemon:**
   ```bash
   tmux new-session -d -s paper-orchestrator "cd /root/projects/paper && python3 orchestrator.py"
   ```
3. **Attach Watchdog to Cron:**
   ```bash
   crontab -e
   # Add: */2 * * * * /root/projects/paper/watchdog.sh >> /root/projects/paper/logs/watchdog.log 2>&1
   ```
