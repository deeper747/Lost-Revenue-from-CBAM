import ETS_PRICES from "../data/ets_prices.json";

const _now = new Date();
const _todayYm = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;

export const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Latest quarter carrying a price, as "YYYY-QN", or null for an empty series.
 */
export function latestPricedQuarter(quarterlyPrices) {
  let latest = null;
  for (const k of Object.keys(quarterlyPrices ?? {})) {
    // Keys are fixed-width, so lexical order is chronological order.
    if (/^\d{4}-Q[1-4]$/.test(k) && (latest === null || k > latest)) latest = k;
  }
  return latest;
}

/**
 * Last month whose CBAM certificate price is official, as "YYYY-MM".
 *
 * Which quarters carry a price is itself the record of what the Commission has published,
 * so the confirmed cut-off is read back from the series rather than tracked in a field of
 * its own. Two hand-maintained copies of one fact drift the moment a quarterly update
 * touches only one of them, and the dashboard then reports a confirmed span that
 * contradicts the prices it is charging.
 */
export function confirmedThroughFromPrices(quarterlyPrices) {
  const latest = latestPricedQuarter(quarterlyPrices);
  if (!latest) return null;
  const [y, q] = latest.split("-Q");
  return `${y}-${String(Number(q) * 3).padStart(2, "0")}`;
}

/**
 * The month after `confirmedThrough` ("Jul 2026"), for the labels that tell the reader
 * where official prices stop and their own forecast takes over.
 */
export function forecastFromLabel(confirmedThrough) {
  if (!confirmedThrough) return "";
  const [y, m] = confirmedThrough.split("-").map(Number);
  return m === 12 ? `${MONTH_NAMES[0]} ${y + 1}` : `${MONTH_NAMES[m]} ${y}`;
}

const _confirmedThrough = confirmedThroughFromPrices(ETS_PRICES.quarterly);

export const PUBLICATION_CONFIG = {
  reportAsOf: _todayYm,
  iframeParentOrigin: "https://www.niskanencenter.org",
  dataCutoffYm: "2026-01",
  baselineYears: ["2022", "2023", "2024", "2025"],
  ytdYear: "2026",
  eurUsd: 1.13,
  // The live feed has to cover the whole cumulative window, so its end rolls with the
  // calendar. Pinned at 2026-12 it would have silently stopped supplying actuals the
  // moment the year turned.
  liveComextStartPeriod: "2026-01",
  liveComextEndPeriod: `${_now.getFullYear()}-12`,

  // Derived from the quarterly price series — never hand-set. Adding a quarter to
  // ets_prices.json (or to the runtime cbam_live_config.json) moves all three.
  etsConfirmedThrough: _confirmedThrough,
  forecastFrom: forecastFromLabel(_confirmedThrough),
  defaultForecastEts: ETS_PRICES.default ?? ETS_PRICES.quarterly[latestPricedQuarter(ETS_PRICES.quarterly)],
};

export const REPORT_AS_OF = PUBLICATION_CONFIG.reportAsOf;
export const IFRAME_PARENT_ORIGIN = PUBLICATION_CONFIG.iframeParentOrigin;
export const DATA_CUTOFF_YM = PUBLICATION_CONFIG.dataCutoffYm;
export const BASELINE_YEARS = PUBLICATION_CONFIG.baselineYears;
export const YTD_YEAR = PUBLICATION_CONFIG.ytdYear;
export const FORECAST_FROM = PUBLICATION_CONFIG.forecastFrom;
export const ETS_CONFIRMED_THROUGH = PUBLICATION_CONFIG.etsConfirmedThrough;
export const EUR_USD = PUBLICATION_CONFIG.eurUsd;
export const DEFAULT_FORECAST_ETS = PUBLICATION_CONFIG.defaultForecastEts;
export const LIVE_COMEXT_START_PERIOD = PUBLICATION_CONFIG.liveComextStartPeriod;
export const LIVE_COMEXT_END_PERIOD = PUBLICATION_CONFIG.liveComextEndPeriod;
