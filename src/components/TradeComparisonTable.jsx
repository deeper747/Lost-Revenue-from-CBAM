import React, { useState, useMemo, useRef, useEffect } from "react";
import { TRADE } from "../data/tradeData.js";
import { RELEVANT, SECTORS_LIST } from "../data/cbamDefaultValues.js";
import { trKey, avgMonthEur, MONTH_NAMES } from "../lib/cbamCalculations.js";
import { fmtM, pct } from "../lib/formatters.js";
import { EUR_USD } from "../config/publicationConfig.js";
import { N, SANS, SECTOR_COLORS as SC } from "../styles/tokens.js";
import { useComextData } from "../context/ComextDataContext.jsx";

function JanFebHeaderCell({children,right,dim,accent,color}){
  return(
    <th style={{padding:"6px 8px",textAlign:right?"right":"left",fontWeight:700,fontSize:12,
      color:accent?color:dim?N.tealMid:N.teal900,whiteSpace:"nowrap"}}>{children}</th>
  );
}

function JanFebModal({sec,mergedTrade,confirmedMos,rangeLabel,onClose}){
  const color=SC[sec]||N.teal600;
  const closeRef=useRef(null);
  useEffect(()=>{if(closeRef.current)closeRef.current.focus();},[]);
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    document.addEventListener("keydown",h);
    return()=>document.removeEventListener("keydown",h);
  },[onClose]);

  const cns=useMemo(()=>RELEVANT.filter(d=>d.sector===sec),[sec]);

  const monthRows=useMemo(()=>confirmedMos.map(mo=>{
    let avg=0,y25=0,y26=0;
    for(const d of cns){
      const k=trKey(d.cn);
      avg+=avgMonthEur(d.cn,mo)*EUR_USD;
      y25+=(TRADE[k]?.["2025-"+mo]?.[1]??0)*EUR_USD;
      y26+=(mergedTrade?.[k]?.["2026-"+mo]?.[1]??0)*EUR_USD;
    }
    return{label:MONTH_NAMES[parseInt(mo)-1],avg,y25,y26,
      vs26avg:avg>0?(y26-avg)/avg*100:null,
      vs25avg:avg>0?(y25-avg)/avg*100:null,
      vs2625:y25>0?(y26-y25)/y25*100:null};
  }),[mergedTrade,confirmedMos,cns]);

  const cnRows=useMemo(()=>cns.map(d=>{
    const k=trKey(d.cn);
    let avg=0,y25=0,y26=0;
    for(const mo of confirmedMos){
      avg+=avgMonthEur(d.cn,mo)*EUR_USD;
      y25+=(TRADE[k]?.["2025-"+mo]?.[1]??0)*EUR_USD;
      y26+=(mergedTrade?.[k]?.["2026-"+mo]?.[1]??0)*EUR_USD;
    }
    return{cn:d.cn,desc:d.desc,avg,y25,y26,
      vs26avg:avg>0?(y26-avg)/avg*100:null,
      vs25avg:avg>0?(y25-avg)/avg*100:null,
      vs2625:y25>0?(y26-y25)/y25*100:null};
  }).filter(r=>r.avg>0||r.y25>0||r.y26>0).sort((a,b)=>b.y25-a.y25),[mergedTrade,confirmedMos,cns]);

  const totAvg=monthRows.reduce((s,r)=>s+r.avg,0);
  const tot25=monthRows.reduce((s,r)=>s+r.y25,0);
  const tot26=monthRows.reduce((s,r)=>s+r.y26,0);
  const hasLive=mergedTrade&&tot26>0;

  const pctCell=(v)=><td style={{padding:"6px 8px",textAlign:"right",fontSize:12,fontVariantNumeric:"tabular-nums",
    color:v!=null?(v>=0?N.green600:N.orange500):N.tealMid}}>{pct(v)}</td>;

  return(
    <div role="dialog" aria-modal="true" aria-label={`${sec} ${rangeLabel} breakdown`}
      style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",background:"rgba(12,42,48,0.82)",padding:"32px 16px",overflowY:"auto"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:N.white,borderRadius:8,width:"100%",maxWidth:680,boxShadow:"0 24px 64px rgba(0,0,0,0.45)",flexShrink:0}}>
        <div style={{background:color,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"8px 8px 0 0"}}>
          <div>
            <div style={{fontFamily:SANS,fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"rgba(255,255,255,0.7)",textTransform:"uppercase"}}>{rangeLabel} Trade Value · Monthly Detail</div>
            <div style={{fontFamily:SANS,fontSize:20,fontWeight:800,color:N.white,marginTop:2}}>{sec}</div>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close"
            style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:4,color:N.white,fontFamily:SANS,fontSize:14,fontWeight:700,cursor:"pointer",padding:"6px 14px"}}>
            ✕ Close
          </button>
        </div>

        <div style={{padding:"20px 20px 8px"}}>
          <div style={{fontFamily:SANS,fontSize:11,fontWeight:700,color:N.tealMid,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>By month</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontFamily:SANS,fontSize:14}}>
              <thead>
                <tr style={{background:N.tealPale}}>
                  <JanFebHeaderCell color={color}>Month</JanFebHeaderCell>
                  <JanFebHeaderCell right dim color={color}>2022–25 Avg</JanFebHeaderCell>
                  <JanFebHeaderCell right color={color}>2025</JanFebHeaderCell>
                  {hasLive&&<JanFebHeaderCell right accent color={color}>2026</JanFebHeaderCell>}
                  <JanFebHeaderCell right dim color={color}>vs avg</JanFebHeaderCell>
                  {hasLive&&<JanFebHeaderCell right dim color={color}>vs 2025</JanFebHeaderCell>}
                </tr>
              </thead>
              <tbody>
                {monthRows.map((r,i)=>{
                  const vsVal=hasLive?r.vs26avg:r.vs25avg;
                  return(
                  <tr key={r.label} style={{background:i%2===0?N.white:N.tealPale,borderBottom:`1px solid ${N.tealLight}`}}>
                    <td style={{padding:"7px 8px",fontWeight:700,color:N.teal900}}>{r.label}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",color:N.tealMid}}>{fmtM(r.avg)}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:700}}>{fmtM(r.y25)}</td>
                    {hasLive&&<td style={{padding:"7px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:700,color}}>{fmtM(r.y26)}</td>}
                    {pctCell(vsVal)}
                    {hasLive&&pctCell(r.vs2625)}
                  </tr>
                );})}
                <tr style={{background:N.teal900,color:N.white,fontWeight:700}}>
                  <td style={{padding:"7px 8px"}}>{rangeLabel} total</td>
                  <td style={{padding:"7px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",color:N.tealMid}}>{fmtM(totAvg)}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{fmtM(tot25)}</td>
                  {hasLive&&<td style={{padding:"7px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",color:N.teal400}}>{fmtM(tot26)}</td>}
                  {(()=>{const base=hasLive?tot26:tot25;const d=totAvg>0?(base-totAvg)/totAvg*100:null;return pctCell(d);})()}
                  {hasLive&&(()=>{const d=tot25>0?(tot26-tot25)/tot25*100:null;return pctCell(d);})()}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {cnRows.length>0&&(
          <div style={{padding:"20px 20px 20px"}}>
            <div style={{fontFamily:SANS,fontSize:11,fontWeight:700,color:N.tealMid,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>By CN code ({rangeLabel} combined)</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontFamily:SANS,fontSize:13}}>
                <thead>
                  <tr style={{background:N.tealPale}}>
                    <th style={{padding:"6px 8px",textAlign:"left",fontWeight:700,fontSize:12,color:N.teal900}}>CN</th>
                    <th style={{padding:"6px 8px",textAlign:"left",fontWeight:700,fontSize:12,color:N.teal900}}>Description</th>
                    <th style={{padding:"6px 8px",textAlign:"right",fontWeight:700,fontSize:12,color:N.tealMid}}>Avg</th>
                    <th style={{padding:"6px 8px",textAlign:"right",fontWeight:700,fontSize:12,color:N.teal900}}>2025</th>
                    {hasLive&&<th style={{padding:"6px 8px",textAlign:"right",fontWeight:700,fontSize:12,color}}>2026</th>}
                    <th style={{padding:"6px 8px",textAlign:"right",fontWeight:700,fontSize:12,color:N.tealMid}}>vs avg</th>
                    {hasLive&&<th style={{padding:"6px 8px",textAlign:"right",fontWeight:700,fontSize:12,color:N.tealMid}}>vs '25</th>}
                  </tr>
                </thead>
                <tbody>
                  {cnRows.map((r,i)=>{
                    const vsVal=hasLive?r.vs26avg:r.vs25avg;
                    return(
                    <tr key={r.cn} style={{background:i%2===0?N.white:N.tealPale,borderBottom:`1px solid ${N.tealLight}`}}>
                      <td style={{padding:"6px 8px",fontFamily:"monospace",fontSize:12,color:N.teal800,whiteSpace:"nowrap"}}>{r.cn}</td>
                      <td style={{padding:"6px 8px",color:N.teal900,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.desc}>{r.desc}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",color:N.tealMid}}>{fmtM(r.avg)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:700}}>{fmtM(r.y25)}</td>
                      {hasLive&&<td style={{padding:"6px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:700,color}}>{fmtM(r.y26)}</td>}
                      <td style={{padding:"6px 8px",textAlign:"right",fontSize:12,fontVariantNumeric:"tabular-nums",color:vsVal!=null?(vsVal>=0?N.green600:N.orange500):N.tealMid}}>{pct(vsVal)}</td>
                      {hasLive&&<td style={{padding:"6px 8px",textAlign:"right",fontSize:12,fontVariantNumeric:"tabular-nums",color:r.vs2625!=null?(r.vs2625>=0?N.green600:N.orange500):N.tealMid}}>{pct(r.vs2625)}</td>}
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TradeComparisonTable(){
  const {liveData}=useComextData();
  const mergedTrade=useMemo(()=>liveData?.gotAny?liveData.entries:null,[liveData]);

  const [vw,setVw]=useState(typeof window!=="undefined"?window.innerWidth:1280);
  useEffect(()=>{
    const h=()=>setVw(window.innerWidth);
    window.addEventListener("resize",h);
    return()=>window.removeEventListener("resize",h);
  },[]);
  const isMobile=vw<640;

  const [open,setOpen]=useState(true);
  const [modalSec,setModalSec]=useState(null);
  const [hovRow,setHovRow]=useState(null);

  const confirmedMos=useMemo(()=>{
    if(!mergedTrade)return["01","02"];
    const yms=Object.values(mergedTrade).flatMap(m=>Object.keys(m)).filter(ym=>ym>="2026-01");
    if(!yms.length)return["01","02"];
    const lm=parseInt(yms.sort().at(-1).split("-")[1]);
    return Array.from({length:lm},(_,i)=>String(i+1).padStart(2,"0"));
  },[mergedTrade]);

  const rangeLabel=confirmedMos.length===1
    ?MONTH_NAMES[0]
    :`${MONTH_NAMES[0]}–${MONTH_NAMES[confirmedMos.length-1]}`;
  const title=`${rangeLabel} Trade Value Comparison`;

  const rows=useMemo(()=>SECTORS_LIST.map(sec=>{
    const cns=RELEVANT.filter(d=>d.sector===sec);
    let avg=0,y25=0,y26=0;
    for(const d of cns){
      const k=trKey(d.cn);
      for(const mo of confirmedMos){
        avg+=avgMonthEur(d.cn,mo)*EUR_USD;
        y25+=(TRADE[k]?.["2025-"+mo]?.[1]??0)*EUR_USD;
        y26+=(mergedTrade?.[k]?.["2026-"+mo]?.[1]??0)*EUR_USD;
      }
    }
    return{sec,avg,y25,y26,
      vs25avg:avg>0?(y25-avg)/avg*100:null,
      vs26avg:avg>0?(y26-avg)/avg*100:null,
      vs2625:y25>0?(y26-y25)/y25*100:null};
  }),[mergedTrade,confirmedMos]);

  const totAvg=rows.reduce((s,r)=>s+r.avg,0);
  const tot25=rows.reduce((s,r)=>s+r.y25,0);
  const tot26=rows.reduce((s,r)=>s+r.y26,0);
  const hasLive=mergedTrade&&tot26>0;

  return(
    <>
    <div style={{background:N.teal900}}>
      <button
        onClick={()=>setOpen(o=>!o)}
        aria-expanded={open}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",borderTop:`1px solid rgba(255,255,255,0.08)`,cursor:"pointer",padding:isMobile?"18px 16px":"20px 28px",textAlign:"left"}}>
        <span style={{fontFamily:SANS,fontSize:12,fontWeight:700,letterSpacing:"0.12em",color:N.teal400,textTransform:"uppercase"}}>{title}</span>
        <span style={{fontFamily:SANS,fontSize:14,color:N.tealMid,marginLeft:12,flexShrink:0}}>{open?"▲":"▼"}</span>
      </button>

      {open&&(
        <>
        <div style={{padding:isMobile?"0 16px 0":"0 28px 0",overflowX:"auto"}}>
          <table style={{width:"100%",minWidth:isMobile?480:700,borderCollapse:"collapse",fontFamily:SANS,fontSize:isMobile?13:14}}>
            <thead>
              <tr style={{background:"rgba(255,255,255,0.04)",color:N.white,verticalAlign:"bottom"}}>
                <th style={{padding:"7px 10px",textAlign:"left",fontWeight:700,borderLeft:`4px solid ${N.teal900}`}}>Sector</th>
                <th style={{padding:"7px 8px",textAlign:"right",fontWeight:700,color:N.tealMid}}>2022–25 Avg</th>
                <th style={{padding:"7px 8px",textAlign:"right",fontWeight:700}}>2025</th>
                {hasLive&&<th style={{padding:"7px 8px",textAlign:"right",fontWeight:700,color:N.teal400}}>2026 (actual)</th>}
                <th style={{padding:"7px 8px",textAlign:"right",fontWeight:600,color:N.tealMid,fontSize:12}}>vs avg</th>
                {hasLive&&<th style={{padding:"7px 8px",textAlign:"right",fontWeight:600,color:N.tealMid,fontSize:12}}>vs 2025</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>{
                const vsVal=hasLive?r.vs26avg:r.vs25avg;
                return(
                <tr key={r.sec} tabIndex={0} role="button" aria-label={`Open ${r.sec} monthly detail`}
                  style={{background:hovRow===i?"rgba(255,255,255,0.11)":i%2===0?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.02)",borderBottom:`1px solid rgba(255,255,255,0.07)`,cursor:"pointer"}}
                  onClick={()=>setModalSec(r.sec)}
                  onMouseEnter={()=>setHovRow(i)} onMouseLeave={()=>setHovRow(null)}
                  onKeyDown={e=>(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),setModalSec(r.sec))}>
                  <td style={{padding:"8px 10px",fontWeight:800,color:SC[r.sec],borderLeft:`4px solid ${SC[r.sec]}`}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                      {r.sec}
                      <span style={{opacity:hovRow===i?1:0,transition:"opacity 0.12s",fontSize:10,color:SC[r.sec]}} aria-hidden="true">▶︎</span>
                    </span>
                  </td>
                  <td style={{padding:"8px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:500,color:N.tealMid}}>{fmtM(r.avg)}</td>
                  <td style={{padding:"8px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:700,color:N.white}}>{fmtM(r.y25)}</td>
                  {hasLive&&<td style={{padding:"8px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:700,color:N.teal200}}>{fmtM(r.y26)}</td>}
                  <td style={{padding:"8px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontSize:13,color:vsVal!=null?(vsVal>=0?N.green600:N.orange500):N.tealMid}}>{pct(vsVal)}</td>
                  {hasLive&&<td style={{padding:"8px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontSize:13,color:r.vs2625!=null?(r.vs2625>=0?N.green600:N.orange500):N.tealMid}}>{pct(r.vs2625)}</td>}
                </tr>
              );})}
              <tr style={{background:"rgba(255,255,255,0.1)",color:N.white,fontWeight:700}}>
                <td style={{padding:"8px 10px",color:N.tealMid,borderLeft:`4px solid ${N.teal900}`}}>Total</td>
                <td style={{padding:"8px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",color:N.tealMid}}>{fmtM(totAvg)}</td>
                <td style={{padding:"8px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{fmtM(tot25)}</td>
                {hasLive&&<td style={{padding:"8px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums",color:N.teal200}}>{fmtM(tot26)}</td>}
                {(()=>{const base=hasLive?tot26:tot25;const diff=totAvg>0?(base-totAvg)/totAvg*100:null;return<td style={{padding:"8px 8px",textAlign:"right",fontSize:13,color:diff!=null?(diff>=0?N.green600:N.orange500):N.tealMid}}>{pct(diff)}</td>;})()}
                {hasLive&&(()=>{const diff=tot25>0?(tot26-tot25)/tot25*100:null;return<td style={{padding:"8px 8px",textAlign:"right",fontSize:13,color:diff!=null?(diff>=0?N.green600:N.orange500):N.tealMid}}>{pct(diff)}</td>;})()}
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{padding:isMobile?"6px 16px 20px":"6px 28px 20px",fontFamily:SANS,fontSize:12,color:N.tealMid}}>
          {rangeLabel} 2026 trade value (USD). {hasLive?`2026 from live Comext API (${rangeLabel} confirmed).`:"2026 data pending Comext release."} Average computed from 2022–2025. Click any row for monthly and CN-code detail.
        </div>
        </>
      )}
    </div>
    {modalSec&&<JanFebModal sec={modalSec} mergedTrade={mergedTrade} confirmedMos={confirmedMos} rangeLabel={rangeLabel} onClose={()=>setModalSec(null)}/>}
    </>
  );
}
