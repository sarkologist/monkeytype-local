#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DIR="$ROOT/.local"
PID_DIR="$LOCAL_DIR/pids"
LOG_DIR="$LOCAL_DIR/logs"
FIREBASE_DATA_DIR="$LOCAL_DIR/firebase-emulator-data"
FIREBASE_CONFIG="$LOCAL_DIR/firebase.json"

mkdir -p "$PID_DIR" "$LOG_DIR" "$FIREBASE_DATA_DIR" "$ROOT/backend/src/credentials"

wait_for_http_shutdown() {
  local name="$1"
  local url="$2"
  for _ in {1..80}; do
    if ! curl -sS "$url" >/dev/null 2>&1; then
      return
    fi
    sleep 0.25
  done
  echo "$name did not stop."
  exit 1
}

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
  nvm use 24.11.0 >/dev/null
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required to keep the local stack running after startup exits."
  exit 1
fi

"$ROOT/scripts/monkeytype-local-stop.sh" >/dev/null || true
wait_for_http_shutdown "Firebase Auth emulator" "http://127.0.0.1:9099/"
wait_for_http_shutdown "Firebase emulator hub" "http://127.0.0.1:4400/"

: > "$LOG_DIR/firebase-auth.log"
: > "$LOG_DIR/backend.log"
: > "$LOG_DIR/frontend.log"

if [[ ! -f "$ROOT/backend/.env" ]]; then
  cp "$ROOT/backend/example.env" "$ROOT/backend/.env"
fi

cat > "$ROOT/frontend/src/ts/constants/firebase-config-live.ts" <<'CONFIG'
export const firebaseConfig = {
  apiKey: "fake-api-key",
  authDomain: "localhost",
  projectId: "monkeytype-local",
  storageBucket: "monkeytype-local.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:local",
};
CONFIG

cat > "$FIREBASE_CONFIG" <<'CONFIG'
{
  "emulators": {
    "auth": {
      "host": "127.0.0.1",
      "port": 9099
    },
    "ui": {
      "enabled": false
    }
  }
}
CONFIG

echo "Building production frontend/backend..."
(
  cd "$ROOT"
  RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI \
    BACKEND_URL=http://localhost:5005 \
    FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099 \
    BYPASS_CAPTCHA=true \
    pnpm exec turbo run build --force
)

cp "$ROOT/docker/local-backend-configuration.json" "$ROOT/backend/dist/backend-configuration.json"

echo "Starting MongoDB and Redis..."
(cd "$ROOT/backend" && docker compose --env-file .env -f docker/compose.db-only.yml up -d)

echo "Starting Firebase Auth emulator..."
firebase_import_args=()
if [[ -f "$FIREBASE_DATA_DIR/firebase-export-metadata.json" ]]; then
  firebase_import_args=(--import "$FIREBASE_DATA_DIR")
fi
firebase_import_command=""
if [[ ${#firebase_import_args[@]} -gt 0 ]]; then
  firebase_import_command="--import $FIREBASE_DATA_DIR"
fi
tmux new-session -d -s monkeytype-firebase-auth \
  "export PATH=/Users/sark/.nvm/versions/node/v24.11.0/bin:\$PATH; cd '$ROOT'; exec pnpm --dir frontend exec firebase emulators:start --only auth --project monkeytype-local --config '$FIREBASE_CONFIG' $firebase_import_command --export-on-exit '$FIREBASE_DATA_DIR' >> '$LOG_DIR/firebase-auth.log' 2>&1"

echo "Starting backend..."
tmux new-session -d -s monkeytype-backend \
  "export PATH=/Users/sark/.nvm/versions/node/v24.11.0/bin:\$PATH; cd '$ROOT/backend'; exec env MODE=production PORT=5005 DB_NAME=monkeytype DB_URI=mongodb://localhost:27017 REDIS_URI=redis://localhost:6379 LOG_FOLDER_PATH='$LOG_DIR/backend' FRONTEND_URL=http://localhost:3000 RECAPTCHA_SECRET=6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe BYPASS_CAPTCHA=true BYPASS_ANTICHEAT=true BYPASS_EMAILCLIENT=true FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=monkeytype-local node ./dist/server.js >> '$LOG_DIR/backend.log' 2>&1"

echo "Starting frontend preview..."
tmux new-session -d -s monkeytype-frontend \
  "export PATH=/Users/sark/.nvm/versions/node/v24.11.0/bin:\$PATH; cd '$ROOT/frontend'; exec env RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI pnpm exec vite preview --host 127.0.0.1 --port 3000 >> '$LOG_DIR/frontend.log' 2>&1"

wait_for_url() {
  local name="$1"
  local url="$2"
  local log_file="$3"
  for _ in {1..80}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return
    fi
    sleep 0.25
  done
  echo "$name did not start. Last log lines:"
  tail -n 80 "$log_file" || true
  exit 1
}

wait_for_http_response() {
  local name="$1"
  local url="$2"
  local log_file="$3"
  for _ in {1..80}; do
    if curl -sS "$url" >/dev/null 2>&1; then
      return
    fi
    sleep 0.25
  done
  echo "$name did not start. Last log lines:"
  tail -n 80 "$log_file" || true
  exit 1
}

wait_for_http_response "Firebase Auth emulator" "http://127.0.0.1:9099/" "$LOG_DIR/firebase-auth.log"
wait_for_url "Backend" "http://127.0.0.1:5005/configuration" "$LOG_DIR/backend.log"
wait_for_url "Frontend" "http://127.0.0.1:3000/" "$LOG_DIR/frontend.log"

echo "Monkeytype local stack starting."
echo "Frontend: http://localhost:3000/"
echo "Logs: $LOG_DIR"
