import { useEffect, useRef, useState } from "react";
import { DEFAULT_FORECAST_ETS } from "../config/publicationConfig.js";

/**
 * The runtime config carries new official quarterly prices, nothing else. The confirmed
 * cut-off and the forecast hand-over month are derived from those prices (see
 * confirmedThroughFromPrices), so they cannot be set here and cannot fall out of step
 * with them. `default_forecast_ets` is an optional override for the slider's starting
 * value; leave it out and the latest published price is used.
 */
const FALLBACK = {
  default_forecast_ets: DEFAULT_FORECAST_ETS,
  ets_quarterly_prices: {},
};

export function useCbamLiveConfig() {
  const [cbamConfig, setCbamConfig] = useState(FALLBACK);
  const [cbamConfigStatus, setCbamConfigStatus] = useState("loading");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch(`/data/cbam_live_config.json?v=${Date.now()}`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => {
        setCbamConfig({ ...FALLBACK, ...data });
        setCbamConfigStatus("done");
      })
      .catch(() => setCbamConfigStatus("fallback"));
  }, []);

  return { cbamConfig, cbamConfigStatus };
}
