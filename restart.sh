#!/usr/bin/env bash
#
# Stop PlaneFighter (if running) and start it again with a fresh build.
#
set -euo pipefail
cd "$(dirname "$0")"

PID_FILE="${PID_FILE:-./.planefighter.pid}"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping PID $PID ..."
    kill "$PID" 2>/dev/null || true
    # Give it a moment to exit, then force if needed.
    for _ in $(seq 1 10); do
      kill -0 "$PID" 2>/dev/null || break
      sleep 0.5
    done
    kill -9 "$PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

exec ./start.sh
