ReAgent AI - Nairobi Flood Hazard Data Pack (Team A)
====================================================

This pack is the RAG-facing claims scenario for the Kenya Re AI4I Hackathon 2026
Team A track: Nairobi urban (pluvial) flood catastrophe decision-support.

It matches the catastrophe desk in this repo:
  - Synthetic exposure + hazard scores: data/team_a_nairobi/
  - Flood CAT engine: lib/nairobi-flood-cat.js (return-period tiers, damage ratios)
  - Desk UI: /catastrophe (Next.js) or public/catastrophe.html

Scenario: Kariobangi Cold Storage & Logistics Ltd suffers a pluvial flood loss
during the April 2026 long rains. The claim (KES 92,000,000) sits above the
cedant's treaty retention, so it becomes a reinsurance claim for Kenya Re.
Hazard context is consistent with Team A hotspot list (Kariobangi, Dandora,
Mathare, and related Eastlands drainage corridors) and the 0–1 susceptibility
scores used on the catastrophe desk (not measured flood depth).

FILES

01_policy.txt
  Commercial flood / special perils policy (Amani General -> Kariobangi Cold
  Storage). Perils, flood-specific exclusions, warranties (drainage clearance,
  elevated storage / flood mark), excess. Used by the Claims Agent for coverage.

02_reinsurance_treaty.txt
  Kenya Re surplus treaty for the flood-exposed commercial book. Retention /
  capacity, enhanced-assessment rules, exclusions, and Article 6 — the referral
  conditions that must be checked before settlement. Primary document for
  demoing agentic escalation (Article 6.1(a)-(d)).

03_claim_form.txt
  The claim as submitted after the April 2026 pluvial event. Deliberately
  incomplete: independent flood investigation and drainage-maintenance records
  are outstanding. Good for testing "agent detects missing documentation."

04_flood_investigation_report.txt
  Independent loss adjuster's flood investigation. Lower preliminary estimate
  than the insured's claim; flags probable
  Warranty breaches (uncleared drains, stock stored below declared flood mark)
  without giving a legal conclusion — judgment calls for human review.

05_historical_claims.csv
  29 prior flood (and related water) claims plus this one (30 rows) for the
  anomaly / risk check in lib/anomalyCheck.js. Signals: claim-to-sum-insured
  ratio, notification delay, flood defences present, drainage maintained,
  prior claim count. Row HC-030 (current claim) is unusual on purpose: no
  flood defences, drainage not maintained, 2 prior water claims, cause still
  under investigation.

RELATIONSHIP TO CATASTROPHE DESK DATA

  Hazard tiers (common → extreme) map to return periods 5 / 10 / 25 / 100 / 250
  years in lib/nairobi-flood-cat.js. Exposure rows are synthetic; scores are a
  pluvial susceptibility proxy (0–1), not surveyed depths. Hotspots in
  nairobi_hotspots_geocoded.csv are county-named flood-prone localities used
  for map validation — not policy locations.

SUGGESTED FIRST TEST

Ask your RAG layer: "What does the treaty say about when a claim must be
referred to Kenya Re before settlement?" It should retrieve Article 6.1 from
02_reinsurance_treaty.txt and identify that this claim triggers at least two
conditions (gross loss exceeds KES 60,000,000; cause / warranty applicability
in doubt pending the flood investigation).

Follow-up: "Does the flood investigation suggest any warranty breach?" should
cite Warranty 1 (drainage) and Warranty 2 (elevated storage) from the policy
and the adjuster's findings in 04_flood_investigation_report.txt.
