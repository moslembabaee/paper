#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PROJECT_ROOT = Path("/root/projects/paper").resolve()
LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "webhook.log"
ROADMAP_FILE = PROJECT_ROOT / "ROADMAP.json"

def log(msg: str):
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{timestamp}] [WEBHOOK] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def trigger_issue_bot():
    try:
        log("Triggering issue_bot to reconcile roadmap and GitHub issues...")
        subprocess.Popen([sys.executable, str(PROJECT_ROOT / "issue_bot.py")])
    except Exception as e:
        log(f"Error triggering issue_bot: {e}")

def mark_task_approved(issue_num: int):
    try:
        if not ROADMAP_FILE.exists():
            return False
        with open(ROADMAP_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        modified = False
        for task in data.get("tasks", []):
            task_id = task.get("id", "")
            is_match = (
                task.get("github_issue_number") == issue_num
                or task_id == f"T-ISSUE-{issue_num}"
            )
            if is_match and task.get("status") in ("waiting_approval", "pending_approval", "pending", "failed"):
                task["status"] = "approved"
                task["retry_count"] = 0
                modified = True
                log(f"✅ Task {task_id} marked as APPROVED (matched Issue #{issue_num})")
                
        if modified:
            try:
                subprocess.run(f'gh issue edit {issue_num} --repo moslembabaee/paper --remove-label "blocked"', shell=True)
            except Exception:
                pass
            with open(ROADMAP_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            try:
                import roadmap_sync
                roadmap_sync.sync_roadmap_to_github()
            except Exception:
                pass
            return True
    except Exception as e:
        log(f"Error in mark_task_approved: {e}")
    return False

class GitHubWebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        event_type = self.headers.get("X-GitHub-Event", "unknown")
        
        body = self.rfile.read(content_length).decode("utf-8")
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        log(f"Received webhook event '{event_type}'")

        if event_type == "ping":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"pong"}')
            return

        if event_type == "issues":
            action = payload.get("action", "")
            issue = payload.get("issue", {})
            num = issue.get("number")
            title = issue.get("title", "")
            label_name = payload.get("label", {}).get("name", "").lower()
            
            log(f"Issue #{num} ('{title}') action='{action}', label='{label_name}'")
            
            if action == "labeled" and label_name == "approved":
                log(f"Issue #{num} received 'approved' label! Authorizing task...")
                mark_task_approved(num)
                trigger_issue_bot()
            elif action in ("opened", "reopened", "labeled", "unlabeled"):
                trigger_issue_bot()

        elif event_type == "issue_comment":
            action = payload.get("action", "")
            comment = payload.get("comment", {})
            issue = payload.get("issue", {})
            num = issue.get("number")
            author = comment.get("user", {}).get("login", "").lower()
            comment_body = comment.get("body", "").lower()

            log(f"Comment on Issue #{num} by @{author}: {comment_body[:80]}...")
            
            if action == "created" and author == "moslembabaee":
                if any(kw in comment_body for kw in ("/approve", "approved", "lgtm")):
                    log(f"Issue #{num} approved via comment by @{author}! Authorizing task...")
                    mark_task_approved(num)
                    trigger_issue_bot()

        elif event_type == "push":
            ref = payload.get("ref", "")
            commits = payload.get("commits", [])
            head_commit = payload.get("after") or (commits[-1].get("id") if commits else "unknown")
            log(f"Push event on ref '{ref}' (head: {head_commit[:8] if head_commit else 'unknown'}, {len(commits)} commits)")
            if ref in ("refs/heads/main", "refs/heads/master"):
                log("Target is production branch main. Triggering auto_deploy.sh in background...")
                try:
                    subprocess.Popen(["/bin/bash", str(PROJECT_ROOT / "auto_deploy.sh")])
                except Exception as e:
                    log(f"Error launching auto_deploy.sh: {e}")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"Paper GitHub Webhook Listener is active\n")

    def log_message(self, format, *args):
        # Suppress default stdout log
        pass

def run():
    port = 9095
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, GitHubWebhookHandler)
    log(f"🚀 GitHub Webhook Listener running on 127.0.0.1:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
    log("Webhook Listener stopped.")

if __name__ == "__main__":
    run()
