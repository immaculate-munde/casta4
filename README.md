# Casta4

Agentic flood **catastrophe modelling** and **underwriter decision support** for the Kenya Re AI4I Hackathon 2026. The product UI is **Next.js** (`web/`). **ReAgent** answers policy, treaty, and claims questions with **RAG** (Groq). **Linus’s Python CAT engine** drives portfolio EP/ELT, single-risk underwriting, and vulnerability curves.


## What’s implemented

| Area | Description |
|------|-------------|
| **Map** | MapLibre flood desk, hazard scenarios (2–100 yr tiers), flood book, location dossier (overview, scenarios, underwriting, exposure), optional exposure CSV upload |
| **Operations** | Claims KPIs, flood/TIV metrics, CAT 100-yr GUL/gross/net when engine is up, event loss table |
| **EP curve** | CAT AEP chart, baseline vs AI rectified EP, ELT, vulnerability matrix, hazard landscape (CSV index), optional team EP CSV |
| **Chat** | ReAgent (Groq), session history, knowledge-base file upload into workspace RAG |
| **Settings** | Theme, CAT controls (AI rectifier, deductible, quota share, hotspot km), disclosures, workspace reset |
| **Workspace API** | Active exposure, EP model, chat documents, manifest, region/currency on upload |
| **Auth** | Demo cookie sign-in (work email); replace with IdP in production |

**Financial exposure story:** TIV + hazard tiers → damage curves → Python **portfolio simulation** → **KES** (or workspace currency) GUL/gross/net and EP by return period. See `docs/MODEL_IO.md` for external team CSV schemas.

**Demo data:** Nairobi starter pack in `data/team_a_nairobi/`. Additional synthetic regional CSVs under `data/team_a_*` (for proving dynamic upload — pitch focuses on Nairobi).

## Architecture

```text
Browser → casta4-web (Next.js)
            ↓ /api/* rewrites
          casta4-api (Node rag-server.js)
            ↓ CAT_MODEL_URL          ↓ GROQ_API_KEY
          casta4-cat (Python FastAPI)   Groq LLM
```

| Process | Port (local) | Entry |
|---------|----------------|--------|
| Web | 3000 | `cd web && npm run dev` |
| API | 3001 | `node rag-server.js` |
| CAT | 8000 | `cd nairobi-flood-cat && uvicorn server:app --host 0.0.0.0 --port 8000` |

## Local development

### Prerequisites

- Node.js 18+
- Python 3.10+ (for CAT)
- Groq API key

### 1. API (repo root)

```sh
npm install
cp .env.example .env   # if present; otherwise create .env
```

Root `.env` (example):

```env
GROQ_API_KEY=your_key_here
CAT_MODEL_URL=http://localhost:8000
```

```sh
node rag-server.js
```

Health: `http://localhost:3001/health`

### 2. CAT engine

```sh
cd nairobi-flood-cat
pip install -r requirements-server.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

Health: `http://localhost:8000/health`

### 3. Web

```sh
cd web
cp .env.example .env.local
npm install
npm run dev
```

`web/.env.local`:

```env
RAG_SERVER_URL=http://localhost:3001
NEXT_PUBLIC_RAG_API_URL=http://localhost:3001
```

Open **http://localhost:3000** → **Sign in** → default home **Map**.

Next.js proxies `/api/nairobi`, `/api/workspace`, `/api/dashboard`, `/api/claims`, `/api/cat`, and `/api/rag` to the API (see `web/next.config.mjs`).

## Deploy on Render

Use the blueprint: **`render.yaml`** (three web services: `casta4-web`, `casta4-api`, `casta4-cat`).

**You must set manually (casta4-api only):**

| Variable | Purpose |
|----------|---------|
| `GROQ_API_KEY` | ReAgent / RAG |

**Wired by blueprint:** `CAT_MODEL_URL` (api → cat), `RAG_SERVER_URL` and `NEXT_PUBLIC_RAG_API_URL` (web → api), `GROQ_MODEL`, `GROQ_MAX_TOKENS`, `NODE_ENV`.

Optional for **persistent uploads** on the API service: attach a disk and set `WORKSPACE_ROOT` to the mount path (default workspace is ephemeral on Render).

Details: [Render docs](https://render.com/docs) · `web/.env.example`

## Project layout

```text
casta4/
  web/                    # Next.js app (Casta4 UI)
  rag-server.js           # Node API + RAG + workspace + dashboard
  lib/                    # Routes, workspace store, CAT client, Nairobi portfolio
  nairobi-flood-cat/      # Python CAT (server.py + engine/)
  data/
    team_a_nairobi/       # Starter exposure, hotspots, vulnerability matrix
    workspace/            # Active demo workspace (exposure + manifest)
    team_a_*/             # Optional synthetic regional CSVs
  docs/                   # RAG corpus + MODEL_IO.md
  scripts/                # generate-regional-exposure.js
  render.yaml             # Render Blueprint
  public/                 # Legacy static UI (optional)
  netlify/functions/      # Legacy WhatsApp/Netlify (separate from Render stack)
```

## Key API routes

| Prefix | Examples |
|--------|----------|
| `/api/nairobi/*` | `meta`, `summary`, `exposure`, `loss-curve`, `vulnerability` |
| `/api/workspace/*` | `exposure`, `ep-model`, `document`, `cat-settings`, `status`, `reset-default` |
| `/api/cat/*` | `health`, `simulate`, `underwrite-single`, `disclosures` (proxied to Python) |
| `/api/dashboard` | Operations KPIs + CAT block |
| `/ask`, `/rag` | ReAgent retrieval + Groq |

## Regional synthetic data

Generate CSVs (same schema as Nairobi):

```sh
node scripts/generate-regional-exposure.js          # all regions in script
node scripts/generate-regional-exposure.js mombasa  # one region
```

See `data/REGIONS_README.txt`. Upload on **Map** with a **region label**; currency is inferred (e.g. Lusaka → ZMW). **CAT GeoTIFF/hotspots** are Nairobi-oriented; portfolio simulation uses **CSV hazard columns** everywhere.

## Environment variables (reference)

| Variable | Where | Notes |
|----------|--------|--------|
| `GROQ_API_KEY` | API | Required for chat |
| `GROQ_MODEL` | API | Default `qwen/qwen3.8-27b` |
| `CAT_MODEL_URL` | API | Python CAT base URL |
| `RAG_SERVER_URL` | Web (build/runtime) | Next rewrite target |
| `NEXT_PUBLIC_RAG_API_URL` | Web | Server-side API base |
| `WORKSPACE_ROOT` | API | Optional persistent workspace path |
| `CAT_DATA_DIR`, `CAT_*` | API/CAT | Optional; override bundled Nairobi data paths |

Do **not** commit `.env` files with secrets.

## Security

- Demo auth only — use SSO / API tokens in production.
- Restrict CORS and rate limits before public launch.
- Groq key only on the API service, not in the browser bundle.

## Team

- **Immaculate Munde** — frontend & product (Next.js workspace)
- **Washington Adiado** — machine learning & data
- **Ireri Linus Mugendi** — RAG & catastrophe engine (Python)

## Legacy

- **`public/`** — original static ReAgent UI
- **`DEPLOYMENT-GUIDE.md`** — Netlify-oriented; primary deploy path today is **Render** + `render.yaml`

For model I/O contracts: **`docs/MODEL_IO.md`**. For mentor/deck workflow (swimlanes, financial path, demo script): **`docs/WORKFLOW.md`**.
