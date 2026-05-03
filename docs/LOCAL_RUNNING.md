# Local Running

## Build

Use Node 24.11.0 and pnpm 10.28.1.

```bash
source ~/.nvm/nvm.sh
nvm use 24.11.0
pnpm install --frozen-lockfile
RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI BACKEND_URL=http://localhost:5005 pnpm build
```

Build outputs:

- frontend: `frontend/dist`
- backend: `backend/dist`

## Run

Preview the built frontend:

```bash
source ~/.nvm/nvm.sh
nvm use 24.11.0
RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI BACKEND_URL=http://localhost:5005 pnpm --dir frontend start
```

Open `http://localhost:3000/`.

For development:

```bash
pnpm dev-fe
pnpm dev-be
```

Defaults:

- frontend: `http://localhost:3000`
- backend: `http://localhost:5005`

## Backend Data

For account/history features, run MongoDB and Redis.

```bash
cp backend/example.env backend/.env
cd backend
npm run docker-db-only
cd ..
pnpm dev-be
```

Default backend env values are in `backend/example.env`:

- MongoDB: `DB_URI=mongodb://localhost:27017`
- database name: `DB_NAME=monkeytype`
- Redis: `REDIS_URI=redis://localhost:6379`
- logs: `LOG_FOLDER_PATH=./logs/`

In dev mode, Redis can be missing; backend logs a warning and continues.

## Frontend Data

Browser-local data is stored in `localStorage`, including:

- `config`
- `acceptedCookies`
- custom text
- tags
- result filters

Firebase auth persistence uses browser persistence/IndexedDB when enabled.

## Docker Data

The self-host Docker setup stores durable service data in named volumes from `docker/docker-compose.yml`:

- MongoDB: `monkeytype_mongo_data`
- Redis: `monkeytype_redis_data`

## Configuration

Backend runtime env is configured through `backend/.env`, copied from `backend/example.env`.

Backend feature configuration lives in the MongoDB `configuration` collection. Docker/self-host overrides can be supplied with `docker/backend-configuration.json`.

Frontend build/runtime config:

- `BACKEND_URL`
- `RECAPTCHA_SITE_KEY`
- `frontend/src/ts/constants/firebase-config.ts`
- `frontend/src/ts/constants/firebase-config-live.ts`

Docker self-host config:

```bash
cd docker
cp example.env .env
docker compose up -d
```

Edit `docker/.env` for:

- `MONKEYTYPE_FRONTENDURL`
- `MONKEYTYPE_BACKENDURL`
- Firebase keys
- reCAPTCHA keys
- email settings
- exposed ports
