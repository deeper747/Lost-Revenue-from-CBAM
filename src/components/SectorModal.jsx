import React, { useEffect, useMemo, useRef, useState } from "react";
import { RELEVANT } from "../data/cbamDefaultValues.js";
import { EUR_USD } from "../config/publicationConfig.js";
import { fmtKt, fmtM, fmtT } from "../lib/formatters.js";
import {
  SECTOR_STATS,
  YTD_LABEL,
  YTD_YMS,
  getQtrEts,
  liveCoverageThrough,
  liveMonthTonnes,
  trKey,
  ymLabel,
  ymMonth,
  ytdActualThroughYm,
  ytdCoverageLabel,
  ytdMonthFraction,
} from "../lib/cbamCalculations.js";
import { getBenchmark, CBAM_FACTOR } from "../data/cbamBenchmarks.js";
import { N, SANS, SERIF, SECTOR_COLORS as SC, SECTOR_LIGHT_COLORS as SCL } from "../styles/tokens.js";

const SECTOR_INFO = {
  "Iron & Steel": {
    desc: "The largest CBAM sector by U.S. export volume. Covers iron ore products, pig iron, ferro-alloys, flat and long steel products (HR/CR/coated), tubes, sections, and fabricated steel articles.",
    extra: "U.S. steelmakers are predominantly electric arc furnace (EAF) based, which typically produces lower emissions than the blast furnace route assumed in EU default values.",
  },
  Aluminum: {
    desc: "Covers unwrought aluminium, semi-finished products (rods, wire, profiles, plates, foil), tubes, fabricated articles, and containers.",
    extra: "Aluminum default values reflect direct smelting emissions only. Indirect emissions from power generation—the larger share of aluminum's carbon footprint—are excluded from CBAM pricing until the EU resolves a WTO compatibility question with its own ETS compensation mechanisms.",
  },
  Cement: {
    desc: "Includes Portland and hydraulic cement, clinker, white and grey variants, and calcined clay. U.S.–EU cement trade is limited by high freight costs relative to product value.",
    extra: "The EU is a net cement exporter to the U.S. CBAM exposure for U.S. cement producers is therefore small in absolute terms.",
  },
  Fertilizers: {
    desc: "Nitrogen-based fertilizers include anhydrous ammonia, urea, ammonium nitrate, and compound fertilizers (NPK/NK/DAP/MAP).",
    extra: "Fertilizers have a special phase-in rate of 1% throughout 2026–2028 (vs. 10% to 30% for other sectors) due to high carbon leakage risk and food security concerns.",
  },
  Hydrogen: {
    desc: "Covers a single CN8 code. The default reflects steam-methane-reforming (SMR) production, which accounts for roughly 99% of global hydrogen output.",
    extra: "At 26.64 tCO₂e/t, hydrogen has the highest default value of any CBAM product. Even small trade volumes can carry a large CBAM cost.",
  },
};

const CF2026 = CBAM_FACTOR[2026];
const fmtCf = yr => parseFloat(((CBAM_FACTOR[yr] ?? 0) * 100).toFixed(1));

function SortTh({ col, label, align = "right", onSort, active, dir }) {
  const arrow = active ? (dir === "desc" ? " ↓" : " ↑") : "";
  return (
    <th onClick={() => onSort(col)}
      style={{ padding: "8px 10px", textAlign: align, color: active ? N.white : N.teal400, fontWeight: 700,
        whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
        background: active ? "rgba(255,255,255,0.1)" : "transparent", transition: "background 0.15s, color 0.15s" }}>
      {label}{arrow}
    </th>
  );
}

/**
 * Generic sector detail modal.
 *
 * Requires a `dataset` prop that conforms to the standard dataset interface
 * (see src/datasets/censusDataset.js or comextDataset.js):
 *   dataset.DATA_SOURCE          — display name, e.g. "Census Bureau"
 *   dataset.getAvgMonthTonnes(cn, mo)
 *   dataset.getYtdTonnesForRows(rows, liveEntries?)
 */
export default function SectorModal({ sec, ets, liveEntries, onClose, dataset, onSwitch }) {
  const { getAvgMonthTonnes, getYtdTonnesForRows, DATA_SOURCE } = dataset;

  const info = SECTOR_INFO[sec] || { desc: "", extra: "" };
  const color = SC[sec] || N.teal600;
  const lightColor = SCL[sec] || N.teal400;
  const closeRef = useRef(null);
  const [sortCol, setSortCol] = useState("v4TaxToday");
  const [sortDir, setSortDir] = useState("desc");
  const [viewPeriod, setViewPeriod] = useState("ytd");

  const handleViewChange = p => {
    setViewPeriod(p);
    const costKeys = ["v4TaxToday", "c2026", "c2027", "c2028"];
    if (costKeys.includes(sortCol)) {
      const map = { ytd: "v4TaxToday", "2026": "c2026", "2027": "c2027", "2028": "c2028" };
      setSortCol(map[p]);
    }
  };

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  useEffect(() => { if (closeRef.current) closeRef.current.focus(); }, []);
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const cnRows = useMemo(() => {
    if (!sec) return [];
    const cov = liveCoverageThrough(liveEntries);
    return RELEVANT.filter(d => d.sector === sec).map(d => {
      // trKey, not a raw strip: three cement rows carry a 10-digit CN that CN_MAP
      // folds onto the 8-digit key the live feed is stored under.
      const _k = trKey(d.cn);
      const bmg = getBenchmark(d.cn, d.route) ?? 0;
      const markupLabel = sec === "Fertilizers" ? "1%" : "10%";

      // Annual avg tonnes using this dataset's baseline
      const annT = [1,2,3,4,5,6,7,8,9,10,11,12].reduce(
        (s, m) => s + getAvgMonthTonnes(d.cn, String(m).padStart(2, "0")), 0
      );

      // YTD trade volume using this dataset's helper
      const ytdTonnes = getYtdTonnesForRows([d], liveEntries);

      // Annual projected cost for a given year using this dataset's baseline
      const trajV4 = (mvk, yr) => {
        const cf = CBAM_FACTOR[yr] ?? 0;
        const mv = d[mvk] || 0;
        const netMv = Math.max(0, mv - bmg * cf);
        return [1,2,3,4,5,6,7,8,9,10,11,12].reduce(
          (s, m) => s + getAvgMonthTonnes(d.cn, String(m).padStart(2, "0")) * netMv, 0
        ) * ets * EUR_USD;
      };

      // YTD CBAM cost — each confirmed quarter at its official price, remaining months at the slider.
      const netMv2026 = Math.max(0, (d.mv2026 || 0) - bmg * CF2026);
      let v4TaxToday = 0;
      for (const ym of YTD_YMS) {
        const liveT = liveMonthTonnes(liveEntries, _k, ym, cov);
        const tonnes = (liveT != null ? liveT : getAvgMonthTonnes(d.cn, ymMonth(ym))) * ytdMonthFraction(ym);
        v4TaxToday += tonnes * netMv2026 * getQtrEts(ym, ets);
      }
      v4TaxToday *= EUR_USD;

      return {
        cn: d.cn, desc: d.desc, total: d.total, bmg, markupLabel, cbamFactorLabel: "97.5%", annT, ytdTonnes, v4TaxToday,
        c2026: trajV4("mv2026", 2026), c2027: trajV4("mv2027", 2027), c2028: trajV4("mv2028", 2028),
      };
    });
  }, [sec, ets, liveEntries, getAvgMonthTonnes, getYtdTonnesForRows]);

  const totT = cnRows.reduce((s, r) => s + r.annT, 0);
  const totYtdTonnes = cnRows.reduce((s, r) => s + r.ytdTonnes, 0);
  const totV4Today = cnRows.reduce((s, r) => s + r.v4TaxToday, 0);
  const tot26 = cnRows.reduce((s, r) => s + r.c2026, 0);
  const tot27 = cnRows.reduce((s, r) => s + r.c2027, 0);
  const tot28 = cnRows.reduce((s, r) => s + r.c2028, 0);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    return [...cnRows].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });
  }, [cnRows, sortCol, sortDir]);

  // Comext lags by roughly two months, so a YTD figure is part reported trade and part
  // baseline average. Every YTD label says which span is which.
  const ytdSpanLabel = ytdCoverageLabel(liveEntries);
  const ytdActualThrough = ytdActualThroughYm(liveEntries);

  const isFert = sec === "Fertilizers";
  const pc = {
    ytd:    { volKey: "ytdTonnes", costKey: "v4TaxToday", volLabel: "YTD Trade Vol (t)",    costLabel: "CBAM Exposure YTD",    markup: isFert ? "1%" : "10%", cf: `${fmtCf(2026)}%`, volTotal: totYtdTonnes, costTotal: totV4Today },
    "2026": { volKey: "annT",      costKey: "c2026",       volLabel: "Annual Trade Vol (t)", costLabel: "Proj. CBAM Cost 2026", markup: isFert ? "1%" : "10%", cf: `${fmtCf(2026)}%`, volTotal: totT, costTotal: tot26 },
    "2027": { volKey: "annT",      costKey: "c2027",       volLabel: "Annual Trade Vol (t)", costLabel: "Proj. CBAM Cost 2027", markup: isFert ? "1%" : "20%", cf: `${fmtCf(2027)}%`, volTotal: totT, costTotal: tot27 },
    "2028": { volKey: "annT",      costKey: "c2028",       volLabel: "Annual Trade Vol (t)", costLabel: "Proj. CBAM Cost 2028", markup: isFert ? "1%" : "30%", cf: `${fmtCf(2028)}%`, volTotal: totT, costTotal: tot28 },
  }[viewPeriod];

  if (!sec) return null;

  const sh = { onSort: handleSort, dir: sortDir };
  const ST = ({ col, label, align }) => <SortTh col={col} label={label} align={align} active={sortCol === col} {...sh}/>;

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(12,42,48,0.75)", zIndex: 300 }}/>
      <div role="dialog" aria-modal="true" aria-label={`${sec} sector detail`}
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: "min(1060px,96vw)", maxHeight: "88vh", background: N.teal900, borderRadius: 4,
          overflow: "hidden", display: "flex", flexDirection: "column", zIndex: 301,
          boxShadow: "0 12px 32px rgba(12,42,48,0.55)", border: `1px solid ${color}44` }}>
        <div style={{ background: `${color}1a`, borderBottom: `2px solid ${color}`, padding: "18px 24px",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: lightColor, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>EU CBAM • Sector Detail</div>
            <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: N.white }}>{sec}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onSwitch && (
              <button onClick={onSwitch} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 3, cursor: "pointer",
                border: `1px solid ${N.teal400}`, background: "transparent", color: N.teal400, letterSpacing: "0.04em" }}>View UK detail</button>
            )}
            <button ref={closeRef} onClick={onClose} aria-label="Close sector detail"
              style={{ background: "none", border: "none", color: N.tealLight, fontSize: 24, cursor: "pointer", lineHeight: 1, padding: "10px 12px", minWidth: 44, minHeight: 44 }}>✕</button>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px 16px 24px" }}>
          <p style={{ fontFamily: SANS, fontSize: 14, color: N.tealLight, lineHeight: 1.65, margin: "0 0 6px" }}>{info.desc}</p>
          <p style={{ fontFamily: SANS, fontSize: 13, color: N.tealMid, lineHeight: 1.6, margin: "0 0 20px", fontStyle: "italic" }}>{info.extra}</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Annual Avg trade volume", val: fmtKt(totT), sub: `2022–25 ${DATA_SOURCE} avg` },
              { label: "Annual Avg trade value", val: fmtM(SECTOR_STATS[sec]?.annUsd || 0), sub: "2022–25 avg basis" },
              { label: "CBAM exposure YTD", val: fmtM(totV4Today), sub: ytdSpanLabel },
            ].map(({ label, val, sub }) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: "12px 14px", border: `1px solid rgba(255,255,255,0.08)` }}>
                <div style={{ fontFamily: SANS, fontSize: 10, color: N.tealMid, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
                <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: N.teal200 }}>{val}</div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: N.tealMid, marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: N.teal400, textTransform: "uppercase", marginBottom: 10 }}>
              Projected Annual Cost Trajectory (at €{ets.toFixed(0)}/tCO₂e)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {[
                { year: "2026", cost: tot26, markup: sec === "Fertilizers" ? "1%" : "10%", cf: fmtCf(2026), col: N.orange400 },
                { year: "2027", cost: tot27, markup: sec === "Fertilizers" ? "1%" : "20%", cf: fmtCf(2027), col: N.orange500 },
                { year: "2028", cost: tot28, markup: sec === "Fertilizers" ? "1%" : "30%", cf: fmtCf(2028), col: "#c0392b" },
              ].map(({ year, cost, markup, cf, col }) => (
                <div key={year} style={{ flex: "1 1 120px", background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: "12px 14px", borderTop: `3px solid ${col}` }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: N.tealMid, marginBottom: 4 }}>{year} • {markup} mark-up • {cf}% CBAM factor</div>
                  <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: N.white }}>{fmtM(cost)}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: N.teal400, textTransform: "uppercase" }}>
              CN Code Breakdown • {cnRows.length} product code{cnRows.length !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[["ytd","YTD"],["2026","2026"],["2027","2027"],["2028","2028"]].map(([p, label]) => (
                <button key={p} onClick={() => handleViewChange(p)}
                  style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 3, cursor: "pointer",
                    border: `1px solid ${viewPeriod === p ? color : "rgba(255,255,255,0.18)"}`,
                    background: viewPeriod === p ? `${color}33` : "rgba(255,255,255,0.04)",
                    color: viewPeriod === p ? N.white : N.tealMid,
                    letterSpacing: "0.06em", transition: "all 0.12s" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 820, borderCollapse: "collapse", fontFamily: SANS, fontSize: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "26%" }}/>
                <col style={{ width: "13%" }}/>
                <col style={{ width: "13%" }}/>
                <col style={{ width: "8%" }}/>
                <col style={{ width: "13%" }}/>
                <col style={{ width: "9%" }}/>
                <col style={{ width: "18%" }}/>
              </colgroup>
              <thead>
                <tr style={{ background: N.teal900, color: N.white, verticalAlign: "bottom" }}>
                  <ST col="cn" label="CN Code / Description" align="left"/>
                  <ST col={pc.volKey} label={pc.volLabel}/>
                  <ST col="total" label="Default Value (tCO₂e/t)"/>
                  <ST col="markupLabel" label="Mark-up"/>
                  <ST col="bmg" label="Benchmark (tCO₂e/t)"/>
                  <ST col="cbamFactorLabel" label="CBAM Factor"/>
                  <ST col={pc.costKey} label={pc.costLabel}/>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr key={r.cn} style={{ borderBottom: `1px solid rgba(255,255,255,0.06)`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ color: lightColor, fontWeight: 700, fontFamily: "monospace", fontSize: 11 }}>{r.cn}</div>
                      <div style={{ color: N.tealMid, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.desc}</div>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: N.white, fontVariantNumeric: "tabular-nums" }}>{fmtT(Math.round(r[pc.volKey]))}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: N.tealLight, fontVariantNumeric: "tabular-nums" }}>{r.total != null ? r.total.toFixed(3) : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: N.tealMid }}>{pc.markup}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: N.tealLight, fontVariantNumeric: "tabular-nums" }}>{r.bmg > 0 ? r.bmg.toFixed(3) : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: N.tealMid }}>{pc.cf}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: N.white, fontVariantNumeric: "tabular-nums", borderLeft: `2px solid rgba(125,206,218,0.2)` }}>{fmtM(r[pc.costKey])}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(255,255,255,0.08)", fontWeight: 700 }}>
                  <td style={{ padding: "8px 10px", color: N.teal400 }}>Total</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: N.white, fontVariantNumeric: "tabular-nums" }}>{fmtT(Math.round(pc.volTotal))}</td>
                  <td/><td/><td/><td/>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: N.white, fontVariantNumeric: "tabular-nums", borderLeft: `2px solid rgba(125,206,218,0.2)` }}>{fmtM(pc.costTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 11, color: N.tealMid }}>
            {viewPeriod === "ytd"
              ? `YTD = ${YTD_LABEL}. ${ytdActualThrough
                  ? `Through ${ymLabel(ytdActualThrough)} is reported ${DATA_SOURCE} trade volume — a CN code absent from a released month counts as zero, not as its historical average. Later months are not released yet and use the 2022–25 ${DATA_SOURCE} monthly avg.`
                  : `No month in the window has been released yet, so trade volume is the 2022–25 ${DATA_SOURCE} monthly avg throughout.`} ETS price: confirmed quarters at official EU prices, remaining months at €${ets.toFixed(0)}/tCO₂e assumed.`
              : `Annual trade volume uses 2022–25 ${DATA_SOURCE} monthly avg. Projected ${viewPeriod} CBAM cost at €${ets.toFixed(0)}/tCO₂e ETS, ${pc.markup} mark-up, ${pc.cf} CBAM factor.`}
          </div>
        </div>
      </div>
    </>
  );
}
