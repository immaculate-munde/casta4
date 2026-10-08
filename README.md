# Nairobi Flood CAT Prototype

This project is a synthetic flood catastrophe model for Nairobi, built to satisfy the Team A hackathon brief: ingest hazard data, apply a vulnerability function, model exposure and financial loss, generate a return-period curve, and use an AI component that materially changes the result.

It is intentionally designed to be transparent about assumptions, explicit about synthetic data, and understandable to non-modellers through a simple results interface.

## Challenge alignment

This project is aligned with the challenge requirements and the starter-kit constraints:

- Synthetic exposure only: no real client portfolio is used
- Hazard is a proxy, not measured flood depth
- Vulnerability is adapted from published depth-damage logic and clearly disclosed
- Financial loss engine computes loss by building and by scenario
- Return-period / exceedance probability curve is produced
- AI materially changes the output rather than just describing it
- The interface makes it clear what is real data and what is modelled / assumed

## Core idea

The model follows the standard catastrophe pipeline:

1. Hazard: where flooding is likely and how severe it is
2. Vulnerability: how that severity translates into damage
3. Exposure: what buildings are in the area and what they are worth
4. Financial engine: convert the hazard and damage into loss and then aggregate to a loss curve

This is implemented across the codebase in:

- [lib/nairobi-flood-cat.js](lib/nairobi-flood-cat.js)
- [nairobi-flood-cat/engine/financial.py](nairobi-flood-cat/engine/financial.py)
- [nairobi-flood-cat/engine/vulnerability.py](nairobi-flood-cat/engine/vulnerability.py)
- [nairobi-flood-cat/engine/hazard_ai.py](nairobi-flood-cat/engine/hazard_ai.py)

## What the project does

### Hazard layer

The model starts with the provided Nairobi hazard proxy:

- [data/team_a_nairobi/exposure_nairobi_with_hazard.csv](data/team_a_nairobi/exposure_nairobi_with_hazard.csv)
- [data/team_a_nairobi/nairobi_hotspots_geocoded.csv](data/team_a_nairobi/nairobi_hotspots_geocoded.csv)

This dataset provides a 0–1 susceptibility score for five tiers:

- common
- occasional
- moderate
- severe
- extreme

These are proxy severity indicators, not measured flood depths. The project is explicit about this and does not present the scores as real hydrological measurements.

### Vulnerability / damage function

The damage function translates flood severity into a damage ratio for each construction type. The project adapts a JRC-style depth-damage logic with transparent assumptions rather than pretending a Kenya-specific curve exists.

It reflects the fact that:

- low severity produces low damage
- damage rises sharply in the middle of the hazard range
- losses are capped at realistic upper bounds rather than automatically reaching 100%
- informal and fragile construction is more sensitive than reinforced concrete

The vulnerability logic is implemented in:

- [nairobi-flood-cat/engine/vulnerability.py](nairobi-flood-cat/engine/vulnerability.py)
- [lib/nairobi-flood-cat.js](lib/nairobi-flood-cat.js)

### Exposure layer

The project uses a synthetic Nairobi portfolio containing hundreds of building locations with:

- latitude / longitude
- housing or construction type
- floor area
- insured value
- hazard scores by tier
- source metadata

This satisfies the challenge requirement that exposure be synthetic and clearly labelled as such.

### Financial loss engine

For each building, the financial engine:

1. looks up hazard severity at each tier
2. passes the value through the vulnerability function
3. obtains the damage ratio
4. multiplies by insured value
5. aggregates losses across the portfolio
6. produces scenario losses and an EP / return-period curve

This is implemented in:

- [nairobi-flood-cat/engine/financial.py](nairobi-flood-cat/engine/financial.py)
- [lib/nairobi-flood-cat.js](lib/nairobi-flood-cat.js)

## AI component that materially changes the output

The required differentiator in the challenge is an AI layer that changes the model result, not just writes a summary.

This project includes a drainage-aware AI enhancement in:

- [nairobi-flood-cat/engine/hazard_ai.py](nairobi-flood-cat/engine/hazard_ai.py)

### What it does

The base hazard proxy can miss drainage-driven flooding in known hotspot areas such as Westlands, Lavington, and Kibera. The AI layer uses hotspot proximity and geospatial correction to raise the effective hazard score where the terrain proxy underestimates local flood risk.

This is important because the project is not claiming to be a full hydrological model. Instead, it acknowledges the known limitation of the proxy and improves it using an explainable, data-driven adjustment.

This is exactly the type of “AI contribution” judges want to see:

- it changes the hazard input and therefore changes loss output
- it is transparent
- it is grounded in known hotspot data
- it is not a generic description layer

## Interface and explainability

The interface is built for non-modellers to understand quickly:

- total exposure
- loss by return period / scenario
- EP curve
- breakdown by housing or construction type
- map click drilldown for property-level results
- clear synthetic / assumption labels

The front-end dashboard is in:

- [web/components/CatastropheDesk.js](web/components/CatastropheDesk.js)

## Assumptions and transparency

The model is intentionally honest about what is real and what is assumed.

### Real data / observed context

- hazard proxy structure and hotspot coordinates are real geospatial inputs
- the hotspot validation logic is based on real named flood-prone locations
- the broad geographic context is real Nairobi data

### Synthetic / modelled content

- the exposure portfolio is synthetic
- the building values are synthetic
- the vulnerability curve is an adapted proxy model, not officially calibrated Kenya claims data
- the return periods are explanatory scenario assumptions, not observed hydrological frequencies
- the hazard values are susceptibility scores, not measured flood depth

This transparency is a strength in a challenge that rewards honest, explainable modelling.

## In-scope and out-of-scope

### In scope

- hazard ingestion from a real or proxy dataset
- documented vulnerability function
- synthetic exposure portfolio
- loss engine and EP curve
- one AI-powered stage that materially changes output
- interface understandable to non-modelers

### Out of scope

- real client portfolio data
- reinsurance-layer structuring or net-of-reinsurance loss
- full physically based hydrology
- multi-peril aggregation
- real claim or policy integration

This matches the challenge intent: a sensible three-day prototype using open data and transparent assumptions.

## Run locally

### Install dependencies

```bash
cd /home/lino/Desktop/Casta4
npm install
```

### Run the Python catastrophe prototype

```bash
cd /home/lino/Desktop/Casta4/nairobi-flood-cat
streamlit run app.py
```

### Run the Node API and loss-curve service

```bash
cd /home/lino/Desktop/Casta4
node rag-server.js
```

### Run the Next.js dashboard

```bash
cd /home/lino/Desktop/Casta4/web
npm install
npm run dev
```

## Verification

The project has been verified with fresh checks:

```bash
cd /home/lino/Desktop/Casta4
node --test tests/nairobi-flood-cat.test.js
```

This confirms the key logic is working:

- damage matrix increases with hazard severity
- default Nairobi synthetic exposure generates a valid EP curve
- uploaded CSV exposure also generates a valid EP curve

Additional API verification was also performed against the upload endpoint, confirming that uploaded CSV portfolio data flows through the same loss engine.

## Short summary for judges

This prototype builds a Nairobi flood catastrophe model using the provided synthetic portfolio, a documented JRC-inspired vulnerability function, and a hazard proxy that is explicitly treated as a susceptibility index rather than measured flood depth. It improves the hazard layer through a drainage-aware AI adjustment that materially changes loss estimates, then aggregates per-building losses into a return-period excess-loss curve. The model is transparent about synthetic inputs, explains the proxy limitations, and presents outputs in a user-friendly dashboard suitable for underwriters, portfolio managers, or judges without requiring code inspection.

## Project contributors

- Immaculate Munde
- Ireri Linus Mugendi
- Washington Adiado
