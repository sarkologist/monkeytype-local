#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/.local/pids"

stop_pid() {
  local name="$1"
  local file="$PID_DIR/$name.pid"
  if [[ ! -f "$file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in {1..40}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.25
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$file"
}

stop_pid frontend
stop_pid backend
stop_pid firebase-auth

if command -v tmux >/dev/null 2>&1; then
  tmux kill-session -t monkeytype-frontend 2>/dev/null || true
  tmux kill-session -t monkeytype-backend 2>/dev/null || true
  tmux kill-session -t monkeytype-firebase-auth 2>/dev/null || true
fi

if [[ -f "$ROOT/backend/.env" ]]; then
  (cd "$ROOT/backend" && docker compose --env-file .env -f docker/compose.db-only.yml down)
fi

echo "Monkeytype local stack stopped."
