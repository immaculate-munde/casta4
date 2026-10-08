Regional synthetic exposure (upload on Map → Upload CSV)

Files (150 locations each, same columns as team_a_nairobi/exposure_nairobi_with_hazard.csv):

  team_a_mombasa/exposure_mombasa_with_hazard.csv   → region label: Mombasa
  team_a_kisumu/exposure_kisumu_with_hazard.csv     → region label: Kisumu
  team_a_wajir/exposure_wajir_with_hazard.csv       → region label: Wajir
  team_a_turkana/exposure_turkana_with_hazard.csv   → region label: Turkana
  team_a_lusaka/exposure_lusaka_with_hazard.csv       → region label: Lusaka (Zambia)
  team_a_cote_divoire/exposure_cote_divoire_with_hazard.csv → region label: Côte d'Ivoire or Abidjan

Regenerate all:
  node scripts/generate-regional-exposure.js

Regenerate one region:
  node scripts/generate-regional-exposure.js kisumu

Loc ID prefixes: MBSA-, KSM-, WJR-, TRK-, LSK-, CIV-

Currency on upload: Kenya regions KES · Lusaka ZMW · Côte d'Ivoire XOF (CFA)

Not real portfolios. On upload, region label sets currency (e.g. Lusaka → ZMW, Kenya regions → KES).
Portfolio CAT uses CSV hazard columns; Nairobi GeoTIFF/hotspots only fully apply for Nairobi.
