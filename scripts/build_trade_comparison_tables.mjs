/**
 * Build personal verification tables comparing US Census and EU Comext tonnes.
 *
 * Inputs:
 *   src/data/censusTrade.js  - US Census exports to EU27, keyed by calculator trade id
 *   src/data/tradeData.js    - EU Comext imports from US, keyed by calculator trade id
 *
 * Outputs:
 *   data/processed/trade_comparison_cn_by_month.csv
 *   data/processed/trade_comparison_sector_by_month.csv
 *   data/processed/trade_comparison_sector_by_year.csv
 *   data/processed/cbam_cost_comparison_sector_by_year.csv
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { CENSUS_EU27_EXPORTS } from "../src/data/censusTrade.js";
import { TRADE } from "../src/data/tradeData.js";
import ETS_PRICES from "../src/data/ets_prices.json" with { type: "json" };
import { getBenchmark, CBAM_FACTOR } from "../src/data/cbamBenchmarks.js";
import { CN_MAP, RELEVANT, SECTORS_LIST } from "../src/data/cbamDefaultValues.js";
import { BASELINE_YEARS, DEFAULT_FORECAST_ETS, EUR_USD } from "../src/config/publicationConfig.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const OUT_DIR = resolve(ROOT, "data/processed");

function trKey(cn) {
  const key = cn.replace(/\s/g, "");
  return CN_MAP[key] || CN_MAP[`${key}00`] || key;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return "";
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function csvCell(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(path, columns, rows) {
  const lines = [
    columns.join(","),
    ...rows.map(row => columns.map(col => csvCell(row[col])).join(",")),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
}

function monthSetFromSeries(series) {
  return new Set(Object.values(series).flatMap(months => Object.keys(months)));
}

function codeMetaRows() {
  const meta = new Map();

  for (const row of RELEVANT) {
    const key = trKey(row.cn);
    if (!meta.has(key)) {
      meta.set(key, {
        cn_code: key,
        sector: row.sector,
        descriptions: new Set(),
        regulation_codes: new Set(),
      });
    }

    const item = meta.get(key);
    item.descriptions.add(row.desc);
    item.regulation_codes.add(row.cn.replace(/\s/g, ""));
  }

  const allCodes = new Set([
    ...Object.keys(TRADE),
    ...Object.keys(CENSUS_EU27_EXPORTS),
    ...meta.keys(),
  ]);

  for (const code of allCodes) {
    if (!meta.has(code)) {
      meta.set(code, {
        cn_code: code,
        sector: "Unknown",
        descriptions: new Set(),
        regulation_codes: new Set([code]),
      });
    }
  }

  return [...meta.values()]
    .map(item => ({
      cn_code: item.cn_code,
      sector: item.sector,
      description: [...item.descriptions].sort().join(" / "),
      regulation_codes: [...item.regulation_codes].sort().join(";"),
    }))
    .sort((a, b) => {
      const sectorA = SECTORS_LIST.indexOf(a.sector);
      const sectorB = SECTORS_LIST.indexOf(b.sector);
      const normalizedA = sectorA === -1 ? Number.MAX_SAFE_INTEGER : sectorA;
      const normalizedB = sectorB === -1 ? Number.MAX_SAFE_INTEGER : sectorB;
      return normalizedA - normalizedB || a.cn_code.localeCompare(b.cn_code);
    });
}

function tonnesFor(source, code, month) {
  const value = source[code]?.[month];
  if (Array.isArray(value)) return value[0] || 0;
  return value || 0;
}

function avgMonthTonnesFor(source, code, monthNumber) {
  return BASELINE_YEARS.reduce((sum, year) => sum + tonnesFor(source, code, `${year}-${monthNumber}`), 0) / BASELINE_YEARS.length;
}

function etsForMonth(ym) {
  const [year, month] = ym.split("-");
  const quarter = Math.ceil(Number(month) / 3);
  return ETS_PRICES.quarterly[`${year}-Q${quarter}`] ?? DEFAULT_FORECAST_ETS;
}

function cbamCostFields(us, eu) {
  return {
    us_census_cbam_usd: round(us, 2),
    eu_comext_cbam_usd: round(eu, 2),
    difference_usd: round(us - eu, 2),
    us_to_eu_ratio: eu > 0 ? round(us / eu, 6) : "",
  };
}

function sectorYearCbamCost(source, sector, year) {
  const rows = RELEVANT.filter(row => row.sector === sector);
  const cbamFactor = CBAM_FACTOR[year] ?? 0;
  let cost = 0;

  for (const row of rows) {
    const code = trKey(row.cn);
    const mv = year >= 2028 ? (row.mv2028 || 0) : year === 2027 ? (row.mv2027 || 0) : (row.mv2026 || 0);
    const benchmark = getBenchmark(row.cn, row.route) ?? 0;
    const netMv = Math.max(0, mv - benchmark * cbamFactor);

    for (let month = 1; month <= 12; month += 1) {
      const monthNumber = String(month).padStart(2, "0");
      const ym = `${year}-${monthNumber}`;
      cost += avgMonthTonnesFor(source, code, monthNumber) * netMv * etsForMonth(ym);
    }
  }

  return cost * EUR_USD;
}

function comparisonFields(us, eu) {
  return {
    us_census_tonnes: round(us),
    eu_comext_tonnes: round(eu),
    difference_tonnes: round(us - eu),
    us_to_eu_ratio: eu > 0 ? round(us / eu, 6) : "",
  };
}

const usMonths = monthSetFromSeries(CENSUS_EU27_EXPORTS);
const euMonths = monthSetFromSeries(TRADE);
const months = [...euMonths].filter(month => usMonths.has(month)).sort();
const years = [...new Set(months.map(month => month.slice(0, 4)))].sort();
const codes = codeMetaRows();

const cnByMonth = [];
for (const month of months) {
  for (const code of codes) {
    const us = tonnesFor(CENSUS_EU27_EXPORTS, code.cn_code, month);
    const eu = tonnesFor(TRADE, code.cn_code, month);
    cnByMonth.push({
      month,
      sector: code.sector,
      cn_code: code.cn_code,
      regulation_codes: code.regulation_codes,
      description: code.description,
      ...comparisonFields(us, eu),
    });
  }
}

const sectorCodes = new Map();
for (const code of codes) {
  if (!sectorCodes.has(code.sector)) sectorCodes.set(code.sector, []);
  sectorCodes.get(code.sector).push(code.cn_code);
}

const sectors = [...sectorCodes.keys()].sort((a, b) => {
  const sectorA = SECTORS_LIST.indexOf(a);
  const sectorB = SECTORS_LIST.indexOf(b);
  const normalizedA = sectorA === -1 ? Number.MAX_SAFE_INTEGER : sectorA;
  const normalizedB = sectorB === -1 ? Number.MAX_SAFE_INTEGER : sectorB;
  return normalizedA - normalizedB || a.localeCompare(b);
});

const sectorByMonth = [];
for (const month of months) {
  for (const sector of sectors) {
    const codesForSector = sectorCodes.get(sector);
    const us = codesForSector.reduce((sum, code) => sum + tonnesFor(CENSUS_EU27_EXPORTS, code, month), 0);
    const eu = codesForSector.reduce((sum, code) => sum + tonnesFor(TRADE, code, month), 0);
    sectorByMonth.push({
      month,
      sector,
      cn_code_count: codesForSector.length,
      ...comparisonFields(us, eu),
    });
  }
}

const sectorByYear = [];
for (const year of years) {
  const monthsForYear = months.filter(month => month.startsWith(`${year}-`));
  for (const sector of sectors) {
    const codesForSector = sectorCodes.get(sector);
    let us = 0;
    let eu = 0;

    for (const month of monthsForYear) {
      us += codesForSector.reduce((sum, code) => sum + tonnesFor(CENSUS_EU27_EXPORTS, code, month), 0);
      eu += codesForSector.reduce((sum, code) => sum + tonnesFor(TRADE, code, month), 0);
    }

    sectorByYear.push({
      year,
      sector,
      months_in_comparison: monthsForYear.length,
      cn_code_count: codesForSector.length,
      ...comparisonFields(us, eu),
    });
  }
}

const cbamCostYears = Object.keys(CBAM_FACTOR)
  .map(Number)
  .filter(year => year >= 2026 && year <= 2035)
  .sort((a, b) => a - b);

const cbamCostBySectorYear = [];
for (const year of cbamCostYears) {
  for (const sector of SECTORS_LIST) {
    const us = sectorYearCbamCost(CENSUS_EU27_EXPORTS, sector, year);
    const eu = sectorYearCbamCost(TRADE, sector, year);
    cbamCostBySectorYear.push({
      year,
      sector,
      baseline_years: BASELINE_YEARS.join(";"),
      regulation_row_count: RELEVANT.filter(row => row.sector === sector).length,
      ...cbamCostFields(us, eu),
    });
  }
}

mkdirSync(OUT_DIR, { recursive: true });

writeCsv(
  resolve(OUT_DIR, "trade_comparison_cn_by_month.csv"),
  [
    "month",
    "sector",
    "cn_code",
    "regulation_codes",
    "description",
    "us_census_tonnes",
    "eu_comext_tonnes",
    "difference_tonnes",
    "us_to_eu_ratio",
  ],
  cnByMonth,
);

writeCsv(
  resolve(OUT_DIR, "trade_comparison_sector_by_month.csv"),
  [
    "month",
    "sector",
    "cn_code_count",
    "us_census_tonnes",
    "eu_comext_tonnes",
    "difference_tonnes",
    "us_to_eu_ratio",
  ],
  sectorByMonth,
);

writeCsv(
  resolve(OUT_DIR, "trade_comparison_sector_by_year.csv"),
  [
    "year",
    "sector",
    "months_in_comparison",
    "cn_code_count",
    "us_census_tonnes",
    "eu_comext_tonnes",
    "difference_tonnes",
    "us_to_eu_ratio",
  ],
  sectorByYear,
);

writeCsv(
  resolve(OUT_DIR, "cbam_cost_comparison_sector_by_year.csv"),
  [
    "year",
    "sector",
    "baseline_years",
    "regulation_row_count",
    "us_census_cbam_usd",
    "eu_comext_cbam_usd",
    "difference_usd",
    "us_to_eu_ratio",
  ],
  cbamCostBySectorYear,
);

console.log(`Wrote ${cnByMonth.length} CN-by-month rows`);
console.log(`Wrote ${sectorByMonth.length} sector-by-month rows`);
console.log(`Wrote ${sectorByYear.length} sector-by-year rows`);
console.log(`Wrote ${cbamCostBySectorYear.length} sector-by-year CBAM cost rows`);
console.log(`Comparison months: ${months[0]} through ${months.at(-1)} (${months.length} months)`);
