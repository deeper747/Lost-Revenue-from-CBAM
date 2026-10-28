/**
 * Convert data/raw/us_eu27_trade_raw.csv → src/data/censusTrade.js
 *
 * Usage:  node scripts/build_census_trade.mjs
 *
 * The CSV is produced by fetch_us_trade_raw.py.  It contains annual
 * US export tonnage to EU27 by HS6 code for 2019–2025.
 *
 * This script:
 *  1. Reads only Export rows from the CSV.
 *  2. Maps each HS6 code to one or more TRADE keys using the same
 *     priority logic as useUSCensusData.js (6-digit prefix → hs6+"00"
 *     → exact 6-digit → 4-digit prefix).
 *  3. When one HS6 maps to multiple TRADE keys (e.g. 760410 →
 *     76041010 + 76041090), distributes tonnage proportionally by
 *     each key's cumulative Comext baseline weight.
 *  4. Writes src/data/censusTrade.js with annual metric tonnes keyed
 *     { tradeKey: { "2022": tonnes, "2023": tonnes, ... } }.
 *
 * V4App uses this file via useUSCensusData.js: it reads the annual
 * totals, divides by 12 for equal monthly distribution, and computes
 * the 2022–2025 average as the "2026" baseline.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, "..");

// ---------------------------------------------------------------------------
// Load TRADE (Comext baseline) — needed for proportional weight calculation
// ---------------------------------------------------------------------------
const { TRADE } = await import(resolve(ROOT, "src/data/tradeData.js"));
const TRADE_KEYS = Object.keys(TRADE);

// ---------------------------------------------------------------------------
// HS6 → TRADE-key mapping (mirrors useUSCensusData.js)
// ---------------------------------------------------------------------------
const _cache = {};
function findTradeKeys(hs6) {
  if (_cache[hs6]) return _cache[hs6];

  // 1. 8-digit TRADE keys whose first 6 chars match hs6
  const by6 = TRADE_KEYS.filter(k => k.length === 8 && k.startsWith(hs6));
  if (by6.length) return (_cache[hs6] = by6);

  // 2. hs6 + "00" → 8-digit exact
  if (TRADE[hs6 + "00"]) return (_cache[hs6] = [hs6 + "00"]);

  // 3. Exact 6-digit key
  if (TRADE[hs6]) return (_cache[hs6] = [hs6]);

  // 4. Roll up to 4-digit heading
  const hs4 = hs6.slice(0, 4);
  if (TRADE[hs4]) return (_cache[hs6] = [hs4]);

  return (_cache[hs6] = []);
}

function tradeWeights(keys) {
  if (keys.length === 1) return { [keys[0]]: 1 };
  const sums = {};
  let total = 0;
  for (const k of keys) {
    const td = TRADE[k];
    let s = 0;
    if (td) for (const v of Object.values(td)) s += v[0] || 0;
    sums[k] = s;
    total += s;
  }
  if (total === 0) {
    const eq = 1 / keys.length;
    return Object.fromEntries(keys.map(k => [k, eq]));
  }
  return Object.fromEntries(keys.map(k => [k, sums[k] / total]));
}

// ---------------------------------------------------------------------------
// Read CSV
// ---------------------------------------------------------------------------
const csvPath = resolve(ROOT, "data/raw/us_eu27_trade_raw.csv");
const lines   = readFileSync(csvPath, "utf8").split("\n").filter(Boolean);
const headers = lines[0].split(",");

const iFlow = headers.indexOf("flow");
const iPeriod = headers.indexOf("period");
const iHs6  = headers.indexOf("hs6");
const iKg   = headers.indexOf("quantity_kg");

if ([iFlow, iPeriod, iHs6, iKg].some(i => i < 0)) {
  throw new Error(`CSV column not found. Headers: ${headers.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Accumulate annual tonnes by TRADE key × year
// ---------------------------------------------------------------------------
const result = {}; // { tradeKey: { "2022": tonnes, ... } }
let skipped = 0;

for (const line of lines.slice(1)) {
  const cols = line.split(",");
  if (cols[iFlow] !== "Export") continue;

  const period = cols[iPeriod];  // "YYYY-MM" format
  const hs6    = cols[iHs6];
  const kg     = parseFloat(cols[iKg]) || 0;
  if (kg <= 0) continue;

  const keys = findTradeKeys(hs6);
  if (!keys.length) { skipped++; continue; }

  const weights = tradeWeights(keys);
  const tonnes  = kg / 1000; // kg → metric tonnes

  for (const [k, w] of Object.entries(weights)) {
    if (!result[k]) result[k] = {};
    result[k][period] = (result[k][period] ?? 0) + tonnes * w;
  }
}

// ---------------------------------------------------------------------------
// Write src/data/censusTrade.js
// ---------------------------------------------------------------------------
const outPath = resolve(ROOT, "src/data/censusTrade.js");
const body    = JSON.stringify(result, (_, v) =>
  typeof v === "number" ? Math.round(v * 1000) / 1000 : v, 2);

writeFileSync(outPath, [
  `// Auto-generated — do not edit directly.`,
  `// Source: data/raw/us_eu27_trade_raw.csv`,
  `// Run:    node scripts/build_census_trade.mjs`,
  `// Generated: ${new Date().toISOString().slice(0, 10)}`,
  `//`,
  `// Annual US exports to EU27 in metric tonnes, keyed by TRADE id.`,
  `// Each TRADE key maps to an object of { year: annualTonnes }.`,
  `export const CENSUS_EU27_EXPORTS = ${body};`,
  ``,
].join("\n"));

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const periods = [...new Set(Object.values(result).flatMap(Object.keys))].sort();
const uniqueYears = [...new Set(periods.map(p => p.slice(0, 4)))].sort();
console.log(`Wrote ${outPath}`);
console.log(`  TRADE keys mapped: ${Object.keys(result).length}`);
console.log(`  Years covered:     ${uniqueYears.join(", ")} (${periods.length} months)`);
console.log(`  HS6 rows skipped (no TRADE match): ${skipped}`);

// Quick sanity: hydrogen should be near zero, not 57k tonnes/month
const h2 = result["28041000"];
if (h2) {
  const entries = Object.entries(h2).filter(([ym]) => ["2022","2023","2024","2025"].includes(ym.slice(0, 4)));
  const avgMonthly = entries.length ? entries.reduce((s,[,v]) => s + v, 0) / entries.length : 0;
  console.log(`  Hydrogen avg monthly export to EU27: ${avgMonthly.toFixed(1)} t  (Comext anomaly was ~57k t/mo in 2025-08)`);
}
