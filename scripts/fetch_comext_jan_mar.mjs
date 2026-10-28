/**
 * Fetches live Comext 2026 monthly trade data (Jan–Mar) per CN code
 * and writes a CSV: rows = CN codes, columns = Jan, Feb, Mar (tonnes).
 *
 * Usage: node scripts/fetch_comext_jan_mar.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

const BASE = "https://ec.europa.eu/eurostat/api/comext/dissemination/sdmx/2.1/data/DS-045409";
const MONTHS = ["2026-01", "2026-02", "2026-03"];

const QUERIES = {
  "Iron & Steel": "26011200+7201+720211+720241+72026000+7203+7205+72061000+7208+7209+7210+72111300+7212+7213+72142000+7215+7216+721710+721720+72181000+72191100+72193100+7221+722300+722410+72251100+722530+722550+7301+7302+730300+730419+730439+7305+73061900+73063080+73072100+73079100+7308+7309+7310+731100+731815+731816+73182200+73182300+73269098",
  "Aluminum":     "7601+7603+76041010+76041090+76042100+76042910+76042990+7605+7606+7607+7608+76090000+76101000+76110000+7612+76130000+7614+76161000+76169100+76169910+76169990",
  "Fertilizers":  "28080000+28141000+28142000+28342100+31021012+31021015+31021019+31021090+31022100+31022900+31023010+31023090+31024010+31024090+31025000+31026000+31028000+31029000+31051000+31052010+31052090+31053000+31054000+31055100+31055900+31059020+31059080",
  "Hydrogen":     "28041000",
  "Cement":       "25070080+25231000+25232100+25232900+25239000+25233000",
};

// cn_key → { sector, "2026-01": tonnes, "2026-02": tonnes, "2026-03": tonnes }
const data = {};

for (const [sector, codes] of Object.entries(QUERIES)) {
  const url = `${BASE}/M.EU27_2020.US.${codes}.1./?format=SDMX-CSV&startPeriod=2026-01&endPeriod=2026-03`;
  console.error(`Fetching ${sector}…`);

  let txt;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) { console.error(`  HTTP ${r.status} — skipping`); continue; }
    txt = await r.text();
  } catch (e) {
    console.error(`  Error: ${e.message}`);
    continue;
  }

  const lines = txt.split("\n").map(l => l.trim()).filter(Boolean);
  const hdr = lines.find(l => l.startsWith("DATAFLOW"));
  if (!hdr) { console.error("  No header row — skipping"); continue; }

  const hdrs = hdr.split(",").map(h => h.replace(/"/g, "").toLowerCase());
  const iInd  = hdrs.indexOf("indicators");
  const iVal  = hdrs.indexOf("obs_value");
  const iPer  = hdrs.indexOf("time_period");
  const iProd = hdrs.indexOf("product");

  for (const line of lines.filter(l => !l.startsWith("DATAFLOW"))) {
    const c = line.split(",").map(x => x.replace(/"/g, "").trim());
    if (c[iInd] !== "QUANTITY_IN_100KG") continue;
    const ym  = c[iPer];
    const cn  = c[iProd].replace(/\s/g, "");
    const val = parseFloat(c[iVal]);
    if (!MONTHS.includes(ym) || !cn || isNaN(val) || val <= 0) continue;

    const tonnes = val / 10;
    if (!data[cn]) data[cn] = { sector };
    data[cn][ym] = (data[cn][ym] ?? 0) + tonnes;
  }
}

// Build CSV
const rows = [["CN code", "Sector", "Jan 2026 (t)", "Feb 2026 (t)", "Mar 2026 (t)"]];
for (const [cn, row] of Object.entries(data).sort()) {
  rows.push([
    cn,
    row.sector,
    (row["2026-01"] ?? 0).toFixed(3),
    (row["2026-02"] ?? 0).toFixed(3),
    (row["2026-03"] ?? 0).toFixed(3),
  ]);
}

const csv = rows.map(r => r.join(",")).join("\n");
const out = join(__dir, "../docs/comext_jan_mar_2026.csv");
writeFileSync(out, csv, "utf8");
console.error(`\nWrote ${rows.length - 1} CN codes → ${out}`);
console.log(csv);
