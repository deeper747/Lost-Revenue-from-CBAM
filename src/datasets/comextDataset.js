/**
 * Comext (Eurostat) dataset adapter.
 *
 * Trade data source: Eurostat Comext — EU27 imports from the US, monthly CN-level
 *   Bundled in: src/data/tradeData.js
 *
 * Exports the standard dataset interface shared by all dataset adapters.
 * To build a new dataset (V5, V6, …) copy this file, swap the data source,
 * and the rest of the app will automatically use it.
 */

import { RELEVANT, SECTORS_LIST } from "../data/cbamDefaultValues.js";
import { EUR_USD } from "../config/publicationConfig.js";
import { getBenchmark, CBAM_FACTOR } from "../data/cbamBenchmarks.js";
import {
  CBAM_IDX as _COMEXT_CBAM_IDX,
  TODAY_FRAC_IDX as _COMEXT_TODAY,
  YTD_YMS,
  avgMonthTonnes,
  getMonthTonnes as _getMonthTonnes,
  getQtrEts,
  liveCoverageThrough,
  liveMonthTonnes,
  trKey,
  ymMonth,
  ymQuarter,
  ytdMonthFraction,
} from "../lib/cbamCalculations.js";

// ── Dataset identity ──────────────────────────────────────────────────────────
export const DATA_SOURCE = "Comext";
export const DATA_SOURCE_DETAIL = "Eurostat Comext — EU27 imports from US, 2022–25 monthly avg";

// ── Tonnage helpers ───────────────────────────────────────────────────────────

/** Baseline avg tonnes for a calendar month (e.g. "03") across BASELINE_YEARS. */
export const getAvgMonthTonnes = avgMonthTonnes;

/**
 * Actual monthly tonnes for a specific year-month from Comext.
 * Returns 0 when not in TRADE (Comext has no entry for that month).
 */
export const getMonthTonnes = _getMonthTonnes;

// ── Chart data ────────────────────────────────────────────────────────────────
// Starts at 2024-01 so CBAM_IDX = 24 (2 years × 12 months prefix).
// 2024-2025: pre-CBAM hypothetical — actual Comext monthly tonnes × mv2026.
// 2026-2035: CBAM period — Comext avg × max(0, mv − benchmark × CBAM_factor).

export const CHART_DATA = [];
for (let y = 2024; y <= 2035; y++) {
  const cf = CBAM_FACTOR[y] ?? 0;
  for (let m = 1; m <= 12; m++) {
    const mo = String(m).padStart(2, "0");
    const ym = `${y}-${mo}`;
    let factor = 0;
    if (y <= 2025) {
      for (const d of RELEVANT) {
        factor += _getMonthTonnes(d.cn, ym) * (d.mv2026 || 0);
      }
    } else {
      for (const d of RELEVANT) {
        const mv = y >= 2028 ? (d.mv2028 || 0) : y === 2027 ? (d.mv2027 || 0) : (d.mv2026 || 0);
        const bmg = getBenchmark(d.cn, d.route) ?? 0;
        factor += avgMonthTonnes(d.cn, mo) * Math.max(0, mv - bmg * cf);
      }
    }
    CHART_DATA.push({ ym, factor, isProjected: y >= 2026 });
  }
}

export const CBAM_IDX = 24;
export const TODAY_FRAC_IDX = CBAM_IDX + (_COMEXT_TODAY - _COMEXT_CBAM_IDX);

// ── Sector benchmarks (weighted by Comext avg monthly tonnes) ─────────────────
export const SECTOR_BENCHMARKS = {};
for (const sec of SECTORS_LIST) {
  const rows = RELEVANT.filter(d => d.sector === sec);
  let wtBmg = 0, wtW = 0;
  for (let m = 1; m <= 12; m++) {
    const mo = String(m).padStart(2, "0");
    for (const d of rows) {
      const t = avgMonthTonnes(d.cn, mo);
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
        const liveT = liveMonthTonnes(liveEntries, trKey(d.cn), ym, cov);
        tonnes += liveT != null ? liveT : avgMonthTonnes(d.cn, mo);
      } else {
        tonnes += _getMonthTonnes(d.cn, ym);
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
      total += (liveT != null ? liveT : avgMonthTonnes(d.cn, ymMonth(ym))) * ytdMonthFraction(ym);
    }
  }
  return total;
}

export function getSectorYearCost(sec, yr, forecastEts, liveEntries = null) {
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
        tonnes = liveT != null ? liveT : avgMonthTonnes(d.cn, mo);
      } else {
        tonnes = _getMonthTonnes(d.cn, ym);
      }
      cost += tonnes * netMv * getQtrEts(ym, forecastEts);
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
      const tonnes = (liveT != null ? liveT : avgMonthTonnes(d.cn, ymMonth(ym))) * ytdMonthFraction(ym);
      const qKey = ymQuarter(ym);
      cfByQtr[qKey] = (cfByQtr[qKey] || 0) + tonnes * netMv;
    }
  }
  return { cfByQtr };
}
