import { useCallback, useEffect, useRef, useState } from "react";
import { CN_MAP } from "../data/cbamDefaultValues.js";
import { TRADE } from "../data/tradeData.js";
import {
  LIVE_COMEXT_END_PERIOD,
  LIVE_COMEXT_START_PERIOD,
} from "../config/publicationConfig.js";

const COMEXT_BASE = "https://ec.europa.eu/eurostat/api/comext/dissemination/sdmx/2.1/data/DS-045409";
// Exact CN codes as stipulated in EU Implementing Regulation 2025/2621 Annex I,
// matching the keys used in RELEVANT and TRADE so live data aligns with the baseline.
const COMEXT_QUERIES = {
  "Iron & Steel": "26011200+7201+720211+720241+72026000+7203+7205+72061000+7208+7209+7210+72111300+7212+7213+72142000+7215+7216+721710+721720+72181000+72191100+72193100+7221+722300+722410+72251100+722530+722550+7301+7302+730300+730419+730439+7305+73061900+73063080+73072100+73079100+7308+7309+7310+731100+731815+731816+73182200+73182300+73269098",
  Aluminum:       "7601+7603+76041010+76041090+76042100+76042910+76042990+7605+7606+7607+7608+76090000+76101000+76110000+7612+76130000+7614+76161000+76169100+76169910+76169990",
  Fertilizers:    "28080000+28141000+28142000+28342100+31021012+31021015+31021019+31021090+31022100+31022900+31023010+31023090+31024010+31024090+31025000+31026000+31028000+31029000+31051000+31052010+31052090+31053000+31054000+31055100+31055900+31059020+31059080",
  Hydrogen:       "28041000",
  Cement:         "25070080+25231000+25232100+25232900+25239000+25233000",
};

function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export function useComextLiveData() {
  const [liveData, setLiveData] = useState(null);
  const [fetchStatus, setFetchStatus] = useState("idle");
  const fetchedRef = useRef(false);

  const fetchComext = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setFetchStatus("loading");
    const raw = {};
    let gotAny = false;

    for (const codes of Object.values(COMEXT_QUERIES)) {
      try {
        const url = `${COMEXT_BASE}/M.EU27_2020.US.${codes}.1./?format=SDMX-CSV&startPeriod=${LIVE_COMEXT_START_PERIOD}&endPeriod=${LIVE_COMEXT_END_PERIOD}`;
        const r = await fetch(url, { signal: timeoutSignal(15000) });
        if (!r.ok) continue;
        const txt = await r.text();
        const lines = txt.split("\n").filter(l => l.trim());
        const hdrLine = lines.find(l => l.startsWith("DATAFLOW"));
        if (!hdrLine) continue;
        const hdrs = hdrLine.split(",").map(h => h.trim().replace(/"/g, "").toLowerCase());
        const iInd = hdrs.indexOf("indicators");
        const iVal = hdrs.indexOf("obs_value");
        const iPer = hdrs.indexOf("time_period");
        const iProd = hdrs.indexOf("product");
        if (iInd < 0 || iVal < 0 || iPer < 0 || iProd < 0) continue;
        for (const line of lines.filter(l => !l.startsWith("DATAFLOW"))) {
          const c = line.split(",").map(x => x.trim().replace(/"/g, ""));
          const ind = c[iInd];
          const ym = c[iPer];
          const cn = c[iProd];
          const val = parseFloat(c[iVal]);
          // Keep released zeros. Downstream reads a month missing from the feed as
          // "not released yet" and a stored 0 as "released, nothing traded".
          if (!cn || !ym || isNaN(val) || val < 0) continue;
          const norm = cn.replace(/\s/g, "");
          let key = CN_MAP[norm] || norm;
          if (!TRADE[key]) {
            const k4 = norm.slice(0, 4);
            if (TRADE[k4]) key = k4;
          }
          if (!raw[key]) raw[key] = {};
          if (!raw[key][ym]) raw[key][ym] = [0, 0];
          if (ind === "QUANTITY_IN_100KG") {
            raw[key][ym][0] += val / 10;
            if (val > 0) gotAny = true;
          }
          if (ind === "VALUE_IN_EUROS") raw[key][ym][1] += val;
        }
      } catch {
        // Optional live data should never block the static publication build.
      }
    }

    setLiveData({ entries: raw, gotAny });
    setFetchStatus(gotAny ? "done" : "fallback");
  }, []);

  useEffect(() => {
    const id = window.setTimeout(fetchComext, 0);
    return () => window.clearTimeout(id);
  }, [fetchComext]);

  return { liveData, fetchStatus };
}
