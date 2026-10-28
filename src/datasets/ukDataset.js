/**
 * UK CBAM dataset.
 *
 * Trade: HMRC Overseas Trade Statistics (UK imports from the U.S.), by CN8 and month.
 * Default values: HMRC UK CBAM default values (one per CN8, mark-up already included).
 * Rate: UK ETS price × [1 − free allocation % × phase-out factor], per sector and quarter.
 *
 * Every cost here is in US dollars, like the EU dataset, so the two can be added.
 * UK CBAM charges nothing on goods imported before 1 January 2027, so every month before
 * UK_CBAM_START_YM contributes zero cost (trade volume is still reported).
 */
import { SECTORS_LIST } from "../data/cbamDefaultValues.js";
import { BASELINE_YEARS } from "../config/publicationConfig.js";
import { UK_DEFAULT_VALUE_ROWS } from "../data/ukCbamDefaultValues.js";
import { UK_TRADE, UK_TRADE_LATEST_YM } from "../data/ukTradeData.js";
import {
  GBP_USD,
  UK_CBAM_START_YEAR,
  UK_CBAM_START_YM,
  UK_FREE_ALLOCATION_PCT,
  UK_MARKUP_PCT,
  UK_PHASEOUT_FACTOR,
} from "../data/ukCbamParams.js";
import { YTD_YMS, ymQuarter, ytdMonthFraction } from "../lib/cbamCalculations.js";

export const DATA_SOURCE = "HMRC";
export { UK_TRADE_LATEST_YM, UK_CBAM_START_YM, UK_CBAM_START_YEAR, GBP_USD };

export const UK_ROWS = UK_DEFAULT_VALUE_ROWS.map(([cn, desc, sector, dv]) => ({ cn, desc, sector, dv }));
const ROWS_BY_SECTOR = Object.fromEntries(SECTORS_LIST.map(s => [s, UK_ROWS.filter(r => r.sector === s)]));
export const ukRowsForSector = sec => ROWS_BY_SECTOR[sec] || [];

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

// ── Trade ─────────────────────────────────────────────────────────────────────

/** 2022–25 average tonnes for a calendar month ("03"). */
export function ukAvgMonthTonnes(cn, mo) {
  const td = UK_TRADE[cn];
  if (!td) return 0;
  return BASELINE_YEARS.reduce((s, y) => s + (td[`${y}-${mo}`]?.[0] ?? 0), 0) / BASELINE_YEARS.length;
}

/**
 * Tonnes for a specific month. Released months (up to the latest month in the HMRC pull)
 * use reported trade, and a code with no entry genuinely had none. Later months fall back
 * to the 2022–25 average.
 */
export function ukMonthTonnes(cn, ym) {
  if (ym <= UK_TRADE_LATEST_YM) return UK_TRADE[cn]?.[ym]?.[0] ?? 0;
  return ukAvgMonthTonnes(cn, ym.slice(5));
}

const isReleased = ym => ym <= UK_TRADE_LATEST_YM;

// Embodied emissions per sector and calendar month at the 2022–25 average volume (tCO2e),
// and the tonnes behind them. Precomputed because every chart month reuses them.
const AVG_EMB = {};
const AVG_T = {};
for (const sec of SECTORS_LIST) {
  AVG_EMB[sec] = {};
  AVG_T[sec] = {};
  for (const mo of MONTHS) {
    let e = 0, t = 0;
    for (const r of ROWS_BY_SECTOR[sec]) {
      const x = ukAvgMonthTonnes(r.cn, mo);
      t += x;
      e += x * r.dv;
    }
    AVG_EMB[sec][mo] = e;
    AVG_T[sec][mo] = t;
  }
}

function sectorMonthEmb(sec, ym, useActual) {
  if (!useActual || !isReleased(ym)) return AVG_EMB[sec][ym.slice(5)];
  let e = 0;
  for (const r of ROWS_BY_SECTOR[sec]) e += (UK_TRADE[r.cn]?.[ym]?.[0] ?? 0) * r.dv;
  return e;
}

function sectorMonthTonnes(sec, ym, useActual) {
  if (!useActual || !isReleased(ym)) return AVG_T[sec][ym.slice(5)];
  let t = 0;
  for (const r of ROWS_BY_SECTOR[sec]) t += UK_TRADE[r.cn]?.[ym]?.[0] ?? 0;
  return t;
}

/** Trade-weighted average default value per sector (incl. mark-up), on 2022–25 volumes. */
export const UK_SECTOR_WDV = Object.fromEntries(SECTORS_LIST.map(sec => {
  let e = 0, t = 0;
  for (const mo of MONTHS) { e += AVG_EMB[sec][mo]; t += AVG_T[sec][mo]; }
  return [sec, t > 0 ? e / t : 0];
}));

export const UK_SECTOR_ANN_TONNES = Object.fromEntries(SECTORS_LIST.map(sec =>
  [sec, MONTHS.reduce((s, mo) => s + AVG_T[sec][mo], 0)]));

// ── Rate ──────────────────────────────────────────────────────────────────────

export const ukPhaseout = yr => UK_PHASEOUT_FACTOR[yr] ?? (yr > 2035 ? 0 : null);

/**
 * £/tCO2e for a sector in a month. An official HMRC rate for that quarter (from the
 * runtime config) wins; otherwise the formula at the user's UK ETS price. Zero before
 * the UK CBAM starts.
 */
export function ukRate(sec, ym, ukPrice, confirmedRates = null) {
  if (ym < UK_CBAM_START_YM) return 0;
  const official = confirmedRates?.[ymQuarter(ym)]?.[sec];
  if (official != null) return official;
  const rf = ukPhaseout(parseInt(ym.slice(0, 4), 10)) ?? 0;
  return ukPrice * (1 - UK_FREE_ALLOCATION_PCT[sec] * rf);
}

export const ukMarkupPct = sec => UK_MARKUP_PCT[sec];
export const ukFreeAllocationPct = sec => UK_FREE_ALLOCATION_PCT[sec];

// ── Aggregates (US dollars) ───────────────────────────────────────────────────

/** Sector cost for one month. `useActual` swaps in reported HMRC trade where released. */
export function ukSectorMonthCost(sec, ym, ukPrice, confirmedRates, useActual = false) {
  if (ym < UK_CBAM_START_YM) return 0;
  return sectorMonthEmb(sec, ym, useActual) * ukRate(sec, ym, ukPrice, confirmedRates) * GBP_USD;
}

export function ukMonthCost(ym, ukPrice, confirmedRates, useActual = false) {
  let c = 0;
  for (const sec of SECTORS_LIST) c += ukSectorMonthCost(sec, ym, ukPrice, confirmedRates, useActual);
  return c;
}

/** Year cost on the 2022–25 average volume (the baseline basis used for headline ranges). */
export function getUkSectorYearCost(sec, yr, ukPrice, confirmedRates = null) {
  let c = 0;
  for (const mo of MONTHS) c += ukSectorMonthCost(sec, `${yr}-${mo}`, ukPrice, confirmedRates, false);
  return c;
}

/** Year tonnes: reported trade for years before the baseline ends, average after. */
export function getUkSectorYearTonnes(sec, yr) {
  let t = 0;
  for (const mo of MONTHS) {
    const ym = `${yr}-${mo}`;
    t += yr <= Number(BASELINE_YEARS.at(-1)) ? sectorMonthTonnes(sec, ym, true) : AVG_T[sec][mo];
  }
  return t;
}

/** Tonnes over an explicit list of months, reported where released. */
export function getUkSectorTonnesForYms(sec, yms) {
  return yms.reduce((s, ym) => s + sectorMonthTonnes(sec, ym, true), 0);
}

/** Cumulative-window (YTD) tonnes, reported where released, prorating the current month. */
export function getUkYtdTonnes(sec) {
  let t = 0;
  for (const ym of YTD_YMS) t += sectorMonthTonnes(sec, ym, true) * ytdMonthFraction(ym);
  return t;
}

/** Cumulative-window (YTD) cost by quarter, so callers can split it by calendar year. */
export function getUkYtdCostByQtr(sec, ukPrice, confirmedRates = null) {
  const byQ = {};
  for (const ym of YTD_YMS) {
    const c = ukSectorMonthCost(sec, ym, ukPrice, confirmedRates, true) * ytdMonthFraction(ym);
    const q = ymQuarter(ym);
    byQ[q] = (byQ[q] || 0) + c;
  }
  return byQ;
}

export function getUkYtdCost(sec, ukPrice, confirmedRates = null) {
  return Object.values(getUkYtdCostByQtr(sec, ukPrice, confirmedRates)).reduce((s, v) => s + v, 0);
}

/** Per-CN detail for the sector modal. */
export function ukCnRows(sec, ukPrice, confirmedRates = null) {
  return ukRowsForSector(sec).map(r => {
    const annT = MONTHS.reduce((s, mo) => s + ukAvgMonthTonnes(r.cn, mo), 0);
    const yearCost = yr => MONTHS.reduce(
      (s, mo) => s + ukAvgMonthTonnes(r.cn, mo) * r.dv * ukRate(sec, `${yr}-${mo}`, ukPrice, confirmedRates), 0
    ) * GBP_USD;
    return { ...r, annT, c2027: yearCost(2027), c2028: yearCost(2028), c2030: yearCost(2030) };
  });
}
