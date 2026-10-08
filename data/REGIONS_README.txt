Regional synthetic exposure (upload on Map → Upload CSV)

Files (150 locations each, same columns as team_a_nairobi/exposure_nairobi_with_hazard.csv):

  team_a_mombasa/exposure_mombasa_with_hazard.csv   → region label: Mombasa
  team_a_kisumu/exposure_kisumu_with_hazard.csv     → region label: Kisumu
  team_a_wajir/exposure_wajir_with_hazard.csv       → region label: Wajir
  team_a_turkana/exposure_turkana_with_hazard.csv   → region label: Turkana
  team_a_lusaka/exposure_lusaka_with_hazard.csv       → region label: Lusaka (Zambia)

Regenerate all:
  node scripts/generate-regional-exposure.js

Regenerate one region:
  node scripts/generate-regional-exposure.js kisumu

Loc ID prefixes: MBSA-, KSM-, WJR-, TRK-, LSK-

Not real portfolios. CAT engine rasters remain Nairobi-oriented unless you add region-specific engine data.
