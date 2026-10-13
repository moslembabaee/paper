#!/usr/bin/env python3
"""
Tri-Agent Orchestrator (Claude Code + OpenAI Codex + Google Antigravity)
Autonomous, long-running engineering loop with failover, memory management,
automated verification, and continuous Git synchronization.
"""

import os
import sys
import json
import time
import shlex
import subprocess
from datetime import datetime
from pathlib import Path

# Ensure complete PATH is always available even when launched via cron
FULL_PATH = "/root/.local/bin:/root/.hermes/tools/node-26.7.0-linux-x64/bin:/root/.hermes/tools/python-3.14.7+20260901-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
os.environ["PATH"] = f"{FULL_PATH}:{os.environ.get('PATH', '')}"

PROJECT_ROOT = Path("/root/projects/paper").resolve()
ROADMAP_FILE = PROJECT_ROOT / "ROADMAP.json"
LOG_FILE = PROJECT_ROOT / "orchestrator.log"

AGENT_CHAIN = ["claude", "codex", "antigravity"]

def log(msg: str):
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{timestamp}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def run_cmd(cmd: str, timeout: int = 600, cwd: str = str(PROJECT_ROOT)) -> tuple[int, str]:
    try:
        res = subprocess.run(
            cmd,
            shell=True,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout
        )
        return res.returncode, res.stdout
    except subprocess.TimeoutExpired:
        return -1, f"Command timed out after {timeout} seconds"
    except Exception as e:
        return -2, str(e)

def check_resources():
    code, out = run_cmd("free -m | grep Mem:")
    if code == 0:
        parts = out.split()
        if len(parts) >= 7:
            available = int(parts[6])
            log(f"System memory check: {available} MB available")
            if available < 400:
                log("Low memory detected! Dropping OS pagecache...")
                run_cmd("sync && echo 3 > /proc/sys/vm/drop_caches")

def load_roadmap() -> dict:
    with open(ROADMAP_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_roadmap(data: dict):
    with open(ROADMAP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def execute_agent_task(agent: str, prompt: str, is_retry: bool = False) -> tuple[int, str]:
    log(f"Dispatching task to agent [{agent.upper()}] (retry={is_retry})...")
    
    if agent == "claude":
        # Run Claude Code in non-interactive print mode
        cmd = f'claude -p {shlex.quote(prompt)} --max-turns 20'
        return run_cmd(cmd, timeout=900)
        
    elif agent == "codex":
        # Run OpenAI Codex non-interactively in workspace-write sandbox
        cmd = f'codex exec --sandbox workspace-write -c \'model_reasoning_effort="high"\' {shlex.quote(prompt)}'
        return run_cmd(cmd, timeout=900)
        
    elif agent == "antigravity":
        # Run Antigravity CLI with Gemini 3.8 Flash High
        cmd = f'agy -p {shlex.quote(prompt)} --model gemini-3.8-flash-high --effort high --dangerously-skip-permissions --print-timeout 15m'
        return run_cmd(cmd, timeout=900)
        
    else:
        return -1, f"Unknown agent: {agent}"

def build_prompt(task: dict, error_feedback: str = None) -> str:
    prompt = f"""
We are building 'Paper', a high-craft open-source self-hosted design tool inspired by Paper.design (vector infinite canvas, engineering grid, code-bridged handoff, and @paper-design/shaders-react).
Project directory: /root/projects/paper/app

Task ID: {task['id']}
Phase: {task['phase']}
Title: {task['title']}
Description: {task['description']}

Instructions:
1. Implement all necessary code, components, types, and styles in /root/projects/paper/app.
2. Ensure highest craft aesthetic matching Paper: palette (#edebe1 / #080808, #81adec, #222222), precise 120px grid, smooth 60fps performance, clean TypeScript types.
3. Verify your changes pass: {task['verification_cmd']}
"""
    if error_feedback:
        prompt += f"""
PREVIOUS ATTEMPT FAILED WITH THE FOLLOWING ERROR:
--------------------------------------------------
{error_feedback}
--------------------------------------------------
Please analyze the root cause, fix the issue, and ensure the verification passes.
"""
    return prompt.strip()

def run_loop():
    log("=== Starting Tri-Agent Orchestrator Loop ===")
    
    while True:
        check_resources()
        roadmap = load_roadmap()
        
        # Find next pending task
        pending_task = None
        for task in roadmap["tasks"]:
            if task["status"] in ("pending", "in_progress", "failed"):
                pending_task = task
                break
                
        if not pending_task:
            stop_flag = PROJECT_ROOT / "STOP_IMPROVEMENTS"
            if stop_flag.exists():
                log("🛑 Stop flag detected (STOP_IMPROVEMENTS). Pausing continuous improvement loop.")
                break
                
            log("✨ All scheduled tasks completed! Entering Continuous Evolution & Polish Phase...")
            log("Running Autonomous Architecture & Craft Audit via Claude / Codex / Antigravity...")
            
            audit_prompt = """We are continuously perfecting 'Paper', our open-source self-hosted design tool.
Review the entire project in /root/projects/paper/app.
Identify the top 3 high-impact UX, performance, architectural, or MCP feature gaps needed to reach absolute parity with Paper.design.
Output ONLY a raw JSON array of 3 new tasks in this format (no markdown, no backticks):
[
  {
    "id": "T-EVOLVE-1",
    "phase": "Continuous Polish & Evolution",
    "title": "Title here",
    "description": "Concrete requirements here",
    "assigned_agent": "codex",
    "status": "pending",
    "retry_count": 0,
    "verification_cmd": "cd /root/projects/paper/app && npm run build"
  }
]"""
            c_code, c_out = execute_agent_task("claude", audit_prompt)
            if c_code != 0 or not c_out.strip():
                c_code, c_out = execute_agent_task("codex", audit_prompt)
            if c_code != 0 or not c_out.strip():
                c_code, c_out = execute_agent_task("antigravity", audit_prompt)
            try:
                raw_json = c_out.strip()
                if "```json" in raw_json:
                    raw_json = raw_json.split("```json", 1)[1].split("```", 1)[0].strip()
                elif "```" in raw_json:
                    raw_json = raw_json.split("```", 1)[1].split("```", 1)[0].strip()
                new_tasks = json.loads(raw_json)
                if isinstance(new_tasks, list) and len(new_tasks) > 0:
                    ts = int(time.time())
                    for idx, t in enumerate(new_tasks):
                        t["id"] = f"T-EVOLVE-{ts}-{idx+1}"
                    roadmap["tasks"].extend(new_tasks)
                    save_roadmap(roadmap)
                    log(f"🎯 Generated {len(new_tasks)} new evolution tasks for continuous perfection!")
                    time.sleep(5)
                    continue
            except Exception as e:
                log(f"Audit parse failed ({e}). Re-evaluating in 30s...")
                time.sleep(30)
                continue
            
        task_id = pending_task["id"]
        log(f"\n--- Starting Task: {task_id} - {pending_task['title']} ---")
        pending_task["status"] = "in_progress"
        roadmap["current_task_id"] = task_id
        save_roadmap(roadmap)
        
        assigned_agent = pending_task.get("assigned_agent", "claude")
        task_success = False
        error_output = None
        
        # Try agent chain (failover loop)
        agent_idx = AGENT_CHAIN.index(assigned_agent) if assigned_agent in AGENT_CHAIN else 0
        agents_to_try = AGENT_CHAIN[agent_idx:] + AGENT_CHAIN[:agent_idx]
        
        for current_agent in agents_to_try:
            log(f"Attempting task with agent [{current_agent}]...")
            prompt = build_prompt(pending_task, error_output)
            
            # Execute agent
            exit_code, agent_out = execute_agent_task(current_agent, prompt, is_retry=(error_output is not None))
            log(f"Agent [{current_agent}] finished with exit code {exit_code}")
            
            # Run verification command
            verify_cmd = pending_task["verification_cmd"]
            log(f"Running quality gate verification: '{verify_cmd}'...")
            v_code, v_out = run_cmd(verify_cmd, timeout=300)
            
            if exit_code == 0 and v_code == 0:
                log(f"✅ Agent implementation succeeded and quality gate PASSED for task {task_id}!")
                task_success = True
                break
            else:
                log(f"❌ Task attempt failed (agent_code={exit_code}, verify_code={v_code})!")
                if exit_code != 0:
                    log(f"Agent error snippet: {agent_out[-500:] if len(agent_out) > 500 else agent_out}")
                    error_output = agent_out[-2000:]
                else:
                    log(f"Verification output snippet: {v_out[-500:] if len(v_out) > 500 else v_out}")
                    error_output = v_out[-2000:]
                pending_task["retry_count"] += 1
                time.sleep(3)
                
        if task_success:
            pending_task["status"] = "completed"
            pending_task["completed_at"] = datetime.utcnow().isoformat()
            save_roadmap(roadmap)
            
            # Git commit and push checkpoint
            log("Creating Git commit checkpoint and pushing to GitHub...")
            run_cmd("git add .")
            commit_msg = f"feat({pending_task['phase'].split('.')[0]}): {pending_task['title']}"
            run_cmd(f'git commit -m "{commit_msg}"')
            p_code, p_out = run_cmd("git push origin main")
            if p_code == 0:
                log("🚀 Successfully pushed checkpoint to GitHub (moslembabaee/paper)!")
            else:
                log(f"Warning: Git push returned {p_code}: {p_out}")
        else:
            log(f"⚠️ Task {task_id} failed across all agents. Pausing for 10s before retry.")
            pending_task["status"] = "failed"
            save_roadmap(roadmap)
            time.sleep(10)
            
        time.sleep(5)

if __name__ == "__main__":
    run_loop()
