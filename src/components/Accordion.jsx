import React, { useState } from "react";
import { N, SANS } from "../styles/tokens.js";

export default function Accordion({ items }) {
  const [open, setOpen] = useState(null);
  return items.map((it, i) => (
    <div key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.1)`, marginBottom: 2 }}>
      <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "12px 0", fontFamily: SANS, fontSize: 15, fontWeight: 600, color: N.tealLight, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {it.q}<span style={{ fontSize: 18, color: N.teal400, lineHeight: 1 }}>{open === i ? "−" : "+"}</span>
      </button>
      {open === i && <div style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.7, color: N.tealMid, paddingBottom: 14 }}>{it.a}</div>}
    </div>
  ));
}
