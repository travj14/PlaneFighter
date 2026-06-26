#!/usr/bin/env bash
#
# Build PlaneFighter and serve it in the background.
# Override defaults with env vars, e.g.:  PORT=8080 HOST=0.0.0.0 ./start.sh
#
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="planefighter"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-4173}"
PID_FILE="${PID_FILE:-./.planefighter.pid}"
LOG_FILE="${LOG_FILE:-./planefighter.log}"

# Already running?
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "$APP_NAME is already running (PID $(cat "$PID_FILE"))."
  echo "Use ./restart.sh to restart it."
  exit 0
fi

# Install dependencies if needed.
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

# Build the production bundle.
echo "Building production bundle..."
npm run build

# Serve the built app in the background. Run vite directly so the PID we record
# is the actual server process (clean kill on restart).
echo "Starting $APP_NAME on http://$HOST:$PORT ..."
nohup node_modules/.bin/vite preview --host "$HOST" --port "$PORT" --strictPort \
  >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 1
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "$APP_NAME started (PID $(cat "$PID_FILE")). Logs: $LOG_FILE"
else
  echo "Failed to start $APP_NAME. Check $LOG_FILE."
  rm -f "$PID_FILE"
  exit 1
fi
