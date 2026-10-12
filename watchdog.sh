#!/bin/bash
# Autonomous Watchdog for Paper Tri-Agent Orchestrator
# Ensures orchestrator and agents never stay down or hung.

PROJECT_DIR="/root/projects/paper"
LOG_FILE="$PROJECT_DIR/watchdog.log"
ORCH_LOG="$PROJECT_DIR/orchestrator.log"
NOW=$(date -u "+%Y-%m-%d %H:%M:%S UTC")

echo "[$NOW] [WATCHDOG] Checking health..." >> "$LOG_FILE"

# 1. Check free memory
FREE_MEM=$(free -m | awk '/^Mem:/{print $7}')
if [ "$FREE_MEM" -lt 350 ]; then
    echo "[$NOW] [WATCHDOG] Low memory ($FREE_MEM MB). Dropping caches." >> "$LOG_FILE"
    sync && echo 3 > /proc/sys/vm/drop_caches
fi

# 2. Check if orchestrator process is alive
if ! pgrep -f "python3 orchestrator.py" > /dev/null; then
    echo "[$NOW] [WATCHDOG] ⚠️ Orchestrator process NOT FOUND! Reviving..." >> "$LOG_FILE"
    tmux kill-session -t paper-orchestrator 2>/dev/null || true
    tmux new-session -d -s paper-orchestrator "cd $PROJECT_DIR && python3 orchestrator.py"
    echo "[$NOW] [WATCHDOG] ✅ Orchestrator revived in tmux session 'paper-orchestrator'." >> "$LOG_FILE"
else
    echo "[$NOW] [WATCHDOG] Orchestrator is running normally." >> "$LOG_FILE"
fi

# 3. Check for hung child processes (>25 mins run time)
HUNG_PIDS=$(ps -eo pid,etime,cmd | grep -E "claude -p|codex exec|agy -p" | grep -v grep | while read -r pid etime cmd; do
    # Check if time has hours or > 25 minutes
    if [[ "$etime" =~ [0-9]+:[2-5][0-9]:[0-9]{2} ]] || [[ "$etime" =~ [2-9][5-9]:[0-9]{2} ]]; then
        echo "$pid"
    fi
done)

if [ -n "$HUNG_PIDS" ]; then
    echo "[$NOW] [WATCHDOG] Found hung agent process(es): $HUNG_PIDS. Terminating to trigger failover..." >> "$LOG_FILE"
    kill -9 $HUNG_PIDS 2>/dev/null || true
fi

# Rotate watchdog log if larger than 2MB
if [ -f "$LOG_FILE" ] && [ $(stat -c%s "$LOG_FILE") -gt 2097152 ]; then
    tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
