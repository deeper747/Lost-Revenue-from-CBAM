/**
 * Mixed dataset adapter.
 *
 * Trade data source:
 *   - Eurostat Comext (EU27 imports from US) for Iron & Steel, Aluminum, Cement, Fertilizers
 *   - US Census Bureau International Trade (US exports to EU27) for Hydrogen
 *
 * Hydrogen is swapped to Census because the US side is more authoritative for a sector
 * where Comext import records are sparse, and because the Census HS10 data resolves the
 * HS6-level ambiguity that would otherwise conflate hydrogen with noble gases.
 *
 * Exports the standard dataset interface shared by all dataset adapters.
 */

import { RELEVANT, SECTORS_LIST } from "../data/cbamDefaultValues.js";
import { EUR_USD } from "../config/publicationConfig.js";
import { getBenchmark, CBAM_FACTOR } from "../data/cbamBenchmarks.js";
import {
  CBAM_IDX as _COMEXT_CBAM_IDX,
  TODAY_FRAC_IDX as _COMEXT_TODAY,
  YTD_YMS,
  avgMonthTonnes as comextAvg,
  getMonthTonnes as comextGetMonthTonnes,
  getQtrEts,
  liveCoverageThrough,
  liveMonthTonnes,
  trKey,
  ymMonth,
  ymQuarter,
  ytdMonthFraction,
} from "../lib/cbamCalculations.js";
import {
  getAvgMonthTonnes as censusAvg,
  getMonthTonnes as censusGetMonthTonnes,
} from "./censusDataset.js";

// ── Dataset identity ──────────────────────────────────────────────────────────
export const DATA_SOURCE = "Mixed";
export const DATA_SOURCE_DETAIL =
  "Eurostat Comext (Iron & Steel, Aluminum, Cement, Fertilizers) · US Census Bureau (Hydrogen)";

// ── Hydrogen routing ──────────────────────────────────────────────────────────
const HYDROGEN_CNS = new Set(
  RELEVANT.filter(d => d.sector === "Hydrogen").map(d => trKey(d.cn))
);
const _isHydrogen = cn => HYDROGEN_CNS.has(trKey(cn));

// ── Tonnage helpers ───────────────────────────────────────────────────────────

export function getAvgMonthTonnes(cn, mo) {
  return _isHydrogen(cn) ? censusAvg(cn, mo) : comextAvg(cn, mo);
}

export function getMonthTonnes(cn, ym) {
  return _isHydrogen(cn) ? censusGetMonthTonnes(cn, ym) : comextGetMonthTonnes(cn, ym);
}

// ── Chart data ────────────────────────────────────────────────────────────────
// Starts at 2024-01 so CBAM_IDX = 24 (2 years × 12 months prefix).
// 2024-2025: pre-CBAM hypothetical — actual monthly tonnes × mv2026.
// 2026-2035: CBAM period — avg × max(0, mv − benchmark × CBAM_factor).

export const CHART_DATA = [];
for (let y = 2024; y <= 2035; y++) {
  const cf = CBAM_FACTOR[y] ?? 0;
  for (let m = 1; m <= 12; m++) {
    const mo = String(m).padStart(2, "0");
    const ym = `${y}-${mo}`;
    let factor = 0;
    if (y <= 2025) {
      for (const d of RELEVANT) {
        factor += getMonthTonnes(d.cn, ym) * (d.mv2026 || 0);
      }
    } else {
      for (const d of RELEVANT) {
        const mv = y >= 2028 ? (d.mv2028 || 0) : y === 2027 ? (d.mv2027 || 0) : (d.mv2026 || 0);
        const bmg = getBenchmark(d.cn, d.route) ?? 0;
        factor += getAvgMonthTonnes(d.cn, mo) * Math.max(0, mv - bmg * cf);
      }
    }
    CHART_DATA.push({ ym, factor, isProjected: y >= 2026 });
  }
}

export const CBAM_IDX = 24;
export const TODAY_FRAC_IDX = CBAM_IDX + (_COMEXT_TODAY - _COMEXT_CBAM_IDX);

// ── Sector benchmarks (weighted by mixed avg monthly tonnes) ──────────────────
export const SECTOR_BENCHMARKS = {};
for (const sec of SECTORS_LIST) {
  const rows = RELEVANT.filter(d => d.sector === sec);
  let wtBmg = 0, wtW = 0;
  for (let m = 1; m <= 12; m++) {
    const mo = String(m).padStart(2, "0");
    for (const d of rows) {
      const t = getAvgMonthTonnes(d.cn, mo);
      const bmg = getBenchmark(d.cn, d.route) ?? 0;
      wtBmg += t * bmg;
      wtW += t;
    }
  }
  SECTOR_BENCHMARKS[sec] = wtW > 0 ? wtBmg / wtW : 0;
}

// ── Aggregate functions ───────────────────────────────────────────────────────

export function getSectorYearTonnes(sec, yr, liveEntries = null) {
  const rows = RELEVANT.filter(d => d.sector === sec);
  const cov = liveCoverageThrough(liveEntries);
  let tonnes = 0;
  for (const d of rows) {
    for (let m = 1; m <= 12; m++) {
      const mo = String(m).padStart(2, "0");
      const ym = `${yr}-${mo}`;
      if (yr >= 2026) {
        // liveEntries carries Comext confirmed data; hydrogen falls back to Census avg
        const liveT = liveMonthTonnes(liveEntries, trKey(d.cn), ym, cov);
        tonnes += liveT != null ? liveT : getAvgMonthTonnes(d.cn, mo);
      } else {
        tonnes += getMonthTonnes(d.cn, ym);
      }
    }
  }
  return tonnes;
}

export function getYtdTonnesForRows(rows, liveEntries = null) {
  const cov = liveCoverageThrough(liveEntries);
  let total = 0;
  for (const d of rows) {
    const k = trKey(d.cn);
    for (const ym of YTD_YMS) {
      const liveT = liveMonthTonnes(liveEntries, k, ym, cov);
      total += (liveT != null ? liveT : getAvgMonthTonnes(d.cn, ymMonth(ym))) * ytdMonthFraction(ym);
    }
  }
  return total;
}

export function getSectorYearCost(sec, yr, forecastEts, liveEntries = null, qtrOverrides = null) {
  const rows = RELEVANT.filter(d => d.sector === sec);
  const cf = CBAM_FACTOR[yr] ?? 0;
  const cov = liveCoverageThrough(liveEntries);
  let cost = 0;
  for (const d of rows) {
    const mv = yr >= 2028 ? (d.mv2028 || 0) : yr === 2027 ? (d.mv2027 || 0) : (d.mv2026 || 0);
    const bmg = getBenchmark(d.cn, d.route) ?? 0;
    const netMv = Math.max(0, mv - bmg * cf);
    for (let m = 1; m <= 12; m++) {
      const mo = String(m).padStart(2, "0");
      const ym = `${yr}-${mo}`;
      let tonnes;
      if (yr >= 2026) {
        const liveT = liveMonthTonnes(liveEntries, trKey(d.cn), ym, cov);
        tonnes = liveT != null ? liveT : getAvgMonthTonnes(d.cn, mo);
      } else {
        tonnes = getMonthTonnes(d.cn, ym);
      }
      const qKey = `${yr}-Q${Math.ceil(parseInt(mo) / 3)}`;
      const price = qtrOverrides?.[qKey] ?? getQtrEts(ym, forecastEts);
      cost += tonnes * netMv * price;
    }
  }
  return cost * EUR_USD;
}

export function getYtdCostFactorsForRows(rows, liveEntries = null) {
  const cf2026 = CBAM_FACTOR[2026];
  const cov = liveCoverageThrough(liveEntries);
  const cfByQtr = {};
  for (const d of rows) {
    const mv = d.mv2026 || 0;
    const bmg = getBenchmark(d.cn, d.route) ?? 0;
    const netMv = Math.max(0, mv - bmg * cf2026);
    const k = trKey(d.cn);
    for (const ym of YTD_YMS) {
      const liveT = liveMonthTonnes(liveEntries, k, ym, cov);
      const tonnes = (liveT != null ? liveT : getAvgMonthTonnes(d.cn, ymMonth(ym))) * ytdMonthFraction(ym);
      const qKey = ymQuarter(ym);
      cfByQtr[qKey] = (cfByQtr[qKey] || 0) + tonnes * netMv;
    }
  }
  return { cfByQtr };
}
