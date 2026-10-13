#!/usr/bin/env python3
"""
Autonomous GitHub Issue Bot for Paper
1. Triages new issues (technical review, conflict detection, implementation plan).
2. Requires explicit authorization from maintainers (via label 'approved' or comment '/approve').
3. Dispatches approved issues to the Tri-Agent Orchestra (ROADMAP.json).
4. Closes issues upon verified implementation.
"""

import os
import sys
import json
import shlex
import subprocess
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path("/root/projects/paper").resolve()
ROADMAP_FILE = PROJECT_ROOT / "ROADMAP.json"
MAINTAINERS_FILE = PROJECT_ROOT / "maintainers.json"
LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "issue_bot.log"
REPO = "moslembabaee/paper"

FULL_PATH = "/root/.local/bin:/root/.hermes/tools/node-26.7.0-linux-x64/bin:/root/.hermes/tools/python-3.14.7+20260901-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
os.environ["PATH"] = f"{FULL_PATH}:{os.environ.get('PATH', '')}"

def log(msg: str):
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{timestamp}] [ISSUE-BOT] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def run_cmd(cmd: str, timeout: int = 120) -> tuple[int, str]:
    try:
        res = subprocess.run(
            cmd,
            shell=True,
            cwd=str(PROJECT_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout
        )
        return res.returncode, res.stdout
    except Exception as e:
        return -1, str(e)

def load_maintainers() -> dict:
    if MAINTAINERS_FILE.exists():
        with open(MAINTAINERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"authorized_approvers": ["moslembabaee"], "approval_keywords": ["/approve"]}

def load_roadmap() -> dict:
    with open(ROADMAP_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_roadmap(data: dict):
    with open(ROADMAP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def fetch_open_issues() -> list:
    cmd = f'gh issue list --repo {REPO} --state open --json number,title,body,author,labels,comments'
    code, out = run_cmd(cmd)
    if code == 0:
        try:
            return json.loads(out)
        except Exception as e:
            log(f"Failed to parse issues JSON: {e}")
    else:
        log(f"Error fetching issues: {out}")
    return []

def analyze_issue_with_ai(issue: dict) -> tuple[bool, str]:
    """
    Returns (has_conflict, feedback_markdown)
    """
    prompt = f"""You are the Lead Systems Architect for 'Paper' (open-source self-hosted design tool).
A user opened a new GitHub Issue:
Title: {issue['title']}
Description:
{issue['body']}

Analyze this request against Paper's core architecture (React, Canvas, Scene Graph, Shaders, MCP, Export/Import).
1. Is there any technical contradiction, duplicate feature, or architectural conflict?
2. If conflict exists, explain clearly what the issue is and suggest an alternative.
3. If valid, summarize the technical implementation plan (components to change, state changes, tests).

Format your response as a professional GitHub markdown comment. Start directly with '### 🤖 AI Architect Assessment'."""

    # Run quick analysis with claude or codex
    cmd = f'claude -p {shlex.quote(prompt)} --max-turns 3'
    code, out = run_cmd(cmd, timeout=90)
    if code != 0 or not out.strip():
        # Fallback to codex
        cmd = f'codex exec --sandbox workspace-write {shlex.quote(prompt)}'
        code, out = run_cmd(cmd, timeout=90)
        
    analysis_text = out.strip() if code == 0 and out.strip() else "### 🤖 AI Architect Assessment\nIssue received and queued for review."
    has_conflict = "conflict" in analysis_text.lower() or "contradict" in analysis_text.lower()
    return has_conflict, analysis_text

def process_issues():
    maintainers_cfg = load_maintainers()
    authorized_users = [u.lower() for u in maintainers_cfg.get("authorized_approvers", ["moslembabaee"])]
    approval_keywords = [k.lower() for k in maintainers_cfg.get("approval_keywords", ["/approve"])]
    
    issues = fetch_open_issues()
    if not issues:
        return
        
    log(f"Found {len(issues)} open issue(s). Processing...")
    roadmap = load_roadmap()
    roadmap_modified = False
    
    for issue in issues:
        num = issue["number"]
        title = issue["title"]
        # Skip system tracker and roadmap dashboard issues
        if num == 1 or "live tracker" in title.lower() or "roadmap" in title.lower():
            continue
        author = issue.get("author", {}).get("login", "").lower()
        labels = [l.get("name", "").lower() for l in issue.get("labels", [])]
        comments = issue.get("comments", [])
        
        # Check if already completed in roadmap
        task_id = f"T-ISSUE-{num}"
        existing_task = next((t for t in roadmap["tasks"] if t["id"] == task_id), None)
        
        if existing_task and existing_task.get("status") == "completed":
            log(f"Issue #{num} task {task_id} is completed! Closing GitHub issue...")
            close_comment = f"✅ **Implemented & Verified!**\n\nThe Tri-Agent Orchestra has completed and verified the implementation of Issue #{num}. Changes are committed to `main`.\n\nThank you for contributing to Paper!"
            run_cmd(f'gh issue comment {num} --repo {REPO} -b {shlex.quote(close_comment)}')
            run_cmd(f'gh issue close {num} --repo {REPO}')
            continue
            
        # Check approval status
        is_approved = "approved" in labels
        if not is_approved:
            # Check comments for approval keyword by authorized user
            for c in comments:
                c_author = c.get("author", {}).get("login", "").lower()
                c_body = c.get("body", "").lower()
                if c_author in authorized_users:
                    if any(kw in c_body for kw in approval_keywords):
                        is_approved = True
                        log(f"Issue #{num} approved via comment by @{c_author}!")
                        run_cmd(f'gh issue edit {num} --repo {REPO} --add-label "approved"')
                        break
                        
        # 1. New un-triaged issue
        if "triaged" not in labels and "in-progress" not in labels and not is_approved:
            log(f"Triaging new issue #{num}: '{title}'...")
            has_conflict, feedback = analyze_issue_with_ai(issue)
            
            feedback += f"\n\n---\n**Authorization Gate:** To schedule this issue for autonomous implementation, the repository owner (@moslembabaee) or an authorized maintainer must label this issue as `approved` or reply with `/approve`."
            
            run_cmd(f'gh issue comment {num} --repo {REPO} -b {shlex.quote(feedback)}')
            new_label = "conflict" if has_conflict else "triaged"
            run_cmd(f'gh issue edit {num} --repo {REPO} --add-label "{new_label}"')
            log(f"Issue #{num} triaged and labeled as '{new_label}'.")
            continue
            
        # 2. Approved issue ready for implementation
        if is_approved and "in-progress" not in labels and not existing_task:
            log(f"Issue #{num} is APPROVED. Adding to active ROADMAP...")
            new_task = {
                "id": task_id,
                "phase": "Community & Issues",
                "title": f"Issue #{num}: {title}",
                "description": issue.get("body", "") + f"\n\nReference: Closes #{num}",
                "assigned_agent": "codex",
                "status": "pending",
                "retry_count": 0,
                "verification_cmd": "cd /root/projects/paper/app && npm run build"
            }
            # Put approved issue task next in queue
            roadmap["tasks"].insert(0, new_task)
            roadmap_modified = True
            
            ack_msg = f"🚀 **Scheduled for Autonomous Development!**\n\nThis issue has been authorized and queued into the Tri-Agent Orchestra as `{task_id}`. Implementation is starting..."
            run_cmd(f'gh issue comment {num} --repo {REPO} -b {shlex.quote(ack_msg)}')
            run_cmd(f'gh issue edit {num} --repo {REPO} --add-label "in-progress"')
            log(f"Issue #{num} dispatched into ROADMAP as task {task_id}.")
            
    if roadmap_modified:
        save_roadmap(roadmap)

if __name__ == "__main__":
    process_issues()
