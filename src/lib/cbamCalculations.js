import ETS_PRICES from "../data/ets_prices.json";
import { TRADE } from "../data/tradeData.js";
import { CN_MAP, RELEVANT, SECTORS_LIST } from "../data/cbamDefaultValues.js";
import {
  BASELINE_YEARS,
  DATA_CUTOFF_YM,
  DEFAULT_FORECAST_ETS,
  EUR_USD,
  MONTH_NAMES,
  REPORT_AS_OF,
  YTD_YEAR,
} from "../config/publicationConfig.js";

export const Q1_ETS = ETS_PRICES.quarterly["2026-Q1"] || DEFAULT_FORECAST_ETS;
export { MONTH_NAMES };

const REPORT_DATE = new Date(`${REPORT_AS_OF}T12:00:00Z`);
export const AS_OF_YEAR = REPORT_DATE.getUTCFullYear();
export const AS_OF_MONTH_INDEX = REPORT_DATE.getUTCMonth();
export const AS_OF_DAY = REPORT_DATE.getUTCDate();
export const CURRENT_YM = `${AS_OF_YEAR}-${String(AS_OF_MONTH_INDEX + 1).padStart(2, "0")}`;
const AS_OF_DAYS_IN_MONTH = new Date(Date.UTC(AS_OF_YEAR, AS_OF_MONTH_INDEX + 1, 0)).getUTCDate();

export const REPORT_AS_OF_LABEL = `${MONTH_NAMES[AS_OF_MONTH_INDEX]} ${AS_OF_DAY}, ${AS_OF_YEAR}`;

// YTD_YEAR is where CBAM starts and where the cumulative window opens; it does not move.
// The window runs from there to today, so once the calendar turns it spans years and its
// entries have to be full "YYYY-MM" keys rather than bare calendar months. Keying on a
// bare month silently folded January 2027 onto January 2026.
export const YTD_START_YEAR = Number(YTD_YEAR);
export const YTD_SPANS_YEARS = AS_OF_YEAR > YTD_START_YEAR;
export const YTD_PARTIAL_YM = CURRENT_YM;
export const YTD_PARTIAL_FRACTION = AS_OF_DAY / AS_OF_DAYS_IN_MONTH;

export const YTD_YMS = [];
for (let y = YTD_START_YEAR; y <= AS_OF_YEAR; y++) {
  const lastMonth = y === AS_OF_YEAR ? AS_OF_MONTH_INDEX + 1 : 12;
  for (let m = 1; m <= lastMonth; m++) YTD_YMS.push(`${y}-${String(m).padStart(2, "0")}`);
}

/** Calendar month ("03") of a "YYYY-MM", for the baseline-average lookups. */
export const ymMonth = ym => ym.slice(5);
/** Quarter key ("2027-Q1") of a "YYYY-MM". */
export const ymQuarter = ym => `${ym.slice(0, 4)}-Q${Math.ceil(parseInt(ym.slice(5), 10) / 3)}`;
/** "Jul", or "Jul 2026" once the window spans more than one year. */
export const ymLabel = ym =>
  `${MONTH_NAMES[parseInt(ym.slice(5), 10) - 1]}${YTD_SPANS_YEARS ? ` ${ym.slice(0, 4)}` : ""}`;

const _asOfMonth = MONTH_NAMES[AS_OF_MONTH_INDEX];
/** "Oct 5", or "Mar 30, 2027" once the window spans more than one year. */
export const YTD_END_LABEL = YTD_SPANS_YEARS
  ? `${_asOfMonth} ${AS_OF_DAY}, ${AS_OF_YEAR}`
  : `${_asOfMonth} ${AS_OF_DAY}`;
/** The partial month on its own: "Mar 1–30", or "Mar 1–30, 2027". */
export const YTD_PARTIAL_LABEL = YTD_SPANS_YEARS
  ? `${_asOfMonth} 1–${AS_OF_DAY}, ${AS_OF_YEAR}`
  : `${_asOfMonth} 1–${AS_OF_DAY}`;

export const YTD_LABEL = YTD_SPANS_YEARS
  ? `Jan ${YTD_START_YEAR}–${YTD_END_LABEL}`
  : `Jan–${YTD_END_LABEL}`;

export function trKey(cn) {
  const k = cn.replace(/\s/g, "");
  return CN_MAP[k] || k;
}

export function getTradeRecord(cn) {
  return TRADE[trKey(cn)] || null;
}

export function avgMonthTonnes(cn, mo) {
  const td = TRADE[trKey(cn)];
  if (!td) return 0;
  return BASELINE_YEARS.reduce((s, yr) => {
    const v = td[`${yr}-${mo}`];
    return s + (v ? v[0] : 0);
  }, 0) / BASELINE_YEARS.length;
}

export function avgMonthEur(cn, mo) {
  const td = TRADE[trKey(cn)];
  if (!td) return 0;
  return BASELINE_YEARS.reduce((s, yr) => {
    const v = td[`${yr}-${mo}`];
    return s + (v ? v[1] : 0);
  }, 0) / BASELINE_YEARS.length;
}

export function getMonthTonnes(cn, ym) {
  const td = TRADE[trKey(cn)];
  return td?.[ym]?.[0] ?? 0;
}

export function getQtrEts(ym, forecastEts) {
  const [y, m] = ym.split("-");
  const q = Math.ceil(parseInt(m) / 3);
  return ETS_PRICES.quarterly[`${y}-Q${q}`] ?? forecastEts;
}

/** Share of a window month that has elapsed: 1 for every month but the current one. */
export function ytdMonthFraction(ym) {
  return ym === YTD_PARTIAL_YM ? YTD_PARTIAL_FRACTION : 1;
}

export function ytdAvgEur(cn) {
  let sum = 0;
  for (const yr of BASELINE_YEARS) {
    for (const ym of YTD_YMS) {
      const v = TRADE[trKey(cn)]?.[`${yr}-${ymMonth(ym)}`];
      if (v) sum += v[1] * ytdMonthFraction(ym);
    }
  }
  return sum / BASELINE_YEARS.length;
}

/**
 * CN keys whose absence from a released month must not be read as "nothing traded".
 * Hydrogen tonnage comes from the US Census feed in the mixed dataset and Comext's own
 * 2804 10 00 series is too sparse to serve as a presence signal, so a missing hydrogen
 * month means "no signal", not "zero".
 */
export const LIVE_COVERAGE_EXEMPT = new Set(["28041000"]);

const _coverageCache = new WeakMap();

/**
 * How many distinct CN codes must report a month before it counts as released.
 * Comext publishes every code for a month at once, and the tracked sectors span ~100
 * codes, so a genuine release clears this easily. The threshold only stops one stray
 * record from pulling the boundary forward and zeroing every other code that month.
 */
const LIVE_COVERAGE_MIN_CODES = 3;

/**
 * Latest YTD_YEAR month the live feed has actually released, across every CN code.
 *
 * Comext publishes a whole month for all CN codes at once, so the newest month reported
 * broadly enough is the release boundary. At or before it, a code with no entry genuinely
 * traded nothing; after it, the month simply is not out yet. Without this boundary the two
 * cases are indistinguishable and unreleased months silently inherit the 2022-25 baseline
 * average, which reads as confirmed trade on the dashboard.
 */
export function liveCoverageThrough(liveEntries) {
  if (!liveEntries) return null;
  if (_coverageCache.has(liveEntries)) return _coverageCache.get(liveEntries);
  const floor = `${YTD_YEAR}-01`;
  const codesPerYm = new Map();
  for (const k of Object.keys(liveEntries)) {
    if (LIVE_COVERAGE_EXEMPT.has(k)) continue;
    for (const ym of Object.keys(liveEntries[k])) {
      if (ym >= floor) codesPerYm.set(ym, (codesPerYm.get(ym) || 0) + 1);
    }
  }
  let latest = null;
  for (const [ym, n] of codesPerYm) {
    if (n >= LIVE_COVERAGE_MIN_CODES && (latest === null || ym > latest)) latest = ym;
  }
  _coverageCache.set(liveEntries, latest);
  return latest;
}

/**
 * Tonnage for a month in the live period, or null when the caller should fall back to
 * the baseline average.
 *
 * Returns the released figure when there is one, 0 when the month is released but this
 * code has no entry (a real zero — the US shipped none), and null only when the month is
 * past the release boundary, the code is exempt, or there is no live feed at all.
 */
export function liveMonthTonnes(liveEntries, key, ym, coverageThrough) {
  const v = liveEntries?.[key]?.[ym]?.[0];
  if (v != null) return v;
  if (LIVE_COVERAGE_EXEMPT.has(key)) return null;
  return coverageThrough && ym <= coverageThrough ? 0 : null;
}

/**
 * Last month of the YTD window the live feed has actually released, or null when none of
 * it is out yet. Clamped to the window so a feed that runs ahead of today cannot claim
 * months the window does not cover.
 */
export function ytdActualThroughYm(liveEntries) {
  const cov = liveCoverageThrough(liveEntries);
  if (!cov || cov < YTD_YMS[0]) return null;
  const last = YTD_YMS[YTD_YMS.length - 1];
  return cov < last ? cov : last;
}

/**
 * Sub-label for a YTD figure, naming which months are reported trade and which are still
 * the 2022-25 baseline average. Comext runs roughly two months behind, so a YTD number is
 * nearly always part actual and part estimate, and a bare "Jan-Sep 29" reads as if the
 * whole span were confirmed.
 */
export function ytdCoverageLabel(liveEntries) {
  const through = ytdActualThroughYm(liveEntries);
  if (!through) return `${YTD_LABEL} est.`;
  const idx = YTD_YMS.indexOf(through);
  if (idx < 0 || idx === YTD_YMS.length - 1) return `${YTD_LABEL} actual`;
  const first = YTD_YMS[0];
  const reported = through === first ? ymLabel(first) : `${ymLabel(first)}–${ymLabel(through)}`;
  const firstEst = YTD_YMS[idx + 1];
  const estimated = firstEst === YTD_PARTIAL_YM
    ? YTD_PARTIAL_LABEL
    : `${ymLabel(firstEst)}–${YTD_END_LABEL}`;
  return `${reported} actual · ${estimated} est.`;
}

export function ytdTonnesForRows(rows, liveEntries = null) {
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

export function ytdCostFactorsForRows(rows, liveEntries = null) {
  const cov = liveCoverageThrough(liveEntries);
  let cfQ1 = 0;
  let cfApr = 0;
  for (const d of rows) {
    const mv = d.mv2026 || 0;
    const k = trKey(d.cn);
    for (const ym of YTD_YMS) {
      const liveT = liveMonthTonnes(liveEntries, k, ym, cov);
      const tonnes = (liveT != null ? liveT : avgMonthTonnes(d.cn, ymMonth(ym))) * ytdMonthFraction(ym);
      if (ym <= `${YTD_START_YEAR}-03`) cfQ1 += tonnes * mv;
      else cfApr += tonnes * mv;
    }
  }
  return { cfQ1, cfApr };
}

const etsFiveYearStart = AS_OF_YEAR - 5;
const etsFiveYearEntries = Object.entries(ETS_PRICES.quarterly).filter(([k]) => parseInt(k) >= etsFiveYearStart);

export let ETS_5Y_HIGH = 0;
export let ETS_5Y_LOW = Infinity;
export let ETS_5Y_HIGH_QTR = "";
export let ETS_5Y_LOW_QTR = "";

for (const [k, v] of etsFiveYearEntries) {
  if (v > ETS_5Y_HIGH) {
    ETS_5Y_HIGH = v;
    ETS_5Y_HIGH_QTR = k;
  }
  if (v < ETS_5Y_LOW) {
    ETS_5Y_LOW = v;
    ETS_5Y_LOW_QTR = k;
  }
}

export const fmtQtr = k => {
  if (!k) return "";
  const [y, q] = k.split("-");
  return `${q} '${y.slice(2)}`;
};

export const CHART_DATA = [];
for (let y = 2022; y <= 2028; y++) {
  for (let m = 1; m <= 12; m++) {
    const mo = String(m).padStart(2, "0");
    const ym = `${y}-${mo}`;
    const isProjected = y >= 2026;
    let factor = 0;
    for (const d of RELEVANT) {
      const mv = y >= 2028 ? (d.mv2028 || 0) : y === 2027 ? (d.mv2027 || 0) : (d.mv2026 || 0);
      factor += (isProjected ? avgMonthTonnes(d.cn, mo) : getMonthTonnes(d.cn, ym)) * mv;
    }
    CHART_DATA.push({ ym, factor, isProjected });
  }
}

export const SECTOR_STATS = {};
for (const sec of SECTORS_LIST) {
  const rows = RELEVANT.filter(d => d.sector === sec);
  let annT = 0;
  let annE = 0;
  let wtDv = 0;
  let wtMv = 0;
  let wtW = 0;
  let ytdUsd = 0;
  let ytd26 = 0;
  let ytd25j = 0;
  let cfQ1 = 0;
  let cfApr = 0;
  for (const d of rows) {
    const mv = d.mv2026 || 0;
    const tot = d.total || 0;
    for (let m = 1; m <= 12; m++) {
      const mo = String(m).padStart(2, "0");
      const t = avgMonthTonnes(d.cn, mo);
      const e = avgMonthEur(d.cn, mo);
      annT += t;
      annE += e;
      wtDv += t * tot;
      wtMv += t * mv;
      wtW += t;
    }
    ytdUsd += ytdAvgEur(d.cn) * EUR_USD;
    ytd26 += TRADE[trKey(d.cn)]?.["2026-01"]?.[1] ?? 0;
    ytd25j += TRADE[trKey(d.cn)]?.["2025-01"]?.[1] ?? 0;
    const ytdFactors = ytdCostFactorsForRows([d]);
    cfQ1 += ytdFactors.cfQ1;
    cfApr += ytdFactors.cfApr;
  }
  SECTOR_STATS[sec] = {
    annT,
    annUsd: annE * EUR_USD,
    wDv: wtW > 0 ? wtDv / wtW : 0,
    wMv: wtW > 0 ? wtMv / wtW : 0,
    ytdAvgUsd: ytdUsd,
    ytdGrowth: ytd25j > 0 ? (ytd26 - ytd25j) / ytd25j * 100 : null,
    cfQ1,
    cfApr,
  };
}

export function sectorYearCost(sec, yr, forecastEts, liveEntries = null) {
  const rows = RELEVANT.filter(d => d.sector === sec);
  const cov = liveCoverageThrough(liveEntries);
  let cost = 0;
  for (const d of rows) {
    const mv = yr >= 2028 ? (d.mv2028 || 0) : yr === 2027 ? (d.mv2027 || 0) : (d.mv2026 || 0);
    for (let m = 1; m <= 12; m++) {
      const mo = String(m).padStart(2, "0");
      const ym = `${yr}-${mo}`;
      const liveT = yr >= 2026 ? liveMonthTonnes(liveEntries, trKey(d.cn), ym, cov) : null;
      const tonnes = yr >= 2026 ? (liveT != null ? liveT : avgMonthTonnes(d.cn, mo)) : getMonthTonnes(d.cn, ym);
      cost += tonnes * mv * getQtrEts(ym, forecastEts);
    }
  }
  return cost * EUR_USD;
}

export function sectorYearTonnes(sec, yr, liveEntries = null) {
  const rows = RELEVANT.filter(d => d.sector === sec);
  const cov = liveCoverageThrough(liveEntries);
  let tonnes = 0;
  for (const d of rows) {
    for (let m = 1; m <= 12; m++) {
      const mo = String(m).padStart(2, "0");
      const ym = `${yr}-${mo}`;
      const liveT = yr >= 2026 ? liveMonthTonnes(liveEntries, trKey(d.cn), ym, cov) : null;
      tonnes += yr >= 2026 ? (liveT != null ? liveT : avgMonthTonnes(d.cn, mo)) : getMonthTonnes(d.cn, ym);
    }
  }
  return tonnes;
}

export const CBAM_IDX = CHART_DATA.findIndex(p => p.ym === "2026-01");
const dataCutoffIdx = CHART_DATA.findIndex(p => p.ym === DATA_CUTOFF_YM);
export const CUT_IDX = dataCutoffIdx >= 0 ? Math.max(CBAM_IDX, dataCutoffIdx) : CBAM_IDX;
export const TODAY_FRAC_IDX =
  CBAM_IDX + (AS_OF_YEAR - YTD_START_YEAR) * 12 + AS_OF_MONTH_INDEX + AS_OF_DAY / AS_OF_DAYS_IN_MONTH;
export const TODAY_IDX = Math.floor(TODAY_FRAC_IDX);
