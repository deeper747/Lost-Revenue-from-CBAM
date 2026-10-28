import React, { useEffect, useMemo, useRef, useState } from "react";
import { fmtKt, fmtM, fmtT } from "../lib/formatters.js";
import { N, SANS, SERIF, SECTOR_COLORS as SC, SECTOR_LIGHT_COLORS as SCL } from "../styles/tokens.js";
import {
  GBP_USD,
  UK_SECTOR_WDV,
  UK_TRADE_LATEST_YM,
  ukCnRows,
  ukFreeAllocationPct,
  ukMarkupPct,
  ukPhaseout,
  ukRate,
} from "../datasets/ukDataset.js";

const SECTOR_NOTE = {
  "Iron & Steel": "UK CBAM lists 478 iron and steel codes, from iron ore pellets to fabricated structures. Iron ore pellets (CN 2601 12 00) carry most of the U.S. tonnage in some years, but at a low default value.",
  Aluminum: "UK default values for aluminium run from about 2.0 to 6.0 tCO₂e/t, higher than the EU's U.S.-specific values for the same headings.",
  Cement: "U.S. cement shipments to the UK are small, so exposure stays small at any carbon price.",
  Fertilizers: "UK fertiliser default values carry no mark-up, and fertiliser receives close to full free allocation, so its 2027 CBAM rate is a small share of the UK ETS price.",
  Hydrogen: "A single code. U.S. hydrogen shipments to the UK are close to zero in HMRC's records.",
};

function SortTh({ col, label, align = "right", onSort, active, dir }) {
  const arrow = active ? (dir === "desc" ? " ↓" : " ↑") : "";
  return (
    <th onClick={() => onSort(col)}
      style={{ padding: "8px 10px", textAlign: align, color: active ? N.white : N.teal400, fontWeight: 700,
        whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
        background: active ? "rgba(255,255,255,0.1)" : "transparent" }}>
      {label}{arrow}
    </th>
  );
}

export default function UkSectorModal({ sec, ukPrice, ukRates, onClose, onSwitch }) {
  const color = SC[sec] || N.teal600;
  const lightColor = SCL[sec] || N.teal400;
  const closeRef = useRef(null);
  const [sortCol, setSortCol] = useState("c2027");
  const [sortDir, setSortDir] = useState("desc");
  const [tradedOnly, setTradedOnly] = useState(true);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const rows = useMemo(() => ukCnRows(sec, ukPrice, ukRates), [sec, ukPrice, ukRates]);
  const shown = useMemo(() => {
    const r = tradedOnly ? rows.filter(x => x.annT > 0) : rows;
    const d = sortDir === "desc" ? -1 : 1;
    return [...r].sort((a, b) => typeof a[sortCol] === "string" ? d * a[sortCol].localeCompare(b[sortCol]) : d * (a[sortCol] - b[sortCol]));
  }, [rows, tradedOnly, sortCol, sortDir]);
  const onSort = col => { if (col === sortCol) setSortDir(x => x === "desc" ? "asc" : "desc"); else { setSortCol(col); setSortDir("desc"); } };
  const st = (col, label, align) => <SortTh col={col} label={label} align={align} onSort={onSort} active={sortCol === col} dir={sortDir}/>;

  const totT = rows.reduce((s, r) => s + r.annT, 0);
  const tot = k => rows.reduce((s, r) => s + r[k], 0);
  const rate27 = ukRate(sec, "2027-01", ukPrice, ukRates);
  const traded = rows.filter(r => r.annT > 0).length;

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(12,42,48,0.75)", zIndex: 300 }}/>
      <div role="dialog" aria-modal="true" aria-label={`${sec} UK sector detail`}
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: "min(1060px,96vw)", maxHeight: "88vh", background: N.teal900, borderRadius: 4,
          overflow: "hidden", display: "flex", flexDirection: "column", zIndex: 301,
          boxShadow: "0 12px 32px rgba(12,42,48,0.55)", border: `1px solid ${color}44` }}>
        <div style={{ background: `${color}1a`, borderBottom: `2px solid ${color}`, padding: "18px 24px",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: 12 }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: lightColor, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>UK CBAM • Sector Detail</div>
            <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: N.white }}>{sec}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onSwitch && (
              <button onClick={onSwitch} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 3, cursor: "pointer",
                border: `1px solid ${N.teal400}`, background: "transparent", color: N.teal400, letterSpacing: "0.04em" }}>View EU detail</button>
            )}
            <button ref={closeRef} onClick={onClose} aria-label="Close sector detail"
              style={{ background: "none", border: "none", color: N.tealLight, fontSize: 24, cursor: "pointer", lineHeight: 1, padding: "10px 12px", minWidth: 44, minHeight: 44 }}>✕</button>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px 16px 24px" }}>
          <p style={{ fontFamily: SANS, fontSize: 13, color: N.tealMid, lineHeight: 1.6, margin: "0 0 20px", fontStyle: "italic" }}>{SECTOR_NOTE[sec]}</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Annual avg import volume", val: fmtKt(totT), sub: "2022–25 HMRC avg, U.S. origin" },
              { label: "Default value (wt. avg.)", val: `${UK_SECTOR_WDV[sec].toFixed(3)}`, sub: `tCO₂e/t • incl. ${ukMarkupPct(sec)}% mark-up` },
              { label: "2027 CBAM rate", val: `£${rate27.toFixed(2)}`, sub: `per tCO₂e • ${(ukFreeAllocationPct(sec) * 100).toFixed(1)}% free allocation × ${(ukPhaseout(2027) * 100).toFixed(1)}%` },
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
              Projected Annual Cost (at £{ukPrice.toFixed(2)}/tCO₂e UK ETS price)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {[["2027", "c2027", N.orange400], ["2028", "c2028", N.orange500], ["2030", "c2030", "#c0392b"]].map(([yr, k, col]) => (
                <div key={yr} style={{ flex: "1 1 120px", background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: "12px 14px", borderTop: `3px solid ${col}` }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: N.tealMid, marginBottom: 4 }}>{yr} • phase-out factor {(ukPhaseout(Number(yr)) * 100).toFixed(1)}%</div>
                  <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: N.white }}>{fmtM(tot(k))}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: N.teal400, textTransform: "uppercase" }}>
              CN Code Breakdown • {traded} of {rows.length} codes with U.S. imports
            </div>
            <label style={{ fontFamily: SANS, fontSize: 11, color: N.tealMid, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={tradedOnly} onChange={e => setTradedOnly(e.target.checked)}/> Only codes with U.S. imports
            </label>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontFamily: SANS, fontSize: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "40%" }}/><col style={{ width: "15%" }}/><col style={{ width: "15%" }}/><col style={{ width: "15%" }}/><col style={{ width: "15%" }}/>
              </colgroup>
              <thead>
                <tr style={{ background: N.teal900, color: N.white, verticalAlign: "bottom" }}>
                  {st("cn", "CN Code / Description", "left")}
                  {st("annT", "Annual avg (t)")}
                  {st("dv", "Default value (tCO₂e/t)")}
                  {st("c2027", "Proj. cost 2027")}
                  {st("c2028", "Proj. cost 2028")}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.cn} style={{ borderBottom: `1px solid rgba(255,255,255,0.06)`, background: i % 2 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                    <td style={{ padding: "8px 10px" }} title={r.desc}>
                      <div style={{ color: lightColor, fontWeight: 700, fontFamily: "monospace", fontSize: 11 }}>{r.cn}</div>
                      <div style={{ color: N.tealMid, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.desc}</div>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: N.white, fontVariantNumeric: "tabular-nums" }}>{fmtT(r.annT)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: N.tealLight, fontVariantNumeric: "tabular-nums" }}>{r.dv.toFixed(3)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: N.white, fontVariantNumeric: "tabular-nums" }}>{fmtM(r.c2027)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: N.white, fontVariantNumeric: "tabular-nums" }}>{fmtM(r.c2028)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(255,255,255,0.08)", fontWeight: 700 }}>
                  <td style={{ padding: "8px 10px", color: N.teal400 }}>Total</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: N.white }}>{fmtT(totT)}</td>
                  <td/>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: N.white }}>{fmtM(tot("c2027"))}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: N.white }}>{fmtM(tot("c2028"))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 11, color: N.tealMid, lineHeight: 1.5 }}>
            Trade volume is the 2022–25 monthly average of HMRC-recorded UK imports from the U.S. (reported data run through {UK_TRADE_LATEST_YM}). Default values are HMRC's, published 16 Oct 2026, and already include the mark-up. Cost = tonnes × default value × CBAM rate × ${GBP_USD.toFixed(4)}/£.
          </div>
        </div>
      </div>
    </>
  );
}
