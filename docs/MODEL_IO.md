# Model I/O (external team)

Casta4 does **not** run your financial CAT engine. It loads portfolio exposure from CSV and displays **your** exceedance curve after upload.

## Input (dynamic portfolio)

**CSV:** upload on Map → same columns as `docs/sample exposure` (see Settings / exposure schema API).

**JSON:** `GET /api/workspace/model-input`

Returns `schema_version`, region metadata, `total_tiv_kes`, and `locations[]` with `lat`, `lon`, `tiv_kes`, `hazards`, cedant fields.

Your model should accept any well-structured exposure table with those concepts; column names in CSV are fixed for the hackathon UI.

## Output (EP curve)

**CSV upload:** EP curve page, or `POST /api/workspace/ep-model` with `{ "csv": "..." }`.

**Required columns:** `return_period_years`, `loss_kes`

**Optional columns:** `aep`, `loss_net_kes`, `loss_p05_kes`, `loss_p95_kes`, `label`, `tier`, `series`

**Schema:** `GET /api/workspace/ep-model-schema`

The UI maps one row set into three **switchable views**:

| View | CSV fields used |
|------|-----------------|
| Gross loss | `loss_kes` |
| Net loss | `loss_net_kes` (falls back to gross if missing on a row) |
| Uncertainty band | `loss_p05_kes`, `loss_p95_kes` (gross line + shaded band) |

Sample file: `docs/sample_ep_curve_model.csv`
