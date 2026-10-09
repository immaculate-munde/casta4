# Supabase workspace storage

When **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** are set on **casta4-api** (`rag-server.js`), uploads are stored in Postgres instead of the ephemeral Render disk.

## What is stored

| Data | Table / column |
|------|----------------|
| Exposure CSV | `casta4_workspaces.exposure_csv` |
| Team EP CSV | `casta4_workspaces.ep_curve_model_csv` |
| Manifest (region, uploads log, CAT settings) | `casta4_workspaces.manifest` (jsonb) |
| Chat / knowledge-base documents | `casta4_workspace_documents` (filename + text) |

Workspace row id: **`CASTA4_WORKSPACE_ID`** (default `default` — one shared demo book).

Without Supabase env vars, behavior is unchanged: **`data/workspace/`** or **`WORKSPACE_ROOT`**.

## One-time setup

1. Create a Supabase project (or use an existing one).
2. Run the migration in **`supabase/migrations/20260309100000_casta4_workspace.sql`**  
   (Supabase Dashboard → SQL, or `supabase db push` if you use the CLI).
3. Project Settings → API → copy **Project URL** and **service_role** secret.
4. On Render **casta4-api**, set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - optional `CASTA4_WORKSPACE_ID=default`
5. Redeploy the API. First request seeds Nairobi exposure into the `default` row if missing.

## Security

- Use **service role** only on the Node API — never in Next.js `NEXT_PUBLIC_*` vars.
- Tables have RLS enabled with **no** anon policies; only the service role should access them.
- Do not commit `.env` with the service role key.

## Verify

`GET /api/workspace/status` should show:

```json
"workspace_backend": "supabase",
"workspace_root": "supabase:default"
```

Upload a document in chat, then check **`casta4_workspace_documents`** in the Supabase table editor.

## Chat history (ReAgent)

Run **`supabase/migrations/20260309110000_casta4_chat_sessions.sql`** as well.

Set the same **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** on **casta4-web** (`web/.env.local` and Render **casta4-web** env). Chats are keyed by **sign-in email** — different users get separate threads; syncs across browsers when signed in.

Without web Supabase env, chats still persist in **localStorage** for that browser only.
