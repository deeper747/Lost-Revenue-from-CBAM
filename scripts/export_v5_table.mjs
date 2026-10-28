/**
 * Export V5 calculator data as two CSVs.
 *
 * V5 uses a mixed dataset:
 *   - Eurostat Comext baseline for Iron & Steel, Aluminum, Cement, Fertilizers
 *   - US Census Bureau export baseline for Hydrogen
 *
 * Outputs:
 *   data/processed/v5_detailed.csv   — one row per CN code per year
 *   data/processed/v5_aggregate.csv  — one row per sector per year
 *
 * Usage: node scripts/export_v5_table.mjs
 *
 * ETS price: uses publicationConfig defaultForecastEts (slider default).
 * Years: 2026–2035 (no YTD, no pre-CBAM years).
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, "..");

// ── Import data modules (none of these import JSON, so Node ESM is happy) ─────
const { PUBLICATION_CONFIG } =
  await import(resolve(ROOT, "src/config/publicationConfig.js"));
const { RELEVANT, SECTORS_LIST } =
  await import(resolve(ROOT, "src/data/cbamDefaultValues.js"));
const { CBAM_FACTOR, getBenchmark } =
  await import(resolve(ROOT, "src/data/cbamBenchmarks.js"));
const { TRADE } =
  await import(resolve(ROOT, "src/data/tradeData.js"));
const { CENSUS_EU27_EXPORTS } =
  await import(resolve(ROOT, "src/data/censusTrade.js"));

const {
  baselineYears: BASELINE_YEARS,
  eurUsd: EUR_USD,
  defaultForecastEts: ETS,
} = PUBLICATION_CONFIG;

// ── Helpers ───────────────────────────────────────────────────────────────────

const trKey = cn => cn.replace(/\s/g, "");

// Hydrogen CN codes (route to Census instead of Comext)
const HYDROGEN_CNS = new Set(
  RELEVANT.filter(d => d.sector === "Hydrogen").map(d => trKey(d.cn))
);
const isHydrogen = cn => HYDROGEN_CNS.has(trKey(cn));

/** Comext 2022–25 monthly avg (metric tonnes). */
function comextAvg(cn, mo) {
  const byYm = TRADE[trKey(cn)];
  if (!byYm) return 0;
  const sum = BASELINE_YEARS.reduce((s, yr) => s + (byYm[`${yr}-${mo}`]?.[0] ?? 0), 0);
  return sum / BASELINE_YEARS.length;
}

/** Census Bureau 2022–25 monthly avg (metric tonnes); falls back to Comext when no Census record. */
function censusAvg(cn, mo) {
  const byYm = CENSUS_EU27_EXPORTS[trKey(cn)];
  if (!byYm) return comextAvg(cn, mo);
  const sum = BASELINE_YEARS.reduce((s, yr) => s + (byYm[`${yr}-${mo}`] ?? 0), 0);
  return sum / BASELINE_YEARS.length;
}

/** Mixed: Census for Hydrogen, Comext for everything else. */
function getAvgMonthTonnes(cn, mo) {
  return isHydrogen(cn) ? censusAvg(cn, mo) : comextAvg(cn, mo);
}

/** Annual baseline tonnes = sum of 12 monthly averages. */
function annualTonnes(cn) {
  let t = 0;
  for (let m = 1; m <= 12; m++) t += getAvgMonthTonnes(cn, String(m).padStart(2, "0"));
  return t;
}

/** Mark-up % applied to DV for a given sector/year. */
function markupPct(sector, yr) {
  if (sector === "Fertilizers") return 1;
  if (yr <= 2026) return 10;
  if (yr === 2027) return 20;
  return 30;
}

/** mv = DV × (1 + markup), already baked into mv2026/mv2027/mv2028. */
function mvForYear(d, yr) {
  if (yr <= 2026) return d.mv2026 || 0;
  if (yr === 2027) return d.mv2027 || 0;
  return d.mv2028 || 0;
}

// ── Build rows ────────────────────────────────────────────────────────────────

const YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];

const detailedRows = [];
const aggregateRows = [];

for (const yr of YEARS) {
  const cf     = CBAM_FACTOR[yr] ?? 0;
  const cfPct  = parseFloat((cf * 100).toFixed(1));

  for (const sec of SECTORS_LIST) {
    const cnRows = RELEVANT.filter(d => d.sector === sec);
    const mup    = markupPct(sec, yr);

    let secTonnes = 0, secExposure = 0, wtDv = 0, wtBmg = 0, wtW = 0;

    for (const d of cnRows) {
      const annT    = annualTonnes(d.cn);
      const dv      = d.total    || 0;
      const mv      = mvForYear(d, yr);
      const bmg     = getBenchmark(d.cn, d.route) ?? 0;
      const netMv   = Math.max(0, mv - bmg * cf);
      const exposure = annT * netMv * ETS * EUR_USD;

      detailedRows.push({
        year: yr, sector: sec,
        cn: d.cn, desc: d.desc,
        annT, dv, mup, bmg, cfPct, exposure,
      });

      secTonnes  += annT;
      secExposure += exposure;
      wtDv  += annT * dv;
      wtBmg += annT * bmg;
      wtW   += annT;
    }

    aggregateRows.push({
      year: yr, sector: sec,
      annT: secTonnes,
      wtdDv:  wtW > 0 ? wtDv  / wtW : 0,
      mup,
      wtdBmg: wtW > 0 ? wtBmg / wtW : 0,
      cfPct,
      exposure: secExposure,
    });
  }
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

const esc = v => {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
};

const fmt = (n, d = 2) => n != null ? n.toFixed(d) : "";

// ── Write ─────────────────────────────────────────────────────────────────────

const OUTDIR = resolve(ROOT, "data/processed");
mkdirSync(OUTDIR, { recursive: true });

// Detailed CSV
const detHeader = [
  "Year", "Sector", "CN Code", "Description",
  "Annual Trade Volume (t)", "Default Value (tCO2e/t)", "Mark-up (%)",
  "Benchmark (tCO2e/t)", "CBAM Factor (%)", "Projected CBAM Exposure (USD)",
].join(",");

const detLines = detailedRows.map(r => [
  r.year, esc(r.sector), esc(r.cn), esc(r.desc),
  r.annT, fmt(r.dv, 3), r.mup,
  r.bmg > 0 ? fmt(r.bmg, 3) : "",
  fmt(r.cfPct, 1), fmt(r.exposure, 2),
].join(","));

const detPath = resolve(OUTDIR, "v5_detailed.csv");
writeFileSync(detPath, [detHeader, ...detLines].join("\n"));

// Aggregate CSV
const aggHeader = [
  "Year", "Sector",
  "Annual Trade Volume (t)", "Wtd. Default Value (tCO2e/t)", "Mark-up (%)",
  "Wtd. Benchmark (tCO2e/t)", "CBAM Factor (%)", "Projected CBAM Exposure (USD)",
].join(",");

const aggLines = aggregateRows.map(r => [
  r.year, esc(r.sector),
  r.annT, fmt(r.wtdDv, 3), r.mup,
  fmt(r.wtdBmg, 3), fmt(r.cfPct, 1), fmt(r.exposure, 2),
].join(","));

const aggPath = resolve(OUTDIR, "v5_aggregate.csv");
writeFileSync(aggPath, [aggHeader, ...aggLines].join("\n"));

console.log(`Wrote ${detailedRows.length} rows → ${detPath}`);
console.log(`Wrote ${aggregateRows.length} rows → ${aggPath}`);
console.log(`ETS: €${ETS}/tCO₂e · EUR/USD: ${EUR_USD} · Baseline: ${BASELINE_YEARS.join(", ")}`);
