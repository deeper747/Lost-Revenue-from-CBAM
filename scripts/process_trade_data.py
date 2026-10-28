"""
Download Eurostat Comext trade data for all CBAM regulation CN codes (US → EU27).
Fetches monthly frequency so callers can aggregate any arbitrary time window
(Q1, YTD, specific months) without resorting to annual ÷ 4 approximations.

API notes:
  - Monthly endpoint (M.) with batched CN codes works reliably.
  - Flow 1 (imports) is specified in the URL path itself: M.EU27_2020.US.{codes}.1./
  - Value indicator on the monthly dataset is VALUE_IN_EUROS.
  - CN4/CN6/CN8 codes all work as query keys; API returns aggregate for that hierarchy level.

CN code level rule (for codes listed in IR 2025/2621 Annex I):
  - Codes are stored at their regulation digit level (4, 6, or 8 digits).
  - Trailing-zero padding to 8 digits is NOT used — querying "7601" returns all CN8 sub-codes.

Outputs:
  data/raw/comext_us_cbam_trade_by_month.csv   — one row per CN code, one col pair per month
  data/raw/trade_js_snippet.txt                — JS TRADE object literal for App.jsx
"""

import requests
import pandas as pd
from io import StringIO
import time
import json
import os

BASE_URL = "https://ec.europa.eu/eurostat/api/comext/dissemination/sdmx/2.1/data/DS-045409"
START_PERIOD = "2022-01"
END_PERIOD   = "2025-12"
BATCH_SIZE   = 10

# ── CBAM regulation CN codes (IR 2025/2621 Annex I) ─────────────────────────
# Stored at the regulation digit level (CN4, CN6, or CN8 as listed).
CBAM_CN_CODES = [
    # Cement
    ("25070080", "Cement"),
    ("25231000", "Cement"),
    ("25232100", "Cement"),
    ("25232900", "Cement"),
    ("25233000", "Cement"),
    ("25239000", "Cement"),
    # Fertilisers
    ("28080000", "Fertilisers"),
    ("28141000", "Fertilisers"),
    ("28142000", "Fertilisers"),
    ("28342100", "Fertilisers"),
    ("31021012", "Fertilisers"),
    ("31021015", "Fertilisers"),
    ("31021019", "Fertilisers"),
    ("31021090", "Fertilisers"),
    ("31022100", "Fertilisers"),
    ("31022900", "Fertilisers"),
    ("31023010", "Fertilisers"),
    ("31023090", "Fertilisers"),
    ("31024010", "Fertilisers"),
    ("31024090", "Fertilisers"),
    ("31025000", "Fertilisers"),
    ("31026000", "Fertilisers"),
    ("31028000", "Fertilisers"),
    ("31029000", "Fertilisers"),
    ("31051000", "Fertilisers"),
    ("31052010", "Fertilisers"),
    ("31052090", "Fertilisers"),
    ("31053000", "Fertilisers"),
    ("31054000", "Fertilisers"),
    ("31055100", "Fertilisers"),
    ("31055900", "Fertilisers"),
    ("31059020", "Fertilisers"),
    ("31059080", "Fertilisers"),
    # Aluminium — CN4 codes (API aggregates all sub-chapters)
    ("7601", "Aluminium"),
    ("7603", "Aluminium"),
    ("76041010", "Aluminium"),
    ("76041090", "Aluminium"),
    ("76042100", "Aluminium"),
    ("76042910", "Aluminium"),
    ("76042990", "Aluminium"),
    ("7605", "Aluminium"),
    ("7606", "Aluminium"),
    ("7607", "Aluminium"),
    ("7608", "Aluminium"),
    ("76090000", "Aluminium"),
    ("76101000", "Aluminium"),
    ("76110000", "Aluminium"),
    ("7612", "Aluminium"),
    ("76130000", "Aluminium"),
    ("7614", "Aluminium"),
    ("76161000", "Aluminium"),
    ("76169100", "Aluminium"),
    ("76169910", "Aluminium"),
    ("76169990", "Aluminium"),
    # Hydrogen
    ("28041000", "Hydrogen"),
    # Iron & Steel — mix of CN4, CN6, CN8
    ("26011200", "Iron & Steel"),
    ("7201", "Iron & Steel"),
    ("720211", "Iron & Steel"),
    ("720241", "Iron & Steel"),
    ("72026000", "Iron & Steel"),
    ("7203", "Iron & Steel"),
    ("7205", "Iron & Steel"),
    ("72061000", "Iron & Steel"),
    ("7208", "Iron & Steel"),
    ("7209", "Iron & Steel"),
    ("7210", "Iron & Steel"),
    ("72111300", "Iron & Steel"),
    ("7212", "Iron & Steel"),
    ("7213", "Iron & Steel"),
    ("72142000", "Iron & Steel"),
    ("7215", "Iron & Steel"),
    ("7216", "Iron & Steel"),
    ("721710", "Iron & Steel"),
    ("721720", "Iron & Steel"),
    ("72181000", "Iron & Steel"),
    ("72191100", "Iron & Steel"),
    ("72193100", "Iron & Steel"),
    ("7221", "Iron & Steel"),
    ("722300", "Iron & Steel"),
    ("722410", "Iron & Steel"),
    ("72251100", "Iron & Steel"),
    ("722530", "Iron & Steel"),
    ("722550", "Iron & Steel"),
    ("7301", "Iron & Steel"),
    ("7302", "Iron & Steel"),
    ("7303", "Iron & Steel"),
    ("730419", "Iron & Steel"),
    ("730439", "Iron & Steel"),
    ("7305", "Iron & Steel"),
    ("73061900", "Iron & Steel"),
    ("73063080", "Iron & Steel"),
    ("73072100", "Iron & Steel"),
    ("73079100", "Iron & Steel"),
    ("7308", "Iron & Steel"),
    ("7309", "Iron & Steel"),
    ("7310", "Iron & Steel"),
    ("731100", "Iron & Steel"),
    ("731815", "Iron & Steel"),
    ("731816", "Iron & Steel"),
    ("73182200", "Iron & Steel"),
    ("73182300", "Iron & Steel"),
    ("73269098", "Iron & Steel"),
]


def round_val(v):
    """Round to 3 decimal places for tonnes, 0 for EUR."""
    return v


def main():
    # Deduplicate codes
    seen = set()
    cn_entries = []
    for cn, sector in CBAM_CN_CODES:
        if cn not in seen:
            seen.add(cn)
            cn_entries.append((cn, sector))

    sector_map = {cn: sector for cn, sector in cn_entries}
    codes = [cn for cn, _ in cn_entries]
    print(f"Unique regulation codes to query: {len(codes)}")

    # Build month list for expected columns
    months = pd.period_range(START_PERIOD, END_PERIOD, freq="M").strftime("%Y-%m").tolist()
    print(f"Months: {months[0]} → {months[-1]} ({len(months)} months)")

    batches = [codes[i : i + BATCH_SIZE] for i in range(0, len(codes), BATCH_SIZE)]
    all_dfs = []

    for i, batch in enumerate(batches):
        batch_str = "+".join(batch)
        # Flow 1 = imports; monthly frequency (M.)
        url = f"{BASE_URL}/M.EU27_2020.US.{batch_str}.1./"
        print(f"  Batch {i+1}/{len(batches)}: {batch_str[:60]}", end=" ... ", flush=True)
        for attempt in range(3):
            try:
                r = requests.get(
                    url,
                    params={
                        "format": "SDMX-CSV",
                        "startPeriod": START_PERIOD,
                        "endPeriod": END_PERIOD,
                    },
                    timeout=90,
                )
                if r.ok:
                    df = pd.read_csv(StringIO(r.text))
                    all_dfs.append(df)
                    print(f"ok ({len(df)} rows)")
                    break
                print(f"HTTP {r.status_code}", end=" ")
                if r.status_code == 429:
                    time.sleep(10 * (attempt + 1))
                else:
                    break
            except Exception as e:
                print(f"error: {e}", end=" ")
            time.sleep(2)
        else:
            print("FAILED after 3 attempts")
        time.sleep(0.5)

    if not all_dfs:
        print("No data fetched — check network or API availability.")
        return

    df_all = pd.concat(all_dfs, ignore_index=True)
    print(f"\nTotal rows fetched: {len(df_all)}")
    print("Indicators found:", df_all["indicators"].unique())

    df_all["product"] = df_all["product"].astype(str)

    # Quantity: 100 kg → tonnes
    df_qty = df_all[df_all["indicators"] == "QUANTITY_IN_100KG"].copy()
    df_qty["tonnes"] = df_qty["OBS_VALUE"] / 10

    # Value: monthly dataset uses VALUE_IN_EUROS
    df_val = df_all[df_all["indicators"] == "VALUE_IN_EUROS"].copy()
    df_val["eur"] = df_val["OBS_VALUE"]

    # Pivot: rows = CN code, columns = YYYY-MM
    qty_wide = df_qty.pivot_table(index="product", columns="TIME_PERIOD", values="tonnes", aggfunc="sum")
    val_wide = df_val.pivot_table(index="product", columns="TIME_PERIOD", values="eur",    aggfunc="sum")

    qty_wide.columns = [f"tonnes_{m}" for m in qty_wide.columns]
    val_wide.columns = [f"eur_{m}"    for m in val_wide.columns]

    result = qty_wide.join(val_wide, how="outer").reset_index()
    result = result.rename(columns={"product": "cn_code"})
    result["sector"] = result["cn_code"].map(sector_map)

    # Add codes with no API data (zero trade = 0, not missing)
    returned = set(result["cn_code"])
    missing_rows = [{"cn_code": cn, "sector": sec} for cn, sec in cn_entries if cn not in returned]
    if missing_rows:
        print(f"  Codes with no API data (zero trade): {[r['cn_code'] for r in missing_rows]}")
        result = pd.concat([result, pd.DataFrame(missing_rows)], ignore_index=True)

    # Ensure all expected month columns exist; fill NaN → 0
    for m in months:
        for col in [f"tonnes_{m}", f"eur_{m}"]:
            if col not in result.columns:
                result[col] = 0.0
            else:
                result[col] = result[col].fillna(0.0)

    col_order = ["cn_code", "sector"] + [c for m in months for c in [f"tonnes_{m}", f"eur_{m}"]]
    result = result[[c for c in col_order if c in result.columns]].sort_values("cn_code").reset_index(drop=True)

    # ── Save CSV ──────────────────────────────────────────────────────────────
    os.makedirs("data/raw", exist_ok=True)
    csv_out = "data/raw/comext_us_cbam_trade_by_month.csv"
    result.to_csv(csv_out, index=False)
    print(f"\nSaved CSV → {csv_out}  ({len(result)} rows × {len(result.columns)} cols)")

    # ── Generate JS TRADE object for App.jsx ──────────────────────────────────
    # Format: "CN_CODE": {"YYYY-MM": [tonnes, eur], ...}
    lines = ["// ── TRADE DATA — from data/raw/comext_us_cbam_trade_by_month.csv ─────────────"]
    lines += ["// Keyed by CN code (no spaces). Each entry: {\"YYYY-MM\": [tonnes, eur], ...}"]
    lines += ["const TRADE = {"]

    for _, row in result.iterrows():
        cn = str(row["cn_code"])
        monthly = {}
        for m in months:
            t = row.get(f"tonnes_{m}", 0.0) or 0.0
            e = row.get(f"eur_{m}", 0.0) or 0.0
            if t != 0.0 or e != 0.0:
                t_r = round(t, 3)
                e_r = int(round(e))
                monthly[m] = [t_r, e_r]
        # Always emit the key, even if all zeros (empty object signals known zero trade)
        monthly_json = json.dumps(monthly, separators=(",", ":"))
        lines.append(f'  "{cn}":{monthly_json},')

    lines[-1] = lines[-1].rstrip(",")  # remove trailing comma on last entry
    lines += ["};"]

    js_out = "data/raw/trade_js_snippet.txt"
    with open(js_out, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Saved JS snippet → {js_out}")
    print("\nNext step: replace the TRADE block in src/App.jsx with the contents of that file.")


if __name__ == "__main__":
    main()
