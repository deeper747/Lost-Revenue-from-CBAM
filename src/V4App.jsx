import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import ETS_PRICES from "./data/ets_prices.json";
import LineChart from "./components/LineChart.jsx";
import SectorModal from "./components/SectorModal.jsx";
import { getBenchmark, CBAM_FACTOR } from "./data/cbamBenchmarks.js";
import { DATA_CUTOFF_YM, DEFAULT_FORECAST_ETS, EUR_USD, YTD_YEAR, confirmedThroughFromPrices, forecastFromLabel } from "./config/publicationConfig.js";
import { useCbamLiveConfig } from "./hooks/useCbamLiveConfig.js";
import { RELEVANT, SECTORS_LIST } from "./data/cbamDefaultValues.js";
import { fmtM, fmtT, dvLevel } from "./lib/formatters.js";
import {
  AS_OF_YEAR,
  ETS_5Y_HIGH,
  ETS_5Y_HIGH_QTR,
  ETS_5Y_LOW,
  ETS_5Y_LOW_QTR,
  MONTH_NAMES,
  SECTOR_STATS,
  fmtQtr,
  liveCoverageThrough,
  liveMonthTonnes,
  YTD_START_YEAR,
  trKey,
  ytdCoverageLabel,
} from "./lib/cbamCalculations.js";
import * as DS from "./datasets/mixedDataset.js";
import * as UK from "./datasets/ukDataset.js";
import UkSectorModal from "./components/UkSectorModal.jsx";
import { UK_REFERENCE_PRICE, UK_PHASEOUT_LEGISLATED_THROUGH } from "./data/ukCbamParams.js";
import { useComextData } from "./context/ComextDataContext.jsx";
import { useIframeHeight } from "./hooks/useIframeHeight.js";
import { useParentViewport } from "./hooks/useParentViewport.js";
import { N, SANS, SERIF, SECTOR_COLORS as SC, SECTOR_LIGHT_COLORS as SCL } from "./styles/tokens.js";

// ── DYNAMIC TODAY ─────────────────────────────────────────────────────────────
const _now = new Date();
const _nowYear = _now.getFullYear();
const _nowMonth = _now.getMonth(); // 0-indexed
const _nowDay = _now.getDate();
const _nowDaysInMonth = new Date(_nowYear, _nowMonth + 1, 0).getDate();
const CURRENT_YM = `${_nowYear}-${String(_nowMonth + 1).padStart(2, "0")}`;
const REPORT_AS_OF_LABEL = `${MONTH_NAMES[_nowMonth]} ${_nowDay}, ${_nowYear}`;
const ALL_YEARS=[2024,2025,2026,2027,2028,2029,2030,2031,2032,2033,2034,2035];
// Fractional index into the mixed dataset chart (which starts at 2024-01, so CBAM_IDX=24)
const TODAY_FRAC_IDX_DYNAMIC = 24 + (_nowYear - 2026) * 12 + _nowMonth + _nowDay / _nowDaysInMonth;
// UK CBAM starts in Jan 2027: 36 months after the chart's 2024-01 origin.
const UK_CBAM_IDX = (UK.UK_CBAM_START_YEAR - 2024) * 12;

// Which CBAM(s) the calculator totals. Costs from the two are in dollars and simply add.
const VIEWS = [
  { id: "eu", label: "EU only" },
  { id: "uk", label: "UK only" },
  { id: "combined", label: "EU + UK" },
];
const DEST = { eu: "the EU", uk: "the UK", combined: "the EU and UK" };

function ViewToggle({ view, onChange }) {
  return (
    <div role="radiogroup" aria-label="Which carbon border adjustment to show"
      style={{ display: "inline-flex", border: `1px solid ${N.teal600}`, borderRadius: 4, overflow: "hidden" }}>
      {VIEWS.map(v => {
        const on = v.id === view;
        return (
          <button key={v.id} role="radio" aria-checked={on} onClick={() => onChange(v.id)}
            style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", padding: "7px 12px", cursor: "pointer",
              border: "none", borderRight: v.id !== "combined" ? `1px solid ${N.teal600}` : "none",
              background: on ? N.teal400 : "transparent", color: on ? N.teal900 : N.tealLight, transition: "background 0.15s" }}>
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────

function DefaultValueMeter({value,extreme=false}){
  const filled=dvLevel(value);
  if(!filled)return"—";
  return(
    <span
      title={`Default value: ${value.toFixed(2)} tCO₂e/t${extreme?" +":""}`}
      aria-label={`Default value intensity ${filled} of 4${extreme?", plus":""}`}
      style={{display:"inline-flex",alignItems:"center",justifyContent:"flex-start",gap:5,lineHeight:1,width:92}}
    >
      {Array.from({length:4}).map((_,i)=>(
        <span key={i} style={{
          width:14,height:14,display:"inline-block",
          clipPath:"polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%)",
          background:i<filled?N.teal900:N.tealLight,
          opacity:i<filled?1:0.45,
          boxShadow:i<filled?"none":`inset 0 0 0 1px ${N.tealMid}`,
        }}/>
      ))}
      {extreme&&<span style={{fontFamily:SANS,fontSize:14,fontWeight:800,color:N.teal900,marginLeft:2,alignSelf:"flex-end",lineHeight:1}}>+</span>}
    </span>
  );
}

let _termLeaveTimer = null;
const termEnter = (id, set) => { clearTimeout(_termLeaveTimer); set(id); };
const termLeave = (set) => { _termLeaveTimer = setTimeout(() => set(null), 120); };

function Term({id,label,hovered,setHovered,pinnedTerm,setPinnedTerm,color,style={}}){
  const active=hovered===id||pinnedTerm===id;
  return(
    <span
      tabIndex={0} role="button" aria-pressed={active} aria-label={label}
      style={{display:"inline-flex",alignItems:"center",minHeight:32,cursor:"pointer",borderRadius:4,padding:"4px 10px",border:`2px solid ${active?color:N.tealLight}`,background:active?"rgba(255,255,255,0.12)":"transparent",color:active?color:N.white,transition:"all 0.15s",...style}}
      onMouseEnter={()=>termEnter(id,setHovered)}
      onFocus={()=>termEnter(id,setHovered)} onBlur={()=>termLeave(setHovered)}
      onClick={()=>setPinnedTerm(p=>p===id?null:id)}
    >
      <span style={{fontFamily:SERIF,fontSize:"clamp(14px,2vw,24px)",fontWeight:700,letterSpacing:0,lineHeight:1.1}}>{label}</span>
    </span>
  );
}

const LS={color:N.teal200,textDecoration:"underline"};

function InlineSelect({value,onChange,options,color}){
  const c=color||"#348397";
  return(
    <span style={{position:"relative",display:"inline-block"}}>
      <select value={value} onChange={e=>{const v=e.target.value;onChange(v==="today"?v:+v);}}
        style={{fontFamily:"'Hanken Grotesk','Inter',sans-serif",fontSize:"inherit",fontWeight:700,color:c,
          background:"transparent",border:"none",borderBottom:`2px solid ${c}`,
          padding:"0 22px 2px 0",cursor:"pointer",
          WebkitAppearance:"none",MozAppearance:"none",appearance:"none"}}>
        {options.map(y=><option key={y} value={y}>{y==="today"?"Today":y}</option>)}
      </select>
      <span style={{position:"absolute",right:2,top:"50%",transform:"translateY(-50%)",color:c,fontSize:"0.7em",pointerEvents:"none",lineHeight:1}}>▾</span>
    </span>
  );
}

// Sector table for the UK-only and combined views. The EU-only view keeps the original table.
//   UK:       sector · trade volume · default value · mark-up · free allocation · phase-out · exposure
//   Combined: sector · EU volume · UK volume · EU exposure · UK exposure · combined exposure
function AltSectorTable({view,rows,total,isMobile,tonnesLabel,cbamLabel,ukPhase,colHl,hoveredRow,setHoveredRow,rowLeaveTimer,onOpen}){
  const th={padding:"8px 8px",textAlign:"right",fontWeight:700,fontSize:isMobile?13:16};
  const sub=t=><span style={{display:"block",fontSize:10,fontWeight:400,opacity:0.7,marginTop:0.5}}>{t}</span>;
  const td={padding:"9px 8px",textAlign:"right",fontSize:isMobile?13:16,fontWeight:700,color:N.teal800,fontVariantNumeric:"tabular-nums"};
  const last={...td,fontWeight:800,borderLeft:`3px solid ${N.tealLight}`,background:"rgba(61,131,151,0.04)"};
  const isUK=view==="uk";
  const totEU=rows.reduce((s,r)=>s+r.euCbam,0),totUK=rows.reduce((s,r)=>s+r.ukCbam,0);
  return(
    <table style={{width:"100%",minWidth:isMobile?640:1020,borderCollapse:"collapse",fontFamily:SANS,fontSize:isMobile?13:15,tableLayout:"fixed"}}>
      <colgroup>
        <col style={{width:"18%"}}/>
        {isUK
          ?<><col style={{width:"16%"}}/><col style={{width:"16%"}}/><col style={{width:"10%"}}/><col style={{width:"10%"}}/><col style={{width:"10%"}}/></>
          :<><col style={{width:"15%"}}/><col style={{width:"15%"}}/><col style={{width:"16%"}}/><col style={{width:"16%"}}/></>}
        <col style={{width:"20%"}}/>
      </colgroup>
      <thead>
        <tr style={{background:N.teal900,color:N.white,verticalAlign:"top"}}>
          <th style={{...th,textAlign:"left",padding:isMobile?"8px 8px":"8px 12px",borderLeft:`4px solid ${N.teal900}`}}>Sector</th>
          {isUK?(<>
            <th style={{...th,...colHl("ukTonnes","top")}}>{tonnesLabel}{sub("(t • UK imports from U.S.)")}</th>
            <th style={{...th,...colHl("ukDv","top")}}>Default value{sub("(tCO₂e/t • wt. avg. • incl. mark-up)")}</th>
            <th style={{...th,...colHl("ukDv","top")}}>Mark-up{sub("(already in value)")}</th>
            <th style={{...th,...colHl("ukFa","top")}}>Free allocation</th>
            <th style={{...th,...colHl("ukPhase","top")}}>Phase-out factor</th>
          </>):(<>
            <th style={th}>EU {tonnesLabel.replace(/^Proj\. /,"")}{sub("(t)")}</th>
            <th style={th}>UK {tonnesLabel.replace(/^Proj\. /,"")}{sub("(t)")}</th>
            <th style={th}>EU exposure</th>
            <th style={th}>UK exposure</th>
          </>)}
          <th style={{...th,borderLeft:`3px solid rgba(125,206,218,0.3)`,background:"rgba(52,131,151,0.4)"}}>{isUK?cbamLabel.replace("CBAM","UK CBAM"):cbamLabel.replace("CBAM","EU + UK CBAM")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r,i)=>{
          const pos=i===rows.length-1?"bot":"mid";
          return(
            <tr key={r.sec} tabIndex={0} role="button" aria-label={`Open ${r.sec} sector detail`}
              style={{background:i%2===0?N.white:N.tealPale,borderBottom:`1px solid ${N.tealLight}`,cursor:"pointer"}}
              onClick={()=>onOpen(r.sec)}
              onMouseEnter={()=>{clearTimeout(rowLeaveTimer.current);setHoveredRow(i);}} onMouseLeave={()=>{rowLeaveTimer.current=setTimeout(()=>setHoveredRow(null),80);}}
              onKeyDown={e=>(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),onOpen(r.sec))}>
              <td style={{padding:isMobile?"9px 8px":"9px 12px",fontSize:isMobile?14:17,fontWeight:800,color:SC[r.sec],borderLeft:`4px solid ${SC[r.sec]}`}}>
                <span style={{display:"flex",alignItems:"center",overflow:"hidden",whiteSpace:"nowrap"}}>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{r.sec}</span>
                  <span style={{flexShrink:0,opacity:hoveredRow===i?1:0,transition:"opacity 0.15s",fontSize:10,lineHeight:1,marginLeft:5,color:SC[r.sec]}} aria-hidden="true">▶︎</span>
                </span>
              </td>
              {isUK?(<>
                <td style={{...td,color:N.teal900,...colHl("ukTonnes",pos)}}>{fmtT(r.ukTonnes)}</td>
                <td style={{...td,color:N.teal900,...colHl("ukDv",pos)}}>{r.ukWDv>0?r.ukWDv.toFixed(3):"—"}</td>
                <td style={{...td,...colHl("ukDv",pos)}}>{UK.ukMarkupPct(r.sec)}%</td>
                <td style={{...td,...colHl("ukFa",pos)}}>{(r.ukFa*100).toFixed(1)}%</td>
                <td style={{...td,...colHl("ukPhase",pos)}}>{ukPhase}</td>
              </>):(<>
                <td style={{...td,color:N.teal900}}>{fmtT(r.euTonnes)}</td>
                <td style={{...td,color:N.teal900}}>{fmtT(r.ukTonnes)}</td>
                <td style={td}>{fmtM(r.euCbam)}</td>
                <td style={td}>{fmtM(r.ukCbam)}</td>
              </>)}
              <td style={last}>{fmtM(r.displayCbam)}</td>
            </tr>
          );
        })}
        <tr style={{background:N.teal900,color:N.white,fontWeight:700}}>
          {isUK
            ?<td colSpan={6} style={{padding:"9px 12px",fontSize:16,textAlign:"right",color:N.tealMid,borderLeft:`4px solid ${N.teal900}`}}>Total</td>
            :<>
              <td colSpan={3} style={{padding:"9px 12px",fontSize:16,textAlign:"right",color:N.tealMid,borderLeft:`4px solid ${N.teal900}`}}>Total</td>
              <td style={{padding:"9px 8px",textAlign:"right",fontSize:16,fontVariantNumeric:"tabular-nums"}}>{fmtM(totEU)}</td>
              <td style={{padding:"9px 8px",textAlign:"right",fontSize:16,fontVariantNumeric:"tabular-nums"}}>{fmtM(totUK)}</td>
            </>}
          <td style={{padding:"9px 8px",textAlign:"right",fontSize:16,borderLeft:`3px solid rgba(125,206,218,0.25)`,fontVariantNumeric:"tabular-nums"}}>{fmtM(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function V4App(){
  const [ets,setEts]=useState(ETS_PRICES.default||DEFAULT_FORECAST_ETS);
  const etsUserTouched=useRef(false);
  const {cbamConfig}=useCbamLiveConfig();

  // ── EU / UK / combined view ─────────────────────────────────────────────────
  const [view,setViewRaw]=useState("combined");
  const incEU=view!=="uk";
  const incUK=view!=="eu";
  const [ukPrice,setUkPrice]=useState(UK_REFERENCE_PRICE);
  // Official HMRC sector rates by quarter, once published: { "2027-Q1": { "Iron & Steel": 9.69, … } }.
  // They override the formula for that quarter; other quarters use the UK price slider.
  const ukRates=useMemo(()=>cbamConfig.uk_cbam_rates??null,[cbamConfig]);
  const ukConfirmedQtrs=useMemo(()=>Object.keys(ukRates??{}).filter(k=>/^\d{4}-Q[1-4]$/.test(k)).sort(),[ukRates]);
  const ukForecastFrom=useMemo(()=>{
    const last=ukConfirmedQtrs.at(-1);
    if(!last)return`Jan ${UK.UK_CBAM_START_YEAR}`;
    return forecastFromLabel(confirmedThroughFromPrices({[last]:1}));
  },[ukConfirmedQtrs]);

  // Sync slider default when live config loads (only if user hasn't touched it yet)
  useEffect(()=>{
    if(!etsUserTouched.current&&cbamConfig.default_forecast_ets!=null){
      setEts(cbamConfig.default_forecast_ets);
    }
  },[cbamConfig]);

  // Merged quarterly prices: bundled historical + any new confirmed quarters from live config
  const mergedQtrPrices=useMemo(()=>({
    ...ETS_PRICES.quarterly,
    ...(cbamConfig.ets_quarterly_prices??{}),
  }),[cbamConfig]);

  // Runtime getQtrEts using merged prices
  const getQtrEtsMerged=useMemo(()=>(ym,fe)=>{
    const[y,m]=ym.split("-");
    return mergedQtrPrices[`${y}-Q${Math.ceil(parseInt(m)/3)}`]??fe;
  },[mergedQtrPrices]);

  // The quarters carrying an official price are the only record of what is confirmed, so
  // the cut-off and the hand-over month are read back from mergedQtrPrices. Uploading a
  // new quarter into cbam_live_config.json moves both, with no second field to keep in step.
  const etsConfirmedThrough=useMemo(()=>confirmedThroughFromPrices(mergedQtrPrices),[mergedQtrPrices]);
  const forecastFrom=useMemo(()=>forecastFromLabel(etsConfirmedThrough),[etsConfirmedThrough]);

  // Derived confirmed-ETS quarter labels (for caption and confirmed view)
  const confirmedEtsYear=useMemo(()=>etsConfirmedThrough?.split("-")[0]??String(YTD_YEAR),[etsConfirmedThrough]);
  const confirmedEtsQLabel=useMemo(()=>{
    if(!etsConfirmedThrough)return"Q1";
    return`Q${Math.ceil(parseInt(etsConfirmedThrough.split("-")[1])/3)}`;
  },[etsConfirmedThrough]);
  const confirmedQ1Ets=mergedQtrPrices[`${confirmedEtsYear}-${confirmedEtsQLabel}`]??DEFAULT_FORECAST_ETS;

  // Official prices for each confirmed quarter of the YTD year, in quarter order (Q1, Q2, …).
  // A quarter counts as confirmed once its price is present in mergedQtrPrices (bundled JSON + live config).
  const confirmedQtrPrices=useMemo(()=>{
    if(!etsConfirmedThrough)return[];
    const[cy,cm]=etsConfirmedThrough.split("-").map(Number);
    const yr=Number(YTD_YEAR);
    const lastQ=cy>yr?4:cy<yr?0:Math.floor((cm-1)/3)+1;
    const arr=[];
    for(let q=1;q<=lastQ;q++)arr.push(mergedQtrPrices[`${yr}-Q${q}`]??DEFAULT_FORECAST_ETS);
    return arr;
  },[etsConfirmedThrough,mergedQtrPrices]);

  // Price a per-quarter YTD cost-factor bundle: confirmed quarters use their official
  // price (locked), remaining quarters use the user's forecast slider (ets).
  const priceYtdFactors=useCallback((cfByQtr)=>{
    let confirmed=0,total=0;
    for(const qKey in cfByQtr){
      const cp=mergedQtrPrices[qKey];
      const c=cfByQtr[qKey]*(cp??ets);
      total+=c;
      if(cp!=null)confirmed+=c;
    }
    return{taxConfirmed:confirmed*EUR_USD,taxToday:total*EUR_USD};
  },[mergedQtrPrices,ets]);

  const TERM_DEFS=useMemo(()=>({
    tonnes:{title:"Exported metric tons",def:"How much CBAM-covered product the U.S. ships to the EU. Confirmed Comext months use reported tonnage for Iron & Steel, Aluminum, Cement, and Fertilizers; Hydrogen uses U.S. Census Bureau export data because of an unresolved anomaly in the EU Comext data for August 2025. All other months use the 2022–2025 monthly average as the trade baseline.",source:<>Sources: <a href="https://ec.europa.eu/eurostat/databrowser/view/ds-045409__custom_21409230/default/table" target="_blank" rel="noreferrer" style={LS}>Eurostat Comext</a> (Iron & Steel, Aluminum, Cement, Fertilizers) • <a href="https://usatradeonline.census.gov/buildReport" target="_blank" rel="noreferrer" style={LS}>U.S. Census Bureau International Trade</a> (Hydrogen)</>},
    dv:{title:"Default value (tCO₂e/t)",def:"The EU-assigned emissions intensity for each product when an exporter does not report verified facility-level emissions. It converts one metric ton of product into estimated metric tons of CO₂-equivalent.",source:<>Source: <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2621" target="_blank" rel="noreferrer" style={LS}>EU Implementing Regulation 2025/2621, Annex I</a>, as corrected by <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1740" target="_blank" rel="noreferrer" style={LS}>Regulation (EU) 2026/1740</a>.</>},
    markup:{title:"Mark-up / Phase-in %",def:"The penalty add-on applied to the default value. It nudges exporters toward submitting actual emissions data: 10% in 2026, 20% in 2027, 30% from 2028. Fertilizers stay at 1%. Since the July 2026 correction, the marked-up value is computed by the CBAM Registry from the published total rather than printed in the regulation.",source:<>Source: <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2621" target="_blank" rel="noreferrer" style={LS}>EU Implementing Regulation 2025/2621, Annex I</a>, as corrected by <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1740" target="_blank" rel="noreferrer" style={LS}>Regulation (EU) 2026/1740</a>.</>},
    benchmark:{title:"Benchmark",def:"The top 10th percentile of best-in-class EU production emissions for each product. Multiplied by the CBAM factor each year, it gives the effective free-allocation equivalent deducted from the importer's liability. As the CBAM factor falls, this deduction shrinks and the charge grows.",source:<>Source: <a href="https://eur-lex.europa.eu/eli/reg_impl/2025/2620/oj" target="_blank" rel="noreferrer" style={LS}>EU Implementing Regulation 2025/2620</a>.</>},
    cbamFactor:{title:"CBAM factor",def:"The fraction of the EU ETS product benchmark still granted as free allocation to EU producers. Starts at 97.5% in 2026 — so 97.5% of the benchmark is deducted — then falls to 0% from 2034, after which no free allocation remains and importers pay for all embedded emissions above zero.",source:<>Source: <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02003L0087-20240301" target="_blank" rel="noreferrer" style={LS}>EU ETS Directive 2003/87/EC, Article 10a</a>.</>},
    ets:{title:`€${ets.toFixed(1)}/tCO₂e`,def:"The carbon price used to convert net embedded emissions into a CBAM cost. The EU sets it after each quarter by averaging the auction price over that quarter. The tool updates the values applied to each quarter whenever the official CBAM certificate price is published; later months use the assumed price the user defines.",source:<>Source: <a href="https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en" target="_blank" rel="noreferrer" style={LS}>CBAM certificate price</a>.</>},
    fxrate:{title:"$1.13 / €",def:"The conversion from euro costs into U.S. dollars. This calculator holds the exchange rate fixed at $1.13 per euro, based on the 2025 annual average. The regulation uses the same lagged-average approach for future years: 2027 uses the 2026 average, 2028 uses the 2027 average, and so on.",source:<>Source: <a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html" target="_blank" rel="noreferrer" style={LS}>European Central Bank (ECB) Statistical Data Warehouse</a>.</>},
    ukTonnes:{title:"Imported metric tons (UK)",def:`How much UK CBAM-covered product the UK imports from the U.S., by CN8 code. Reported months come from HMRC's Overseas Trade Statistics (released through ${UK.UK_TRADE_LATEST_YM}); projections use the 2022–2025 monthly average. UK CBAM covers 570 CN8 codes, a broader list than the EU rows this calculator tracks, so the two volumes are not like for like.`,source:<>Source: <a href="https://www.uktradeinfo.com/" target="_blank" rel="noreferrer" style={LS}>HMRC uktradeinfo</a> (non-EU imports, country of origin United States).</>},
    ukDv:{title:"UK default value (tCO₂e/t)",def:"HMRC's emissions intensity for each CBAM good, used when an importer does not report verified actual emissions. The UK sets one value per CN8 code for every origin country in 2027 and 2028, computed from EU data and weighted to UK import patterns with EU-origin data excluded. Country-specific values begin in 2029. The published values already include a 10% mark-up in every sector except fertiliser.",source:<>Source: <a href="https://www.gov.uk/government/publications/check-the-default-values-for-the-carbon-border-adjustment-mechanism-cbam" target="_blank" rel="noreferrer" style={LS}>HMRC, Check the default values for the CBAM</a> (16 Oct 2026).</>},
    ukPrice:{title:`£${ukPrice.toFixed(2)}/tCO₂e`,def:"The average UK ETS auction clearing price over the preceding quarter. HMRC sets each sector's CBAM rate from it once a quarter. The slider starts at £58.15, the Q3 2026 average HMRC used for its illustrative rates. Once HMRC publishes official quarterly rates, the calculator applies them to those quarters.",source:<>Source: <a href="https://www.gov.uk/government/publications/illustrative-cbam-rates-and-worked-example-for-carbon-border-adjustment-mechanism-cbam/carbon-border-adjustment-mechanism-cbam-illustrative-cbam-rates-and-worked-example" target="_blank" rel="noreferrer" style={LS}>HMRC, Illustrative CBAM rates and worked example</a> (16 Oct 2026).</>},
    ukFa:{title:"Free allocation %",def:"The share of UK producers' direct emissions in each CBAM sector still covered by free UK ETS allowances. HMRC publishes only cement's (87.1%); the calculator backs the other four out of HMRC's illustrative rates, so it reproduces them exactly at £58.15. HMRC notes these percentages can still change before January 2027.",source:<>Source: <a href="https://www.gov.uk/government/publications/illustrative-cbam-rates-and-worked-example-for-carbon-border-adjustment-mechanism-cbam/carbon-border-adjustment-mechanism-cbam-illustrative-cbam-rates-and-worked-example" target="_blank" rel="noreferrer" style={LS}>HMRC, Illustrative CBAM rates and worked example</a>.</>},
    ukPhase:{title:"Phase-out factor",def:`The factor that withdraws free UK ETS allowances from CBAM sectors: 97.5% in 2027, 95% in 2028, 90% in 2029, and 77.5% in 2030, as set in law. No factor is legislated after ${UK_PHASEOUT_LEGISLATED_THROUGH}; the calculator assumes the UK keeps following the EU schedule one year behind, reaching zero in 2035.`,source:<>Source: <a href="https://www.legislation.gov.uk/uksi/2026/278/article/19/made" target="_blank" rel="noreferrer" style={LS}>The Greenhouse Gas Emissions Trading Scheme (Amendment) Order 2026, art. 19</a>.</>},
    ukFx:{title:`$${UK.GBP_USD.toFixed(4)} / £`,def:"The conversion from sterling into U.S. dollars, held fixed at the Bank of England's 2025 annual average spot rate. This mirrors the EU side, which uses the 2025 euro average.",source:<>Source: <a href="https://www.bankofengland.co.uk/boeapps/database/" target="_blank" rel="noreferrer" style={LS}>Bank of England Database</a>, series XUAAUSS.</>},
  }),[ets,ukPrice]);
  const [hovered,setHovered]=useState(null);
  const [pinnedTerm,setPinnedTerm]=useState(null);
  // The window opens where CBAM does and never moves; only its end follows the calendar.
  // Inside the opening year "today" is the natural close. Once the year turns, "today"
  // would quote a span Comext has barely reported on, so the range closes on the current
  // year instead and the eyebrow reads "From 2026 to 2027".
  const [rangeStart,setRangeStart]=useState(YTD_START_YEAR);
  const [rangeEnd,setRangeEnd]=useState(
    AS_OF_YEAR>YTD_START_YEAR?Math.min(AS_OF_YEAR,ALL_YEARS[ALL_YEARS.length-1]):"today"
  );
  // UK CBAM charges nothing before 2027, so a UK-only "2026 to today" headline would read $0.
  // Switching to the UK view therefore moves a range that ends before 2027 onto 2027.
  const setView=useCallback(v=>{
    setViewRaw(v);
    setConfirmedViewPinned(false);setChartPinnedYear(null);setChartHoverPinned(false);setChartHover(null);
    if(v==="uk"){
      const end=rangeEnd==="today"?AS_OF_YEAR:Number(rangeEnd);
      if(end<UK.UK_CBAM_START_YEAR){setRangeStart(UK.UK_CBAM_START_YEAR);setRangeEnd(UK.UK_CBAM_START_YEAR);}
    }
  },[rangeEnd]);
  const [vw,setVw]=useState(typeof window!=="undefined"?window.innerWidth:1280);
  useEffect(()=>{const h=()=>setVw(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  useIframeHeight();
  const parentVw=useParentViewport();
  const effectiveVw=parentVw??vw;
  const isMobile=effectiveVw<640;
  const isTablet=effectiveVw<1024;
  const [chartHover,setChartHover]=useState(null);
  const [chartHoverPinned,setChartHoverPinned]=useState(false);
  const [chartPinnedYear,setChartPinnedYear]=useState(null);
  const [hoveredSector,setHoveredSector]=useState(null);
  const [selectedSector,setSelectedSector]=useState(null);
  // Which sector modal is open: "eu" (Comext CN detail) or "uk" (HMRC CN detail).
  const [modalJur,setModalJur]=useState("eu");
  const [hoveredRow,setHoveredRow]=useState(null);
  const sectorLeaveTimer=useRef(null);
  const rowLeaveTimer=useRef(null);
  const [howToOpen,setHowToOpen]=useState(false);
  const [confirmedViewPinned,setConfirmedViewPinned]=useState(false);
  // The confirmed (yellow) band is EU Comext data. UK CBAM has no confirmed months until 2027.
  const confirmedViewActive=incEU&&((chartHover?.isConfirmed??false)||confirmedViewPinned);

  const {liveData,fetchStatus}=useComextData();
  const mergedTrade=useMemo(()=>liveData?.gotAny?liveData.entries:null,[liveData]);

  const ytdCostFactors=useMemo(()=>{
    const f={};
    for(const sec of SECTORS_LIST){
      const rows=RELEVANT.filter(d=>d.sector===sec);
      f[sec]=DS.getYtdCostFactorsForRows(rows,mergedTrade);
    }
    return f;
  },[mergedTrade]);

  const ytdTonnesBySector=useMemo(()=>{
    const t={};
    for(const sec of SECTORS_LIST){
      t[sec]=DS.getYtdTonnesForRows(RELEVANT.filter(d=>d.sector===sec),mergedTrade);
    }
    return t;
  },[mergedTrade]);

  // Chart overrides for confirmed months: apply benchmark × CBAM_FACTOR deduction
  const liveChartOverrides=useMemo(()=>{
    if(!mergedTrade)return{};
    const cf2026=CBAM_FACTOR[2026];
    const cov=liveCoverageThrough(mergedTrade);
    const confirmedYms=new Set(Object.entries(mergedTrade).filter(([k])=>k!=="28041000").flatMap(([,m])=>Object.keys(m)).filter(ym=>ym>="2026-01"));
    const ov={};
    for(const ym of confirmedYms){
      const mo=ym.split("-")[1];
      let factor=0;
      for(const d of RELEVANT){
        const k=trKey(d.cn);
        const mv=d.mv2026||0;
        const bmg=getBenchmark(d.cn,d.route)??0;
        const netMv=Math.max(0,mv-bmg*cf2026);
        const liveT=liveMonthTonnes(mergedTrade,k,ym,cov);
        factor+=(liveT!=null?liveT:DS.getAvgMonthTonnes(d.cn,mo))*netMv;
      }
      if(factor>0)ov[ym]=factor;
    }
    return ov;
  },[mergedTrade]);

  const liveDataCutIdx=useMemo(()=>{
    const yms=Object.keys(liveChartOverrides);
    if(!yms.length){
      const idx=DS.CHART_DATA.findIndex(p=>p.ym===DATA_CUTOFF_YM);
      return idx>=0?idx:0;
    }
    const latest=yms.sort().at(-1);
    const idx=DS.CHART_DATA.findIndex(p=>p.ym===latest);
    return idx>=0?idx:0;
  },[liveChartOverrides]);

  const liveMonths=useMemo(()=>Object.keys(liveChartOverrides).sort(),[liveChartOverrides]);

  // Comext lags by roughly two months, so the YTD span is part reported trade and part
  // 2022-25 baseline. The caption names the split rather than implying the whole span
  // is confirmed.
  const ytdSpanLabel=useMemo(()=>ytdCoverageLabel(mergedTrade),[mergedTrade]);

  // A month is truly "confirmed" (yellow line) only when:
  //   1. All four Comext-tracked sectors each have at least one data point for that month.
  //   2. The EU ETS carbon price is confirmed for that month's quarter.
  // Hydrogen always contributes via the Census baseline, so it is not a gating condition here.
  const strictConfirmedCutIdx=useMemo(()=>{
    const etsCap=etsConfirmedThrough??`${YTD_YEAR}-01`;
    if(!mergedTrade){
      const ym=DATA_CUTOFF_YM<=etsCap?DATA_CUTOFF_YM:etsCap;
      const idx=DS.CHART_DATA.findIndex(p=>p.ym===ym);
      return idx>=0?idx:DS.CBAM_IDX-1;
    }
    const COMEXT_SECS=["Iron & Steel","Aluminum","Cement","Fertilizers"];
    const secKeys=Object.fromEntries(COMEXT_SECS.map(sec=>[sec,RELEVANT.filter(d=>d.sector===sec).map(d=>trKey(d.cn))]));
    const allYms=[...new Set(Object.entries(mergedTrade).filter(([k])=>k!=="28041000").flatMap(([,m])=>Object.keys(m)).filter(ym=>ym>="2026-01"))].sort();
    let lastComplete=null;
    let expected="2026-01";
    for(const ym of allYms){
      if(ym!==expected)break;
      if(ym>etsCap)break;
      if(COMEXT_SECS.every(sec=>secKeys[sec].some(k=>mergedTrade[k]?.[ym]?.[0]>0)))lastComplete=ym;
      else break;
      const[y,m]=ym.split("-").map(Number);
      expected=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,"0")}`;
    }
    if(!lastComplete)return DS.CBAM_IDX-1;
    const idx=DS.CHART_DATA.findIndex(p=>p.ym===lastComplete);
    return idx>=0?idx:DS.CBAM_IDX-1;
  },[mergedTrade,etsConfirmedThrough]);

  // The YM corresponding to the strict cut (ETS-capped, all-sector complete).
  // This is what drives the title and sector cost accumulation.
  const strictConfirmedYm=useMemo(()=>{
    if(strictConfirmedCutIdx<DS.CBAM_IDX)return null;
    return DS.CHART_DATA[strictConfirmedCutIdx]?.ym??null;
  },[strictConfirmedCutIdx]);

  const confirmedMosList=useMemo(()=>{
    if(!strictConfirmedYm)return[];
    const lm=parseInt(strictConfirmedYm.split("-")[1]);
    return Array.from({length:lm},(_,i)=>String(i+1).padStart(2,"0"));
  },[strictConfirmedYm]);

  const confirmedDataBySector=useMemo(()=>{
    if(!mergedTrade||!strictConfirmedYm||!confirmedMosList.length)return null;
    const cf2026=CBAM_FACTOR[2026];
    const cov=liveCoverageThrough(mergedTrade);
    const result={};
    for(const sec of SECTORS_LIST){
      const rows=RELEVANT.filter(d=>d.sector===sec);
      let tonnes=0,cost=0;
      for(const d of rows){
        const k=trKey(d.cn);
        const mv=d.mv2026||0;
        const bmg=getBenchmark(d.cn,d.route)??0;
        const netMv=Math.max(0,mv-bmg*cf2026);
        for(const mo of confirmedMosList){
          const ym=`2026-${mo}`;
          const t=liveMonthTonnes(mergedTrade,k,ym,cov)??DS.getAvgMonthTonnes(d.cn,mo);
          const qEts=getQtrEtsMerged(ym,ets);
          tonnes+=t;
          cost+=t*netMv*qEts*EUR_USD;
        }
      }
      result[sec]={tonnes,cost};
    }
    return result;
  },[mergedTrade,strictConfirmedYm,confirmedMosList,ets]);

  const confirmedTotal=useMemo(()=>{
    if(!confirmedDataBySector)return 0;
    return Object.values(confirmedDataBySector).reduce((s,d)=>s+d.cost,0);
  },[confirmedDataBySector]);

  const confirmedMonthLabel=useMemo(()=>{
    if(!strictConfirmedYm)return"";
    const[,m]=strictConfirmedYm.split("-");
    return`${MONTH_NAMES[parseInt(m)-1]} 2026`;
  },[strictConfirmedYm]);

  // Two deliberately different month costs. Both price through getQtrEtsMerged, so the
  // official quarterly price applies where it is confirmed and the user's forecast after.
  // They differ only in the trade term, and both are displayed, each explicitly labelled.
  //
  // baselineCost: every month on the 2022-25 average volume. This is the "if trade volume
  // holds steady" figure quoted in the published article, so it drives the headline, the
  // annual table and the chart tooltip, and must not silently absorb confirmed data.
  //
  // Both add the UK CBAM cost for the month when the view includes the UK. The UK side has
  // the same split: baseline months on the 2022-25 HMRC average, "actual" months on reported
  // HMRC trade where released. UK months before Jan 2027 cost zero either way.
  const euBaselineCost=useCallback(m=>m.factor*getQtrEtsMerged(m.ym,ets)*EUR_USD,[getQtrEtsMerged,ets]);
  const baselineCost=useCallback(m=>(incEU?euBaselineCost(m):0)+(incUK?UK.ukMonthCost(m.ym,ukPrice,ukRates,false):0),[incEU,incUK,euBaselineCost,ukPrice,ukRates]);

  // monthCost: confirmed months use live Comext tonnage, every month after the last
  // confirmed one falls back to m.factor. Drives the chart line and the tracking figure.
  const monthCost=useCallback(m=>(incEU?(liveChartOverrides[m.ym]??m.factor)*getQtrEtsMerged(m.ym,ets)*EUR_USD:0)+(incUK?UK.ukMonthCost(m.ym,ukPrice,ukRates,true):0),[incEU,incUK,liveChartOverrides,getQtrEtsMerged,ets,ukPrice,ukRates]);

  const chartPoints=useMemo(()=>DS.CHART_DATA.map(m=>({...m,v:monthCost(m)/1e6})),[monthCost]);

  const tableRows=useMemo(()=>SECTORS_LIST.map(sec=>{
    const s=SECTOR_STATS[sec];
    const{cfByQtr}=ytdCostFactors[sec];
    const{taxConfirmed,taxToday:euTaxToday}=priceYtdFactors(cfByQtr);
    const ukTaxToday=UK.getUkYtdCost(sec,ukPrice,ukRates);
    const euYtdTonnes=ytdTonnesBySector[sec];
    const ukYtdTonnes=UK.getUkYtdTonnes(sec);
    return{sec,...s,wBmg:DS.SECTOR_BENCHMARKS[sec],taxQ1:taxConfirmed,
      euTaxToday,ukTaxToday,euYtdTonnes,ukYtdTonnes,
      ukWDv:UK.UK_SECTOR_WDV[sec],ukFa:UK.ukFreeAllocationPct(sec),
      taxToday:(incEU?euTaxToday:0)+(incUK?ukTaxToday:0)};
  }),[ytdCostFactors,priceYtdFactors,ytdTonnesBySector,ukPrice,ukRates,incEU,incUK]);

  const totTaxToday=tableRows.reduce((s,r)=>s+r.taxToday,0);
  const activeSectorYear=chartHover?.year??chartPinnedYear;
  const isHoverConfirmed=chartHover?.isConfirmed??false;
  // Starts where the confirmed view ends, so the two bands meet with no month in between.
  // Bounding it by the last month with any Comext trade instead left a hole: a month with
  // trade but no official price yet (Jul 2026) is past the strict cut, so not "confirmed",
  // and not after the last trade month either, so it fell through to the year's total.
  const isHoverPreToday=!!(chartHover?.ym&&chartHover.ym>(strictConfirmedYm??DATA_CUTOFF_YM)&&chartHover.ym<=CURRENT_YM);
  const showYtdForHover=activeSectorYear>=YTD_START_YEAR&&activeSectorYear<=AS_OF_YEAR&&(isHoverConfirmed||isHoverPreToday);
  const activeTableYear=(activeSectorYear&&!showYtdForHover)?activeSectorYear:null;

  // Each row carries the EU and UK halves separately (the combined table shows both), and
  // displayTonnes/displayCbam hold whatever the current view totals.
  const displayTableRows=useMemo(()=>{
    const finish=(r,euT,euC,ukT,ukC)=>({...r,euTonnes:euT,euCbam:euC,ukTonnes:ukT,ukCbam:ukC,
      displayTonnes:(incEU?euT:0)+(incUK?ukT:0),displayCbam:(incEU?euC:0)+(incUK?ukC:0)});
    if(confirmedViewActive&&confirmedDataBySector){
      // Confirmed months are all in 2026, before UK CBAM starts: UK trade still shows, cost is zero.
      const yms=confirmedMosList.map(mo=>`2026-${mo}`);
      return tableRows.map(r=>finish(r,confirmedDataBySector[r.sec]?.tonnes??0,confirmedDataBySector[r.sec]?.cost??0,
        UK.getUkSectorTonnesForYms(r.sec,yms),0));
    }
    // The EU-only table follows the published calculator: year-to-date unless a chart year
    // is hovered or pinned. The UK and combined tables follow the selected year range
    // instead, because UK CBAM has no year-to-date figure before 2027.
    if(!activeTableYear&&view!=="eu"&&rangeEnd!=="today"){
      return tableRows.map(r=>{
        let euT=0,euC=0,ukT=0,ukC=0;
        for(let y=rangeStart;y<=Number(rangeEnd);y++){
          euT+=DS.getSectorYearTonnes(r.sec,y);euC+=DS.getSectorYearCost(r.sec,y,ets,null,mergedQtrPrices);
          ukT+=UK.getUkSectorYearTonnes(r.sec,y);ukC+=UK.getUkSectorYearCost(r.sec,y,ukPrice,ukRates);
        }
        return finish(r,euT,euC,ukT,ukC);
      });
    }
    return tableRows.map(r=>{
      if(!activeTableYear)return finish(r,r.euYtdTonnes,r.euTaxToday,r.ukYtdTonnes,r.ukTaxToday);
      return finish(r,
        DS.getSectorYearTonnes(r.sec,activeTableYear),
        DS.getSectorYearCost(r.sec,activeTableYear,ets,null,mergedQtrPrices),
        UK.getUkSectorYearTonnes(r.sec,activeTableYear),
        UK.getUkSectorYearCost(r.sec,activeTableYear,ukPrice,ukRates));
    });
  },[tableRows,activeTableYear,ets,confirmedViewActive,confirmedDataBySector,confirmedMosList,mergedQtrPrices,ukPrice,ukRates,incEU,incUK,view,rangeStart,rangeEnd]);
  const tableRangeMode=!confirmedViewActive&&!activeTableYear&&view!=="eu"&&rangeEnd!=="today";
  const rangeLabel=`${rangeStart}${Number(rangeEnd)>rangeStart?`–${rangeEnd}`:""}`;

  const displayTableCbamTotal=displayTableRows.reduce((s,r)=>s+r.displayCbam,0);

  const tonnesColumnLabel=confirmedViewActive
    ?"Confirmed trade volume"
    :tableRangeMode
      ?`${rangeLabel} trade volume`
    :activeTableYear
      ?(activeTableYear>=2026?`${activeTableYear} Proj. trade volume`:`${activeTableYear} trade volume`)
      :"Proj. YTD trade volume";
  const cbamColumnLabel=confirmedViewActive
    ?"Confirmed CBAM exposure"
    :tableRangeMode
      ?`Proj. CBAM exposure ${rangeLabel}`
    :activeTableYear
      ?(activeTableYear>=2026?`Proj. CBAM exposure in ${activeTableYear}`:`Est. CBAM exposure in ${activeTableYear}`)
      :"Proj. CBAM exposure YTD";

  const sectorAnnCosts=useMemo(()=>{
    if(confirmedViewActive&&confirmedDataBySector){
      const items=SECTORS_LIST.map(sec=>({sec,cost:confirmedDataBySector[sec]?.cost??0}));
      const tot=items.reduce((s,d)=>s+d.cost,0);
      return items.map(d=>({...d,pct:tot>0?d.cost/tot*100:0})).sort((a,b)=>b.pct-a.pct);
    }
    const yr=showYtdForHover?null:activeSectorYear;
    // Year and range views split the baseline total (2022-25 average volume), so the bars
    // add up to the headline and the by-year figure rather than the Comext-tracking one.
    const euYear=(sec,y)=>incEU?DS.getSectorYearCost(sec,y,ets,null,mergedQtrPrices):0;
    const ukYear=(sec,y)=>incUK?UK.getUkSectorYearCost(sec,y,ukPrice,ukRates):0;
    const items=SECTORS_LIST.map(sec=>{
      let cost;
      if(yr){
        cost=euYear(sec,yr)+ukYear(sec,yr);
      } else if(rangeEnd!=="today"){
        let sum=0;
        for(let y=rangeStart;y<=Number(rangeEnd);y++) sum+=euYear(sec,y)+ukYear(sec,y);
        cost=sum;
      } else{
        const{cfByQtr}=ytdCostFactors[sec];
        cost=(incEU?priceYtdFactors(cfByQtr).taxToday:0)+(incUK?UK.getUkYtdCost(sec,ukPrice,ukRates):0);
      }
      return{sec,cost};
    });
    const tot=items.reduce((s,d)=>s+d.cost,0);
    return items.map(d=>({...d,pct:tot>0?d.cost/tot*100:0})).sort((a,b)=>b.pct-a.pct);
  },[ets,activeSectorYear,ytdCostFactors,rangeStart,rangeEnd,confirmedViewActive,confirmedDataBySector,showYtdForHover,mergedQtrPrices,priceYtdFactors,incEU,incUK,ukPrice,ukRates]);

  // Mark-up % per sector for table column (10% in 2026, 20% in 2027, 30% from 2028)
  const markupPct=(sec)=>{
    if(sec==="Fertilizers")return"1%";
    if(activeTableYear){
      return`${activeTableYear>=2028?30:activeTableYear===2027?20:10}%`;
    }
    const eEnd=rangeEnd==="today"?2026:Number(rangeEnd);
    const startPct=rangeStart<=2026?10:rangeStart===2027?20:30;
    const endPct=eEnd<=2026?10:eEnd===2027?20:30;
    return startPct===endPct?`${startPct}%`:`${startPct}–${endPct}%`;
  };

  // Safe CBAM factor % display (avoids floating-point artifacts like 14.000000000000002)
  const fmtCf=yr=>parseFloat(((CBAM_FACTOR[yr]??0)*100).toFixed(1));

  const cbamFactorPct=()=>{
    if(activeTableYear){
      if(activeTableYear<2026)return"100%";
      return`${fmtCf(activeTableYear)}%`;
    }
    const eEnd=rangeEnd==="today"?2026:Number(rangeEnd);
    const sf=rangeStart<2026?100:fmtCf(rangeStart);
    const ef=eEnd<2026?100:fmtCf(eEnd);
    return sf===ef?`${sf}%`:`${sf}–${ef}%`;
  };

  const{hlVerb,hlAmt}=useMemo(()=>{
    if(rangeEnd==="today"){
      return{hlVerb:"loses an estimated",hlAmt:fmtM(totTaxToday)};
    }
    const startYm=`${rangeStart}-01`,endYm=`${rangeEnd}-12`;
    const tot=DS.CHART_DATA.filter(m=>m.ym>=startYm&&m.ym<=endYm).reduce((s,m)=>s+baselineCost(m),0);
    const verb=Number(rangeEnd)<2026?"would have lost":"is projected to lose";
    return{hlVerb:verb,hlAmt:fmtM(tot)};
  },[rangeStart,rangeEnd,totTaxToday,baselineCost]);

  const annualCosts=useMemo(()=>{
    if(rangeEnd==="today"){
      // Price the cumulative window per calendar year, so a span that has crossed New
      // Year shows one row each instead of collapsing into a single mislabelled row.
      const byYear={};
      for(const sec of SECTORS_LIST){
        const{cfByQtr}=ytdCostFactors[sec];
        for(const qKey in cfByQtr){
          const y=qKey.slice(0,4);
          byYear[y]=(byYear[y]||0)+(incEU?cfByQtr[qKey]*(mergedQtrPrices[qKey]??ets)*EUR_USD:0);
        }
        if(incUK){
          const ukByQ=UK.getUkYtdCostByQtr(sec,ukPrice,ukRates);
          for(const qKey in ukByQ){const y=qKey.slice(0,4);byYear[y]=(byYear[y]||0)+ukByQ[qKey];}
        }
      }
      return Object.keys(byYear).sort().map(y=>({
        year:y===String(AS_OF_YEAR)?`${y} (YTD)`:y,cost:byYear[y],quarters:null,
      }));
    }
    const result=[];
    for(let y=rangeStart;y<=rangeEnd;y++){
      const yearData=DS.CHART_DATA.filter(m=>m.ym.startsWith(String(y)));
      const cost=yearData.reduce((s,m)=>s+baselineCost(m),0);
      result.push({year:String(y),cost,quarters:null});
    }
    return result;
  },[rangeStart,rangeEnd,ytdCostFactors,mergedQtrPrices,ets,baselineCost,incEU,incUK,ukPrice,ukRates]);

  // UK phase-out factor for the table column: one year, or the span of the selected range.
  const ukPhasePct=()=>{
    const f=y=>y<UK.UK_CBAM_START_YEAR?null:parseFloat(((UK.ukPhaseout(y)??0)*100).toFixed(1));
    const lab=v=>v==null?"—":`${v}%`;
    if(activeTableYear)return lab(f(activeTableYear));
    const s=f(rangeStart),e=f(rangeEnd==="today"?AS_OF_YEAR:Number(rangeEnd));
    return s===e?lab(s):`${lab(s??f(UK.UK_CBAM_START_YEAR))}–${lab(e)}`;
  };

  // Year totals on the baseline, handed to the chart so its tooltip and the hover headline
  // quote the same figure as the main headline instead of the Comext-adjusted one.
  const annualBaselineTotals=useMemo(()=>{
    const t={};
    for(const m of DS.CHART_DATA){
      const y=parseInt(m.ym.slice(0,4));
      t[y]=(t[y]||0)+baselineCost(m)/1e6;
    }
    return t;
  },[baselineCost]);

  // What the same months come to once confirmed Comext tonnage replaces the average.
  // Null when there is nothing to report, so the line stays off for pure-forecast ranges.
  const trackingInfo=useMemo(()=>{
    // The tracking note reports confirmed EU Comext data, so it has nothing to say in the UK view.
    if(rangeEnd==="today"||!incEU)return null;
    const startYm=`${rangeStart}-01`,endYm=`${rangeEnd}-12`;
    const months=DS.CHART_DATA.filter(m=>m.ym>=startYm&&m.ym<=endYm);
    const base=months.reduce((s,m)=>s+baselineCost(m),0);
    if(!(base>0))return null;
    const adj=months.reduce((s,m)=>s+monthCost(m),0);
    if(Math.abs(adj-base)/base<0.005)return null;
    const lastYm=liveMonths.at(-1);
    if(!lastYm)return null;
    const[ly,lm]=lastYm.split("-");
    return{amt:fmtM(adj),pct:(adj-base)/base*100,
      through:`${MONTH_NAMES[parseInt(lm)-1]} ${ly}`,
      label:Number(rangeEnd)>rangeStart?`${rangeStart}\u2013${rangeEnd}`:String(rangeStart)};
  },[rangeStart,rangeEnd,baselineCost,monthCost,liveMonths,incEU]);

  // The tracking note and the asterisk that points at it appear and disappear together.
  const showTrackingNote=!!trackingInfo&&!confirmedViewActive&&!(chartHover&&!showYtdForHover);

  const colHl=(col,pos='mid')=>{
    if(hovered!==col)return{};
    const c=N.teal600,bg={background:`${c}22`};
    const lr=`inset 2px 0 0 0 ${c}, inset -2px 0 0 0 ${c}`;
    if(pos==='top')return{...bg,boxShadow:`${lr}, inset 0 2px 0 0 ${c}`};
    if(pos==='bot')return{...bg,boxShadow:`${lr}, inset 0 -2px 0 0 ${c}`};
    return{...bg,boxShadow:lr};
  };

  const priceTag=view==="uk"?`£${ukPrice.toFixed(0)}`:view==="combined"?`€${ets.toFixed(0)} / £${ukPrice.toFixed(0)}`:`€${ets.toFixed(0)}`;

  const handleChartHover=useCallback((info)=>{setChartHover(info);},[]);
  const handleChartLeave=useCallback(()=>{setChartHover(null);},[]);

  const handleChartClick=useCallback((yr,tooltipInfo)=>{
    if(tooltipInfo?.isConfirmed&&incEU){setConfirmedViewPinned(p=>!p);return;}
    setRangeStart(yr);setRangeEnd(yr);
    setChartHover(null);setChartPinnedYear(yr);
    setChartHoverPinned(true);setConfirmedViewPinned(false);
  },[incEU]);

  const clearChartPinnedYear=useCallback(()=>{
    setChartPinnedYear(null);setChartHoverPinned(false);
    setChartHover(null);setConfirmedViewPinned(false);
  },[]);

  const handleConfirmedClick=useCallback(()=>setConfirmedViewPinned(p=>!p),[]);


  return(
    <>
      <style>{`*{box-sizing:border-box;}html,body,#root{margin:0;min-height:100%;width:100%;max-width:100%;}body{background:${N.teal900};overflow-x:hidden;}:focus-visible{outline:2px solid ${N.teal400};outline-offset:2px;}svg a:hover text{text-decoration:underline;}`}</style>

      <div style={{fontFamily:SANS,minHeight:"100vh",color:N.teal900,width:"100%",margin:0,background:N.teal900}}>

        {isMobile&&(
          <div style={{padding:"14px 16px 10px",borderBottom:`1px solid ${N.teal800}`}}>
            <div style={{fontFamily:SANS,fontSize:20,fontWeight:700,color:N.white,letterSpacing:"0.01em",marginBottom:3}}>US Carbon Border Cost Calculator</div>
            <div style={{fontFamily:SANS,fontSize:10,color:N.tealMid,lineHeight:1.5,marginBottom:2}}>Estimated EU and UK CBAM costs under default values and phase-in schedules</div>
            <div style={{fontFamily:SANS,fontSize:10,color:N.tealMid,lineHeight:1.5,marginBottom:8}}>A measure of federal revenue the U.S. could capture but currently won't</div>
            <ViewToggle view={view} onChange={setView}/>
          </div>
        )}

        {/* TOP SECTION */}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr 300px":"1fr 380px",gap:0,borderBottom:`1px solid ${N.teal800}`,background:N.teal900,position:"relative",width:"100%"}}>
          {/* LEFT: Headline + Chart */}
          <div style={{padding:isMobile?"10px 16px 0":"10px 28px 0",background:"transparent",position:"relative",zIndex:1,display:"flex",flexDirection:"column",minHeight:isMobile?0:560}}>
            {/* Eyebrow */}
            <div style={{margin:"0 0 10px",height:isMobile?undefined:"clamp(46px,5vw,58px)",minHeight:isMobile?36:undefined,fontSize:isMobile?22:"clamp(32px,4vw,45px)",fontWeight:700,color:N.teal400,fontFamily:SANS,letterSpacing:0,lineHeight:1,display:"flex",alignItems:"center",flexWrap:"nowrap",gap:"0 8px",flexShrink:0}}>
              {confirmedViewActive?(
                <span style={{fontFamily:SANS,fontSize:isMobile?22:"clamp(32px,4vw,45px)",fontWeight:700,lineHeight:1,letterSpacing:0,color:"#F4DA91"}}>Jan 2026 – {confirmedMonthLabel}</span>
              ):(chartHover&&!showYtdForHover)?(
                <span style={{fontFamily:SANS,fontSize:isMobile?22:"clamp(32px,4vw,45px)",fontWeight:700,lineHeight:1,letterSpacing:0}}>{chartHover.hlTime}</span>
              ):(
                <>
                  <span>From{" "}</span>
                  <InlineSelect value={rangeStart} onChange={v=>{clearChartPinnedYear();setRangeStart(v);if(v<2026){const cur=rangeEnd==="today"?2026:rangeEnd;setRangeEnd(Math.min(Math.max(cur,v),2025));}else{if(rangeEnd!=="today"&&rangeEnd<v)setRangeEnd(v);else if(rangeEnd==="today"&&v!==2026)setRangeEnd(v);}}} options={ALL_YEARS} color={N.teal400}/>
                  <span>{" "}to{" "}</span>
                  <InlineSelect value={rangeEnd} onChange={v=>{clearChartPinnedYear();setRangeEnd(v);}} options={rangeStart<2026?ALL_YEARS.filter(y=>y>=rangeStart&&y<2026):rangeStart===2026?[...ALL_YEARS.filter(y=>y>=rangeStart),"today"]:ALL_YEARS.filter(y=>y>=rangeStart)} color={N.teal400}/>
                </>
              )}
            </div>
            <div style={{margin:"0 0 6px",fontFamily:SERIF,fontSize:isMobile?"clamp(24px,8vw,32px)":"clamp(43px,6vw,77px)",fontWeight:400,lineHeight:isMobile?1.08:0.98,letterSpacing:isMobile?"-0.02em":undefined,color:N.white}}>
              The U.S.{" "}
              <span style={{color:N.teal400}}>{confirmedViewActive?"loses an estimated":(chartHover&&!showYtdForHover)?chartHover.hlVerb:hlVerb}</span>{" "}
              <span style={{color:N.orange500,whiteSpace:"nowrap"}}>{confirmedViewActive?fmtM(confirmedTotal):(chartHover&&!showYtdForHover)?chartHover.hlAmt:hlAmt}</span>{" "}
              to {DEST[view]}
            </div>
            <div style={{margin:"0 0 8px",fontFamily:SANS,fontSize:"clamp(13px,2.2vw,24px)",fontWeight:400,lineHeight:1.4,color:N.tealMid}}>
              for exporting emission&#8209;intensive products under {view==="combined"?"the EU and UK carbon border adjustment mechanisms":`the ${view==="uk"?"UK":"EU"} carbon border adjustment mechanism`}.
              {showTrackingNote&&<sup style={{color:N.teal400,fontWeight:700,marginLeft:1}}>*</sup>}
              {view==="uk"&&rangeEnd==="today"&&<span style={{display:"block",fontSize:"0.6em",color:N.teal400,marginTop:4}}>UK CBAM applies to goods imported from 1 January 2027. Pick 2027 or later to see UK exposure.</span>}
            </div>
            <div style={{marginTop:"auto"}}>
              <LineChart points={chartPoints} annualBaselineTotals={annualBaselineTotals} onChartHover={handleChartHover} onChartLeave={handleChartLeave} viewStartYm="2025-01" viewEndYm="2028-12" onChartClick={handleChartClick}
                cutIdx={incEU?strictConfirmedCutIdx:UK_CBAM_IDX-1}
                confirmedEtsQtrs={incEU?confirmedQtrPrices:[]}
                forecastEts={ets}
                forecastLabel={view==="uk"?`£${Math.round(ukPrice)}`:view==="combined"?`€${Math.round(ets)} · £${Math.round(ukPrice)}`:null}
                onConfirmedClick={handleConfirmedClick} confirmedPinned={confirmedViewPinned}
                cbamIdx={incEU?DS.CBAM_IDX:UK_CBAM_IDX}
                extraMarkers={view==="combined"?[{idx:UK_CBAM_IDX,label:"UK CBAM start"}]:[]}
                jurisdiction={view}
                maxY={view==="uk"?4:400}
                todayFracIdx={TODAY_FRAC_IDX_DYNAMIC} isMobile={isMobile}/>
              {(()=>{
                const latestYm=liveMonths.length>0?liveMonths[liveMonths.length-1]:DATA_CUTOFF_YM;
                const[lcY,lcM]=latestYm.split("-");
                const latestLabel=`${MONTH_NAMES[parseInt(lcM)-1]} ${lcY}`;
                const nextMoNum=parseInt(lcM)%12+1;
                const nextYr=parseInt(lcM)===12?parseInt(lcY)+1:parseInt(lcY);
                const nextLabel=`${MONTH_NAMES[nextMoNum-1]} ${nextYr}`;
                const confirmedQtrList=confirmedQtrPrices.map((_,i)=>`Q${i+1}`).join(", ");
                const ukCaption=<> • <span style={{color:N.tealLight,fontWeight:600}}>UK trade</span>: <a href="https://www.uktradeinfo.com/" target="_blank" rel="noreferrer" style={{color:"inherit",textDecoration:"underline"}}>HMRC</a> imports from the U.S., 2022–2025 avg, reported through {UK.UK_TRADE_LATEST_YM} • <span style={{color:N.tealLight,fontWeight:600}}>UK CBAM rate</span>: UK ETS price on your choice (£{ukPrice.toFixed(2)}) × HMRC free allocation adjustment, from Jan 2027{ukConfirmedQtrs.length?`; official HMRC rates for ${ukConfirmedQtrs.join(", ")}`:"; no official HMRC rate published yet"}</>;
                if(view==="uk")return(
                  <p style={{margin:"4px 0 0",fontFamily:SANS,fontSize:isMobile?8:"clamp(9px,0.8vw,12px)",color:N.tealMid,lineHeight:1.5}}>
                    Estimated monthly UK CBAM cost ($M){ukCaption} • Data current as of {REPORT_AS_OF_LABEL}
                  </p>
                );
                return(
                  <p style={{margin:"4px 0 0",fontFamily:SANS,fontSize:isMobile?8:"clamp(9px,0.8vw,12px)",color:N.tealMid,lineHeight:1.5}}>
                    Estimated monthly {view==="combined"?"EU + UK ":""}CBAM cost ($M) • <span style={{color:N.tealLight,fontWeight:600}}>Trade</span>: <a href="https://ec.europa.eu/eurostat/databrowser/view/ds-045409__custom_21409230/default/table" target="_blank" rel="noreferrer" style={{color:"inherit",textDecoration:"underline"}}>Eurostat Comext</a> 2022–2025 avg (Iron & Steel, Aluminum, Cement, Fertilizers) and <a href="https://usatradeonline.census.gov/buildReport" target="_blank" rel="noreferrer" style={{color:"inherit",textDecoration:"underline"}}>U.S. Census Bureau</a> export avg (Hydrogen); confirmed Jan–{latestLabel} via Comext, projected {nextLabel}–2028 • <span style={{color:N.tealLight,fontWeight:600}}>EU carbon price</span> (<a href="https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en" target="_blank" rel="noreferrer" style={{color:"inherit",textDecoration:"underline"}}>EU Commission</a>): {confirmedQtrList} {confirmedEtsYear} prices are official, prices from {forecastFrom} on are up to user choice{view==="combined"&&ukCaption} • Data current as of {REPORT_AS_OF_LABEL}{fetchStatus==="loading"&&<span style={{color:N.teal400}}> • Fetching…</span>}{fetchStatus==="fallback"&&<span style={{color:N.orange400}}> • Live Comext fetch unavailable; using static baseline and bundled confirmed data.</span>}
                  </p>
                );
              })()}
            </div>
          </div>

          {/* RIGHT: ETS + Sector panel */}
          <div style={{background:N.teal900,color:N.white,padding:isMobile?"16px 16px 24px":isTablet?"12px 20px 24px 16px":"12px 28px 24px 24px",display:"flex",flexDirection:"column",gap:20,position:"relative",zIndex:1,borderTop:isMobile?`1px solid ${N.teal800}`:"none"}}>
            {!isMobile&&(
              <div style={{paddingBottom:4,textAlign:"right"}}>
                <div style={{fontFamily:SANS,fontSize:20,fontWeight:700,color:N.white,letterSpacing:"0.01em",marginBottom:3}}>US Carbon Border Cost Calculator</div>
                <div style={{fontFamily:SANS,fontSize:14,color:N.tealMid,lineHeight:1.2,marginBottom:10}}>Estimated EU and UK CBAM costs under default values and phase-in schedules: a measure of federal revenue the U.S. could capture but currently won't</div>
                <ViewToggle view={view} onChange={setView}/>
              </div>
            )}
            {/* ETS Price */}
            <div>
              <div style={{marginBottom:4}}>
                <div style={{background:"rgba(255,255,255,0.05)",borderRadius:4,border:`1px solid rgba(255,255,255,0.08)`,marginBottom:12,overflow:"hidden"}}>
                  <button onClick={()=>setHowToOpen(o=>!o)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:"none",border:"none",borderBottom:"none",outline:"none",WebkitAppearance:"none",MozAppearance:"none",appearance:"none",cursor:"pointer",padding:"10px 14px",fontFamily:SANS,fontSize:10,fontWeight:700,color:N.teal400,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                    <span>How to explore</span>
                    <span style={{fontSize:14,lineHeight:1,transition:"transform 0.2s",transform:howToOpen?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
                  </button>
                  {howToOpen&&(
                    <div style={{padding:"0 14px 12px"}}>
                      {[
                        ["◎","Hover the chart to explore monthly cost estimates for 2026–2028"],
                        ["⇅","Drag the slider to model different carbon price scenarios"],
                        ["▶","Click any sector row in the table below for a full CN-code breakdown"],
                        ["↔","Use the year selectors to view multi-year totals and see the phase-in ramp"],
                      ].map(([icon,text],i)=>(
                        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,fontFamily:SANS,fontSize:12,color:N.tealLight,lineHeight:1.5,marginBottom:i<3?6:0}}>
                          <span style={{color:N.teal400,flexShrink:0}}>{icon}</span>
                          <span>{text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {incEU&&(<div style={{marginBottom:incUK?16:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
                  <span style={{fontFamily:SANS,fontSize:12,color:N.tealMid}}>{incUK?"EU price":"Price"} on your choice <span style={{fontSize:11,opacity:0.65}}>from {forecastFrom} on</span></span>
                  <span style={{fontFamily:SANS,fontSize:17,fontWeight:700,color:N.teal400}}>€{ets.toFixed(1)}<span style={{fontSize:12,fontWeight:400}}>/tCO<sub>2</sub></span></span>
                </div>
                <input type="range" min={30} max={130} value={ets} aria-label="EU carbon price forecast, euros per tonne" onChange={e=>{etsUserTouched.current=true;setEts(+e.target.value);}}
                  style={{width:"100%",accentColor:N.teal400,cursor:"pointer",marginBottom:2}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontFamily:SANS,fontSize:11,color:N.tealMid}}>
                  <span>€30</span><span>€80</span><span>€130</span>
                </div>
                <div style={{marginTop:5,fontFamily:SANS,fontSize:11,color:N.tealMid,lineHeight:1.5}}>
                  Past 5-yr range: low €{ETS_5Y_LOW.toFixed(0)}/t ({fmtQtr(ETS_5Y_LOW_QTR)}) • high €{ETS_5Y_HIGH.toFixed(0)}/t ({fmtQtr(ETS_5Y_HIGH_QTR)})
                </div>
                </div>)}
                {incUK&&(<div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
                  <span style={{fontFamily:SANS,fontSize:12,color:N.tealMid}}>UK ETS price on your choice <span style={{fontSize:11,opacity:0.65}}>from {ukForecastFrom} on</span></span>
                  <span style={{fontFamily:SANS,fontSize:17,fontWeight:700,color:N.teal400}}>£{ukPrice.toFixed(2)}<span style={{fontSize:12,fontWeight:400}}>/tCO<sub>2</sub></span></span>
                </div>
                <input type="range" min={20} max={120} step={0.5} value={ukPrice} aria-label="UK ETS price forecast, pounds per tonne" onChange={e=>setUkPrice(+e.target.value)}
                  style={{width:"100%",accentColor:N.teal400,cursor:"pointer",marginBottom:2}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontFamily:SANS,fontSize:11,color:N.tealMid}}>
                  <span>£20</span><span>£70</span><span>£120</span>
                </div>
                <div style={{marginTop:5,fontFamily:SANS,fontSize:11,color:N.tealMid,lineHeight:1.5}}>
                  Starts at £{UK_REFERENCE_PRICE.toFixed(2)}, the Q3 2026 average UK ETS auction price HMRC used for its illustrative rates • UK CBAM rate = price × (1 − free allocation % × phase-out factor)
                </div>
                </div>)}
              </div>
            </div>

            {/* Sector breakdown */}
            <div>
              <div style={{fontFamily:SANS,fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:N.teal400,textTransform:"uppercase",marginBottom:6}}>
                {confirmedViewActive?"Confirmed CBAM Exposure by Sector":`${(activeSectorYear&&!showYtdForHover)?`${activeSectorYear} `:rangeEnd!=="today"?`${rangeStart}${Number(rangeEnd)>rangeStart?`–${rangeEnd}`:""} `:"YTD "}CBAM Exposure by Sector`}
              </div>
              <div style={{fontSize:12,color:N.tealMid,marginBottom:confirmedViewActive?6:10}}>
                {confirmedViewActive
                  ?`Jan – ${confirmedMonthLabel} • CBAM factor ${fmtCf(2026)}% • at €${confirmedQ1Ets.toFixed(2)}`
                  :showYtdForHover
                    ?`YTD • ${ytdSpanLabel}${incEU?` • CBAM factor ${fmtCf(2026)}%`:""} • at ${priceTag}`
                    :(activeSectorYear&&!showYtdForHover)
                      ?`${activeSectorYear} ${activeSectorYear<2026?"hypothetical":"projected"}${incEU?` • EU CBAM factor ${activeSectorYear<2026?100:fmtCf(activeSectorYear)}%`:""}${incUK&&activeSectorYear>=UK.UK_CBAM_START_YEAR?` • UK phase-out ${ukPhasePct()}`:""}`
                      :rangeEnd!=="today"
                        ?`${rangeStart}${Number(rangeEnd)>rangeStart?`–${rangeEnd}`:""} • sector mix`
                        :`YTD • ${incEU?ytdSpanLabel:"UK CBAM not yet in force"}`
                }{!confirmedViewActive&&!showYtdForHover&&` • at ${priceTag}`}
              </div>
              {confirmedViewActive&&confirmedViewPinned&&(
                <div style={{marginBottom:4,fontFamily:SANS,fontSize:11,color:N.tealMid,opacity:0.85,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4}}
                  onClick={()=>setConfirmedViewPinned(false)}>
                  <span style={{fontSize:13}}>✖︎</span><span>Pinned • click to unpin</span>
                </div>
              )}
              {confirmedViewActive&&(
                <div style={{marginBottom:8,fontFamily:SANS,fontSize:11,color:N.tealMid,fontStyle:"italic",lineHeight:1.45,opacity:0.85}}>
                  Trade volumes reflect the latest available Comext submissions and are preliminary — figures may be revised in subsequent reporting periods as data are finalized.
                </div>
              )}
              {sectorAnnCosts.map(({sec,cost,pct})=>(
                <div key={sec} style={{marginBottom:10,cursor:"pointer"}}
                  onMouseEnter={()=>{clearTimeout(sectorLeaveTimer.current);setHoveredSector(sec);}} onMouseLeave={()=>{sectorLeaveTimer.current=setTimeout(()=>setHoveredSector(null),80);}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontFamily:SANS,fontSize:13,fontWeight:600,color:SCL[sec]}}>{sec}</span>
                    <span style={{fontFamily:SANS,fontSize:13,fontWeight:700,color:N.white,opacity:(confirmedViewActive||hoveredSector===sec)?1:0,transition:"opacity 0.2s"}}>{fmtM(cost)}</span>
                  </div>
                  <div style={{height:6,background:"rgba(255,255,255,0.08)",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct.toFixed(1)}%`,background:SC[sec]||N.teal600,borderRadius:3,transition:"width 0.3s"}}/>
                  </div>
                </div>
              ))}
              {showTrackingNote&&(
                <div style={{marginTop:14,paddingTop:10,borderTop:`1px solid rgba(255,255,255,0.08)`,fontFamily:SANS,fontSize:11,fontWeight:400,lineHeight:1.5,color:N.tealMid}}>
                  <sup style={{color:N.teal400,fontWeight:700}}>*</sup> Assumes 2022&#8211;2025 average trade volume all year. With confirmed Comext data through {trackingInfo.through}, {trackingInfo.label} is tracking{" "}
                  <span style={{color:N.white,fontWeight:600}}>{trackingInfo.amt}</span> ({trackingInfo.pct>0?"+":""}{trackingInfo.pct.toFixed(1)}%).
                </div>
              )}
            </div>

            {/* CBAM Exposure by Year */}
            <div style={{borderTop:`1px solid rgba(255,255,255,0.1)`,paddingTop:14,marginTop:"auto"}}>
              <div style={{fontFamily:SANS,fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:N.teal400,textTransform:"uppercase",marginBottom:10}}>CBAM Exposure by Year</div>
              {annualCosts.map(({year,cost})=>(
                <div key={year} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontFamily:SANS,fontSize:13,color:N.tealMid}}>{year}</span>
                    <span style={{fontFamily:SERIF,fontSize:18,fontWeight:700,color:N.teal200}}>{fmtM(cost)}</span>
                  </div>
                </div>
              ))}
              {annualCosts.length>1&&(
                <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid rgba(255,255,255,0.1)`,paddingTop:8,marginTop:2}}>
                  <span style={{fontFamily:SANS,fontSize:13,color:N.tealMid,fontWeight:700}}>Total</span>
                  <span style={{fontFamily:SERIF,fontSize:20,fontWeight:700,color:N.teal200}}>{fmtM(annualCosts.reduce((s,d)=>s+d.cost,0))}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTOR TABLE */}
        <div style={{background:N.white,padding:"0 0 4px"}}>
          <div style={{overflowX:"auto"}}>
            {view!=="eu"?(
              <AltSectorTable view={view} rows={displayTableRows} total={displayTableCbamTotal} isMobile={isMobile}
                tonnesLabel={tonnesColumnLabel} cbamLabel={cbamColumnLabel} ukPhase={ukPhasePct()}
                colHl={colHl} hoveredRow={hoveredRow} setHoveredRow={setHoveredRow} rowLeaveTimer={rowLeaveTimer}
                onOpen={sec=>{setSelectedSector(sec);setModalJur(view==="uk"?"uk":"eu");}}/>
            ):(
            <table style={{width:"100%",minWidth:isMobile?640:1020,borderCollapse:"collapse",fontFamily:SANS,fontSize:isMobile?13:15,tableLayout:"fixed"}}>
              <colgroup>
                <col style={{width:"18%"}}/>
                <col style={{width:"16%"}}/>
                <col style={{width:"16%"}}/>
                <col style={{width:"10%"}}/>
                <col style={{width:"10%"}}/>
                <col style={{width:"10%"}}/>
                <col style={{width:"20%"}}/>
              </colgroup>
              <thead>
                <tr style={{background:N.teal900,color:N.white,verticalAlign:"top"}}>
                  <th style={{padding:isMobile?"8px 8px":"8px 12px",textAlign:"left",fontWeight:700,fontSize:isMobile?13:16,borderLeft:`4px solid ${N.teal900}`}}>Sector</th>
                  <th style={{padding:"8px 8px",textAlign:"right",fontWeight:700,fontSize:isMobile?13:16,...colHl("tonnes","top")}}>{tonnesColumnLabel}<span style={{display:"block",fontSize:10,fontWeight:400,opacity:0.7,marginTop:0.5}}>(t)</span></th>
                  <th style={{padding:"8px 8px",textAlign:"right",fontWeight:700,fontSize:isMobile?13:16,...colHl("dv","top")}}>Default value<span style={{display:"block",fontSize:10,fontWeight:400,opacity:0.7,marginTop:0.5}}>(tCO₂e/t • wt. avg.)</span></th>
                  <th style={{padding:"8px 8px",textAlign:"right",fontWeight:700,fontSize:isMobile?13:16,...colHl("markup","top")}}>Mark-up</th>
                  <th style={{padding:"8px 8px",textAlign:"right",fontWeight:700,fontSize:isMobile?13:16,...colHl("benchmark","top")}}>Benchmark<span style={{display:"block",fontSize:10,fontWeight:400,opacity:0.7,marginTop:0.5}}>(tCO₂e/t • wt. avg.)</span></th>
                  <th style={{padding:"8px 8px",textAlign:"right",fontWeight:700,fontSize:isMobile?13:16,...colHl("cbamFactor","top")}}>CBAM factor</th>
                  <th style={{padding:"8px 8px",textAlign:"right",fontWeight:700,fontSize:isMobile?13:16,borderLeft:`3px solid rgba(125,206,218,0.3)`,background:"rgba(52,131,151,0.4)"}}>{cbamColumnLabel}</th>
                </tr>
              </thead>
              <tbody>
                {displayTableRows.map((r,i)=>{
                  const isLast=i===displayTableRows.length-1;
                  const pos=isLast?"bot":"mid";
                  return(
                  <tr key={r.sec} tabIndex={0} role="button" aria-label={`Open ${r.sec} sector detail`}
                    style={{background:i%2===0?N.white:N.tealPale,borderBottom:`1px solid ${N.tealLight}`,cursor:"pointer"}}
                    onClick={()=>(setModalJur("eu"),setSelectedSector(r.sec))}
                    onMouseEnter={()=>{clearTimeout(rowLeaveTimer.current);setHoveredRow(i);}} onMouseLeave={()=>{rowLeaveTimer.current=setTimeout(()=>setHoveredRow(null),80);}}
                    onKeyDown={e=>(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),(setModalJur("eu"),setSelectedSector(r.sec)))}>
                    <td style={{padding:isMobile?"9px 8px":"9px 12px",fontSize:isMobile?14:17,fontWeight:800,color:SC[r.sec],borderLeft:`4px solid ${SC[r.sec]}`}}>
                      <span style={{display:"flex",alignItems:"center",overflow:"hidden",whiteSpace:"nowrap"}}>
                        <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{r.sec}</span>
                        <span style={{flexShrink:0,opacity:hoveredRow===i?1:0,transition:"opacity 0.15s",fontSize:10,lineHeight:1,marginLeft:5,color:SC[r.sec]}} aria-hidden="true">▶︎</span>
                      </span>
                    </td>
                    <td style={{padding:"9px 8px",textAlign:"right",fontSize:isMobile?13:16,fontWeight:700,color:N.teal900,fontVariantNumeric:"tabular-nums",...colHl("tonnes",pos)}}>{fmtT(r.displayTonnes)}</td>
                    <td style={{padding:"9px 8px",color:N.teal800,textAlign:"right",...colHl("dv",pos)}}>
                      {isMobile?(
                        <span style={{fontSize:13,fontWeight:700,color:N.teal900,fontVariantNumeric:"tabular-nums"}}>{r.wDv>0?r.wDv.toFixed(3):"—"}</span>
                      ):(
                        <span style={{display:"inline-grid",gridTemplateColumns:"92px 52px",alignItems:"center",columnGap:4,whiteSpace:"nowrap"}}>
                          <DefaultValueMeter value={r.wDv} extreme={r.sec==="Hydrogen"}/>
                          <span style={{fontSize:16,fontWeight:700,color:N.teal900,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{r.wDv>0?r.wDv.toFixed(3):"—"}</span>
                        </span>
                      )}
                    </td>
                    <td style={{padding:"9px 8px",textAlign:"right",fontSize:isMobile?13:16,fontWeight:700,color:N.teal800,...colHl("markup",pos)}}>{markupPct(r.sec)}</td>
                    <td style={{padding:"9px 8px",textAlign:"right",fontSize:isMobile?13:16,fontWeight:700,color:N.teal800,fontVariantNumeric:"tabular-nums",...colHl("benchmark",pos)}}>{r.wBmg>0?r.wBmg.toFixed(3):"—"}</td>
                    <td style={{padding:"9px 8px",textAlign:"right",fontSize:isMobile?13:16,fontWeight:700,color:N.teal800,...colHl("cbamFactor",pos)}}>{cbamFactorPct()}</td>
                    <td style={{padding:"9px 8px",textAlign:"right",fontSize:isMobile?13:16,fontWeight:800,color:N.teal800,borderLeft:`3px solid ${N.tealLight}`,background:"rgba(61,131,151,0.04)",fontVariantNumeric:"tabular-nums"}}>{fmtM(r.displayCbam)}</td>
                  </tr>
                  );
                })}
                <tr style={{background:N.teal900,color:N.white,fontWeight:700}}>
                  <td colSpan={6} style={{padding:"9px 12px",fontSize:16,textAlign:"right",color:N.tealMid,borderLeft:`4px solid ${N.teal900}`}}>Total</td>
                  <td style={{padding:"9px 8px",textAlign:"right",fontSize:16,borderLeft:`3px solid rgba(125,206,218,0.25)`,fontVariantNumeric:"tabular-nums"}}>{fmtM(displayTableCbamTotal)}</td>
                </tr>
              </tbody>
            </table>
            )}
          </div>
          <div style={{padding:"6px 16px 8px",fontFamily:SANS,fontSize:12,color:N.tealMid}}>
            {confirmedViewActive&&<span style={{color:N.tealMid,fontWeight:600,marginRight:6}}>Confirmed Comext data: Jan 2026 – {confirmedMonthLabel}.</span>}
            Click any sector row for CN-code breakdown. Hover the line chart to shift the data display by year.
            {incEU&&" EU baseline: Eurostat Comext 2022–2025 avg for Iron & Steel, Aluminum, Cement, and Fertilizers; U.S. Census Bureau export avg for Hydrogen."}
            {incUK&&` UK baseline: HMRC-recorded UK imports from the U.S., 2022–2025 avg, across all 570 UK CBAM codes. UK default values already include the mark-up.`}
          </div>
        </div>

        {/* FORMULA */}
        <div style={{background:N.teal900,padding:isMobile?"24px 16px 60px":"32px 28px 72px",position:"relative"}}>
          <div style={{fontFamily:SANS,fontSize:12,fontWeight:700,letterSpacing:"0.12em",color:N.teal400,textTransform:"uppercase",marginBottom:16}}>{view==="combined"?"CBAM Cost Formulas":"CBAM Cost Formula"}</div>
          {incEU&&view==="combined"&&<div style={{fontFamily:SANS,fontSize:11,fontWeight:700,color:N.tealMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>EU CBAM</div>}
          {incEU&&<div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:"10px 8px",userSelect:"none"}} onMouseLeave={()=>termLeave(setHovered)}>
            <span style={{fontFamily:SERIF,fontSize:"clamp(14px,2vw,24px)",fontWeight:700,color:N.teal200}}>CBAM Cost ($)</span>
            <span style={{fontFamily:SANS,fontSize:18,color:N.tealMid,fontWeight:300}}>=</span>
            <Term id="tonnes" label="Exported metric tons" hovered={hovered} setHovered={setHovered} pinnedTerm={pinnedTerm} setPinnedTerm={setPinnedTerm} color={N.teal400}/>
            <span style={{fontFamily:SANS,fontSize:18,color:N.tealMid,fontWeight:300}}>×</span>
            <span style={{fontFamily:SERIF,fontSize:"clamp(20px,2.5vw,32px)",color:N.tealMid,fontWeight:300,lineHeight:1}}>(</span>
            <Term id="dv" label="Default value (tCO₂e/t)" hovered={hovered} setHovered={setHovered} pinnedTerm={pinnedTerm} setPinnedTerm={setPinnedTerm} color={N.teal400}/>
            <span style={{fontFamily:SANS,fontSize:18,color:N.tealMid,fontWeight:300}}>×</span>
            <Term id="markup" label="(1 + Mark-up)" hovered={hovered} setHovered={setHovered} pinnedTerm={pinnedTerm} setPinnedTerm={setPinnedTerm} color={N.teal400}/>
            <span style={{fontFamily:SANS,fontSize:18,color:N.tealMid,fontWeight:300}}>−</span>
            <Term id="benchmark" label="Benchmark" hovered={hovered} setHovered={setHovered} pinnedTerm={pinnedTerm} setPinnedTerm={setPinnedTerm} color={N.teal400}/>
            <span style={{fontFamily:SANS,fontSize:18,color:N.tealMid,fontWeight:300}}>×</span>
            <Term id="cbamFactor" label="CBAM factor" hovered={hovered} setHovered={setHovered} pinnedTerm={pinnedTerm} setPinnedTerm={setPinnedTerm} color={N.teal400}/>
            <span style={{fontFamily:SERIF,fontSize:"clamp(20px,2.5vw,32px)",color:N.tealMid,fontWeight:300,lineHeight:1}}>)</span>
            <span style={{fontFamily:SANS,fontSize:18,color:N.tealMid,fontWeight:300}}>×</span>
            <span
              tabIndex={0} role="button" aria-pressed={hovered==="ets"||pinnedTerm==="ets"} aria-label="EU ETS carbon price"
              onMouseEnter={()=>termEnter("ets",setHovered)}
              onFocus={()=>termEnter("ets",setHovered)} onBlur={()=>termLeave(setHovered)}
              onClick={()=>setPinnedTerm(p=>p==="ets"?null:"ets")}
              style={{display:"inline-flex",alignItems:"center",minHeight:32,cursor:"pointer",fontFamily:SERIF,fontSize:"clamp(14px,2vw,24px)",fontWeight:700,lineHeight:1.1,color:(hovered==="ets"||pinnedTerm==="ets")?N.white:N.orange400,background:(hovered==="ets"||pinnedTerm==="ets")?"rgba(241,125,58,0.18)":"rgba(241,125,58,0.1)",borderRadius:4,padding:"4px 10px",border:`2px solid ${N.orange400}`}}>
              €{ets.toFixed(1)}/tCO₂e
            </span>
            <span style={{fontFamily:SANS,fontSize:18,color:N.tealMid,fontWeight:300}}>×</span>
            <Term id="fxrate" label="$1.13 / €" hovered={hovered} setHovered={setHovered} pinnedTerm={pinnedTerm} setPinnedTerm={setPinnedTerm} color={N.teal400}/>
          </div>}
          {incUK&&(()=>{
            const T=(id,label)=><Term id={id} label={label} hovered={hovered} setHovered={setHovered} pinnedTerm={pinnedTerm} setPinnedTerm={setPinnedTerm} color={N.teal400}/>;
            const op=s=><span style={{fontFamily:SANS,fontSize:18,color:N.tealMid,fontWeight:300}}>{s}</span>;
            const br=s=><span style={{fontFamily:SERIF,fontSize:"clamp(20px,2.5vw,32px)",color:N.tealMid,fontWeight:300,lineHeight:1}}>{s}</span>;
            const ukActive=hovered==="ukPrice"||pinnedTerm==="ukPrice";
            return(<>
              {view==="combined"&&<div style={{fontFamily:SANS,fontSize:11,fontWeight:700,color:N.tealMid,letterSpacing:"0.08em",textTransform:"uppercase",margin:"20px 0 8px"}}>UK CBAM (from January 2027)</div>}
              <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:"10px 8px",userSelect:"none"}} onMouseLeave={()=>termLeave(setHovered)}>
                <span style={{fontFamily:SERIF,fontSize:"clamp(14px,2vw,24px)",fontWeight:700,color:N.teal200}}>{view==="combined"?"UK cost ($)":"CBAM Cost ($)"}</span>
                {op("=")}{T("ukTonnes","Imported metric tons")}{op("×")}{T("ukDv","Default value incl. mark-up")}{op("×")}
                <span tabIndex={0} role="button" aria-pressed={ukActive} aria-label="UK ETS price"
                  onMouseEnter={()=>termEnter("ukPrice",setHovered)} onFocus={()=>termEnter("ukPrice",setHovered)} onBlur={()=>termLeave(setHovered)}
                  onClick={()=>setPinnedTerm(p=>p==="ukPrice"?null:"ukPrice")}
                  style={{display:"inline-flex",alignItems:"center",minHeight:32,cursor:"pointer",fontFamily:SERIF,fontSize:"clamp(14px,2vw,24px)",fontWeight:700,lineHeight:1.1,color:ukActive?N.white:N.orange400,background:ukActive?"rgba(241,125,58,0.18)":"rgba(241,125,58,0.1)",borderRadius:4,padding:"4px 10px",border:`2px solid ${N.orange400}`}}>
                  £{ukPrice.toFixed(2)}/tCO₂e
                </span>
                {op("×")}{br("[")}{op("1 −")}{T("ukFa","Free allocation %")}{op("×")}{T("ukPhase","Phase-out factor")}{br("]")}{op("×")}{T("ukFx",`$${UK.GBP_USD.toFixed(2)} / £`)}
              </div>
            </>);
          })()}
          <div style={{marginTop:16,borderTop:`1px solid rgba(255,255,255,0.1)`,paddingTop:12,minHeight:76,fontFamily:SANS}}>
            {(()=>{const active=hovered||pinnedTerm;return active&&TERM_DEFS[active]?(
              <div>
                <div style={{fontSize:11,color:N.teal400,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>{TERM_DEFS[active].title}</div>
                <div style={{fontSize:13,color:N.tealLight,lineHeight:1.55,maxWidth:700}}>{TERM_DEFS[active].def}</div>
                <div style={{fontSize:11,color:N.tealMid,marginTop:6}}>{TERM_DEFS[active].source}</div>
              </div>
            ):(
              <div style={{fontSize:13,color:N.tealMid,fontStyle:"italic"}}>{isMobile?"Tap":"Hover"} a term to preview its definition. Click to keep it open.</div>
            );})()}
          </div>
        </div>

      </div>

      {selectedSector&&modalJur==="eu"&&<SectorModal sec={selectedSector} ets={ets} liveEntries={mergedTrade} onClose={()=>setSelectedSector(null)} dataset={DS}
        onSwitch={view==="combined"?()=>setModalJur("uk"):null}/>}
      {selectedSector&&modalJur==="uk"&&<UkSectorModal sec={selectedSector} ukPrice={ukPrice} ukRates={ukRates} onClose={()=>setSelectedSector(null)}
        onSwitch={view==="combined"?()=>setModalJur("eu"):null}/>}
    </>
  );
}
