export const SECTORS_LIST = ["Iron & Steel", "Aluminum", "Cement", "Fertilizers", "Hydrogen"];

function eu(v) {
  if (v == null || v === "–" || v === "" || v === "see below" || v === "N/A") return null;
  const s = String(v).trim().replace(/\s/g, "");
  if (!s || s === "–") return null;
  return parseFloat(s.replace(",", "."));
}

// Raw CBAM default value data from EU IR 2025/2621 Annex I, as replaced by
// Correcting Regulation (EU) 2026/1740 (OJ L, 31.7.2026; in force 3.8.2026,
// applies retroactively from 1 Jan 2026). No US default value changed in the
// correction; CN/TARIC codes, descriptions and production routes updated:
//   - 2507 00 80 -> TARIC 2507008080 (calcined kaolinic clay only), route dropped
//   - 2523 10 00 -> TARIC 2523100010 (white) / 2523100090 (grey/other)
//   - 2523 90 00 -> TARIC 2523900010 (white) / 2523900090 (grey/other)
//   - 7205 route (C) -> (C)/(F)
// The 2026/27/28 mark-up columns were deleted from the regulation (recital 10);
// marked-up values are computed below from the total, as the CBAM Registry does.
// Columns: [CN/TARIC code, description, sector, direct, indirect, total, route]
export const CBAM_DEFAULT_VALUE_ROWS = [
  ["2507008080","Calcined clay","Cement","0,220","0,090","0,310",""],
  ["2523100010","White clinker","Cement","1,320","0,050","1,370","B"],
  ["2523100090","Grey/other clinker","Cement","1,160","0,030","1,190","A"],
  ["2523 21 00","White Portland cement","Cement","1,240","0,140","1,380",""],
  ["2523 29 00","Grey Portland cement","Cement","1,160","0,060","1,210",""],
  ["2523900010","White hydraulic cement","Cement","1,290","0,160","1,450","B"],
  ["2523900090","Grey/other hydraulic cements","Cement","1,100","0,060","1,160","A"],
  ["2523 30 00","Aluminous cement","Cement","1,800","0,140","1,940",""],
  ["2808 00 00","Nitric acid","Fertilizers","1,870","0,030","1,900",""],
  ["2814 10 00","Anhydrous ammonia","Fertilizers","3,320","0,090","3,410",""],
  ["2814 20 00","Ammonia in aqueous solution","Fertilizers","1","0,030","1,020",""],
  ["2834 21 00","Nitrate of potassium","Fertilizers","1,860","0,040","1,910",""],
  ["3102 10 12","Urea aq. sol. >45%N, 31.8–33.2%","Fertilizers","0,740","0,020","0,760",""],
  ["3102 10 15","Urea aq. sol. >45%N, 33.2–55%","Fertilizers","1,220","0,020","1,240",""],
  ["3102 10 19","Urea >45%N solid","Fertilizers","2,220","0,070","2,290",""],
  ["3102 10 90","Urea ≤45%N","Fertilizers","2,170","0,070","2,240",""],
  ["3102 21 00","Ammonium sulphate","Fertilizers","0,970","0,060","1,030",""],
  ["3102 29 00","Double salts: ammonium sulphate/nitrate","Fertilizers","1,460","0,060","1,530",""],
  ["3102 30 10","Ammonium nitrate aqueous","Fertilizers","1,430","0,050","1,470",""],
  ["3102 30 90","Ammonium nitrate solid","Fertilizers","2,190","0,070","2,270",""],
  ["3102 40 10","AN+CaCO₃ ≤28%N","Fertilizers","1,910","0,070","1,980",""],
  ["3102 40 90","AN+CaCO₃ >28%N","Fertilizers","1,910","0,070","1,980",""],
  ["3102 50 00","Sodium nitrate","Fertilizers","2,920","0,050","2,970",""],
  ["3102 60 00","Calcium nitrate/ammonium nitrate mix","Fertilizers","1,840","0,060","1,910",""],
  ["3102 80 00","UAN solution","Fertilizers","1,680","0,060","1,740",""],
  ["3102 90 00","Other N-fertilizers","Fertilizers","1,950","0,070","2,020",""],
  ["3105 10 00","NPK packaged ≤10kg","Fertilizers","0,900","0,060","0,960",""],
  ["3105 20 10","NPK >10%N","Fertilizers","1","0,070","1,060",""],
  ["3105 20 90","NPK ≤10%N","Fertilizers","0,680","0,050","0,740",""],
  ["3105 30 00","DAP","Fertilizers","0,780","0,040","0,820",""],
  ["3105 40 00","MAP","Fertilizers","0,500","0,030","0,530",""],
  ["3105 51 00","NP nitrates+phosphates","Fertilizers","1,340","0,090","1,420",""],
  ["3105 59 00","NP other","Fertilizers","0,900","0,100","1,010",""],
  ["3105 90 20","NK >10%N","Fertilizers","1,280","0,050","1,340",""],
  ["3105 90 80","NK ≤10%N","Fertilizers","0,670","0,040","0,710",""],
  ["7601","Unwrought aluminium","Aluminum","1,700",null,"1,700","K"],
  ["7603","Al powders and flakes","Aluminum","2,032",null,"2,032","K"],
  ["7604 10 10","Al bars and rods","Aluminum","2,258",null,"2,258","K"],
  ["7604 10 90","Al profiles","Aluminum","2,278",null,"2,278","K"],
  ["7604 21 00","Al hollow profiles","Aluminum","2,278",null,"2,278","K"],
  ["7604 29 10","Al bars and rods (other)","Aluminum","2,258",null,"2,258","K"],
  ["7604 29 90","Al profiles (other)","Aluminum","2,278",null,"2,278","K"],
  ["7605","Aluminum wire","Aluminum","2,258",null,"2,258","K"],
  ["7606","Al plates, sheets, strip >0.2mm","Aluminum","2,730",null,"2,730","K"],
  ["7607","Aluminum foil ≤0.2mm","Aluminum","2,730",null,"2,730","K"],
  ["7608","Aluminum tubes and pipes","Aluminum","2,278",null,"2,278","K"],
  ["7609 00 00","Al tube/pipe fittings","Aluminum","2,278",null,"2,278","K"],
  ["7610 10 00","Al doors, windows, frames","Aluminum","2,278",null,"2,278","K"],
  ["7611 00 00","Al reservoirs/tanks >300L","Aluminum","2,730",null,"2,730","K"],
  ["7612","Al casks, drums, cans ≤300L","Aluminum","2,730",null,"2,730","K"],
  ["7613 00 00","Al containers compressed gas","Aluminum","2,730",null,"2,730","K"],
  ["7614","Al stranded wire, cables","Aluminum","2,258",null,"2,258","K"],
  ["7616 10 00","Al nails, screws, nuts","Aluminum","2,730",null,"2,730","K"],
  ["7616 91 00","Al cloth, grill, netting","Aluminum","2,730",null,"2,730","K"],
  ["7616 99 10","Al cast articles","Aluminum","2,032",null,"2,032","K"],
  ["7616 99 90","Other Al articles","Aluminum","2,730",null,"2,730","K"],
  ["2804 10 00","Hydrogen","Hydrogen","26,640",null,"26,640",""],
  ["2601 12 00","Agglomerated iron ores","Iron & Steel","0,660","0,020","0,680",""],
  ["7201","Pig iron","Iron & Steel","1,210",null,"1,210",""],
  ["7202 11","Ferro-manganese >2%C","Iron & Steel","1,690",null,"1,690",""],
  ["7202 41","Ferro-chromium >4%C","Iron & Steel","2,350",null,"2,350",""],
  ["7202 60 00","Ferro-nickel","Iron & Steel","3,480",null,"3,480",""],
  ["7203","DRI products","Iron & Steel","0,450",null,"0,450",""],
  ["7205","Granules/powders pig iron","Iron & Steel","2,425",null,"2,425","C/F"],
  ["7206 10 00","Steel ingots","Iron & Steel","1,330",null,"1,330","C"],
  ["7208","HR flat-rolled ≥600mm","Iron & Steel","1,400",null,"1,400","C"],
  ["7209","CR flat-rolled ≥600mm","Iron & Steel","1,440",null,"1,440","C"],
  ["7210","Flat-rolled ≥600mm coated","Iron & Steel","1,440",null,"1,440","C"],
  ["7211 13 00","Wide flats 150–600mm","Iron & Steel","1,400",null,"1,400","C"],
  ["7212","Flat-rolled <600mm coated","Iron & Steel","1,440",null,"1,440","C"],
  ["7213","Bars and rods HR in coils","Iron & Steel","1,390",null,"1,390","C"],
  ["7214 20 00","Rebars","Iron & Steel","1,390",null,"1,390","C"],
  ["7215","Bars and rods, cold-formed","Iron & Steel","1,390",null,"1,390","C"],
  ["7216","Angles, shapes and sections","Iron & Steel","1,390",null,"1,390","C"],
  ["7217 10","Wire, uncoated","Iron & Steel","1,390",null,"1,390","C"],
  ["7217 20","Wire, zinc-coated","Iron & Steel","1,390",null,"1,390","C"],
  ["7218 10 00","SS ingots","Iron & Steel","3,110",null,"3,110",""],
  ["7219 11 00","SS flat-rolled ≥600mm HR","Iron & Steel","3,220",null,"3,220",""],
  ["7219 31 00","SS flat-rolled ≥600mm CR","Iron & Steel","3,270",null,"3,270",""],
  ["7221","SS bars/rods HR in coils","Iron & Steel","3,270",null,"3,270",""],
  ["7223 00","SS wire in coils","Iron & Steel","3,270",null,"3,270",""],
  ["7224 10","Alloy steel ingots","Iron & Steel","3,490",null,"3,490","F"],
  ["7225 11 00","Si-elec. steel GO ≥600mm","Iron & Steel","4,730",null,"4,730","C"],
  ["7225 30","Alloy steel HR ≥600mm coils","Iron & Steel","3,590",null,"3,590","F"],
  ["7225 50","Alloy steel CR ≥600mm","Iron & Steel","3,640",null,"3,640","F"],
  ["7301","Sheet piling","Iron & Steel","1,440",null,"1,440","C"],
  ["7302","Railway track material","Iron & Steel","2,740",null,"2,740","C"],
  ["7303 00","Cast iron tubes/pipes","Iron & Steel","1,850",null,"1,850",""],
  ["7304 19","Seamless line pipe non-SS","Iron & Steel","1,974",null,"1,974","C"],
  ["7304 39","Seamless circular tubes HR","Iron & Steel","1,974",null,"1,974","C"],
  ["7305","Large-diameter welded pipes","Iron & Steel","1,440",null,"1,440","C"],
  ["7306 19 00","Welded line pipe non-SS","Iron & Steel","1,440",null,"1,440","C"],
  ["7306 30 80","Welded tubes 168–406mm","Iron & Steel","1,440",null,"1,440","C"],
  ["7307 21 00","SS flanges","Iron & Steel","2,800",null,"2,800",""],
  ["7307 91 00","Flanges non-SS","Iron & Steel","1,410",null,"1,410","C"],
  ["7308","Steel structures","Iron & Steel","2,900",null,"2,900","C"],
  ["7309","Steel tanks >300L","Iron & Steel","3,190",null,"3,190","C"],
  ["7310","Steel tanks ≤300L","Iron & Steel","1,440",null,"1,440","C"],
  ["7311 00","Steel containers compressed gas","Iron & Steel","3,730",null,"3,730","C"],
  ["7318 15","Threaded screws and bolts","Iron & Steel","2,580",null,"2,580","C"],
  ["7318 16","Nuts","Iron & Steel","3,030",null,"3,030","C"],
  ["7318 22 00","Washers","Iron & Steel","1,830",null,"1,830","C"],
  ["7318 23 00","Rivets","Iron & Steel","1,680",null,"1,680","C"],
  ["7326 90 98","Articles of iron/steel NES","Iron & Steel","1,440",null,"1,440","C"],
];

export const CN_MAP = {
  // New TARIC row codes (Reg 2026/1740) -> 8-digit Comext trade keys.
  // White cement variants are deliberately unmapped: 8-digit trade flows are
  // attributed to the grey/other rows (predominant in US exports), so the
  // white rows display regulation values but carry no tonnage.
  "2507008080":"25070080","2523100090":"25231000","2523900090":"25239000",
  "25070080":"25070080","25231000":"25231000","25232100":"25232100",
  "25232900":"25232900","25233000":"25233000","25239000":"25239000",
  "28080000":"28080000","28141000":"28141000","28142000":"28142000",
  "28342100":"28342100",
  "31021012":"31021012","31021015":"31021015","31021019":"31021019",
  "31021090":"31021090","31022100":"31022100","31022900":"31022900",
  "31023010":"31023010","31023090":"31023090","31024010":"31024010",
  "31024090":"31024090","31025000":"31025000","31026000":"31026000",
  "31028000":"31028000","31029000":"31029000","31051000":"31051000",
  "31052010":"31052010","31052090":"31052090","31053000":"31053000",
  "31054000":"31054000","31055100":"31055100","31055900":"31055900",
  "31059020":"31059020","31059080":"31059080",
  "7601":"7601","7603":"7603",
  "76041010":"76041010","76041090":"76041090","76042100":"76042100",
  "76042910":"76042910","76042990":"76042990",
  "7605":"7605","7606":"7606","7607":"7607","7608":"7608",
  "76090000":"76090000","76101000":"76101000","76110000":"76110000",
  "7612":"7612","76130000":"76130000","7614":"7614",
  "76161000":"76161000","76169100":"76169100",
  "76169910":"76169910","76169990":"76169990",
  "76091000":"76090000",
  "76100000":"76101000",
  "28041000":"28041000",
  "26011200":"26011200",
  "7201":"7201","720211":"720211","720241":"720241",
  "72026000":"72026000","7203":"7203","7205":"7205",
  "72061000":"72061000","7208":"7208","7209":"7209","7210":"7210",
  "72111300":"72111300","7212":"7212","7213":"7213",
  "72142000":"72142000","7215":"7215","7216":"7216",
  "721710":"721710","721720":"721720",
  "72181000":"72181000","72191100":"72191100","72193100":"72193100",
  "7221":"7221","722300":"722300","722410":"722410",
  "72251100":"72251100","722530":"722530","722550":"722550",
  "7301":"7301","7302":"7302","7303":"7303",
  "730419":"730419","730439":"730439","7305":"7305",
  "73061900":"73061900","73063080":"73063080",
  "73072100":"73072100","73079100":"73079100",
  "7308":"7308","7309":"7309","7310":"7310",
  "731100":"731100","731815":"731815","731816":"731816",
  "73182200":"73182200","73182300":"73182300",
  "73269098":"73269098",
  "72021100":"720211","72024100":"720241",
  "72141000":"72142000",
  "72171000":"721710","72172000":"721720",
  "72230000":"722300","72241000":"722410",
  "72253000":"722530","72255000":"722550",
  "73030000":"7303","73041900":"730419","73043900":"730439",
  "73110000":"731100","73181500":"731815","73181600":"731816",
};

// Mark-up factors per Annex I opening of Reg (EU) 2026/1740: 10/20/30% for
// cement, iron & steel, aluminium and hydrogen in 2026/2027/2028+, 1% for
// fertilizers throughout. Applied to the published 3-decimal total, as the
// CBAM Registry does (the printed mark-up columns were deleted by the correction).
const MARKUP = { 2026: 1.1, 2027: 1.2, 2028: 1.3 };
const markupFactor = (sector, year) => (sector === "Fertilizers" ? 1.01 : MARKUP[year]);
const mv = (total, sector, year) =>
  total == null ? null : Math.round(total * markupFactor(sector, year) * 1000) / 1000;

export const CBAM_DATA = CBAM_DEFAULT_VALUE_ROWS.map(r => {
  const total = eu(r[5]);
  return {
    cn: r[0],
    desc: r[1],
    sector: r[2],
    direct: eu(r[3]),
    indirect: eu(r[4]),
    total,
    mv2026: mv(total, r[2], 2026),
    mv2027: mv(total, r[2], 2027),
    mv2028: mv(total, r[2], 2028),
    route: r[6],
  };
});

export const RELEVANT = CBAM_DATA.filter(d => d.mv2026 != null);
