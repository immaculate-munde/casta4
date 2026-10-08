# Nairobi flood CAT (Linus engine)

**Production:** headless API only — used by Casta4 `rag-server` via `CAT_MODEL_URL`.

```bash
cd nairobi-flood-cat
pip install -r requirements-server.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

- `GET /health`
- `POST /simulate` — body: `{ "csv": "<exposure csv text>", "use_ai_rectifier": true, ... }`
- `GET /vulnerability-curves` — JRC depth–damage curves

**Optional dev UI (not deployed with Casta4):**

```bash
pip install -r requirements.txt
streamlit run app.py
```

Data: `data/team_a_nairobi/` (exposure, hotspots, GeoTIFF rasters for single-risk sampling).
