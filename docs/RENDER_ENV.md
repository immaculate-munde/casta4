# Render environment variables (Casta4)

Set these in the [Render Dashboard](https://dashboard.render.com) → select the service → **Environment**.

## casta4-api (Node — `rag-server.js`)

This is the **only** service that reads **`CASTA4_WORKSPACE_ID`**. It selects which row in Supabase `casta4_workspaces` (and which snapshot set) is the live demo book.

### Paste these on **casta4-api** → Environment

| Key | Value |
|-----|--------|
| `GROQ_API_KEY` | Your Groq secret |
| `SUPABASE_URL` | `https://zplfpnzgkxgkbpalqzks.supabase.co` (your project URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role secret (Project Settings → API) |
| `CASTA4_WORKSPACE_ID` | `default` — **leave as-is** for one shared hackathon book; change only if you want a separate prod workspace row in Supabase |

`render.yaml` already sets **`CASTA4_WORKSPACE_ID=default`** on casta4-api. You do **not** need to add it again unless you want a different id (e.g. `kenya_re_demo`).

| Key | Required | Notes |
|-----|----------|--------|
| `GROQ_API_KEY` | Yes | ReAgent / RAG (secret) |
| `SUPABASE_URL` | Recommended | Workspace + saved regional CSVs |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | **Service role** — never expose to browser |
| `CASTA4_WORKSPACE_ID` | Optional | **`default`** in blueprint; scopes all API uploads to one Supabase workspace row |
| `CAT_MODEL_URL` | Auto | From blueprint → casta4-cat URL |
| `GROQ_MODEL`, `GROQ_MAX_TOKENS` | Auto | From `render.yaml` |

**Not on casta4-web:** do not set `CASTA4_WORKSPACE_ID` on the Next.js service — the web app talks to the API; the API owns the workspace id.

**Workspace uploads** (exposure CSV, RAG docs, saved regional books) use Supabase when URL + service role are set on **casta4-api**.

## casta4-web (Next.js)

| Key | Required | Notes |
|-----|----------|--------|
| `RAG_SERVER_URL` | Auto | Internal proxy to casta4-api |
| `NEXT_PUBLIC_RAG_API_URL` | Auto | Same API URL for client |
| `SUPABASE_URL` | Recommended | Same project as API |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | **Server-only** — chat history API routes (`/api/chat/sessions`) |

Do **not** prefix the service role with `NEXT_PUBLIC_`.

## casta4-cat (Python)

No Supabase vars — only CAT engine settings if you customize paths.

## Supabase SQL (one-time)

Run all migrations under `supabase/migrations/` in the Supabase SQL editor:

1. `20260309100000_casta4_workspace.sql`
2. `20260309110000_casta4_chat_sessions.sql`
3. `20260309120000_casta4_exposure_snapshots.sql`

After deploy, verify:

- `https://<casta4-api>/api/workspace/status` → `"workspace_backend": "supabase"`
- Map upload panel → **Saved regional books** dropdown
