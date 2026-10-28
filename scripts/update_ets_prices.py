#!/usr/bin/env python3
"""
Update EU ETS prices in src/data/ets_prices.json

Source: ICAP Allowance Price Explorer (https://allowancepriceexplorer.icapcarbonaction.com)
  - Public API, no authentication required
  - System 34: EU ETS secondary market prices (weekly, from 2019)
  - System 33: EU ETS secondary market prices (weekly, until 2018)
  - Each price entry is [USD_price, EUR_price, EUR_price] — we use index 1 (EUR spot)
  - Data is daily (trading days only, Mon–Fri). No explicit update schedule is
    published by ICAP; the API currently ends at 2025-12-15. Check back periodically.

Usage:
    python scripts/update_ets_prices.py

Run quarterly (or whenever new trade data is published) before deploying the calculator.
"""

import json
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_FILE = SCRIPT_DIR.parent / "src" / "data" / "ets_prices.json"

ICAP_API = "https://allowancepriceexplorer.icapcarbonaction.com/api/systems"
# System 34 = EU ETS from 2019 (secondary market, weekly)
# System 33 = EU ETS until 2018 (secondary market, weekly)
EU_ETS_SYSTEM_IDS = [33, 34]


def fetch_icap():
    print(f"Fetching ICAP Allowance Price Explorer: {ICAP_API}")
    req = urllib.request.Request(ICAP_API, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
    except Exception as e:
        print(f"  ICAP fetch failed: {e}")
        return None

    prices = []  # list of (date_str "YYYY-MM-DD", eur_price)
    for system in data:
        if system["id"] not in EU_ETS_SYSTEM_IDS:
            continue
        market = system.get("values", {}).get("secondary") or system.get("values", {}).get("primary", {})
        for date_str, vals in market.items():
            # vals = [USD_price, EUR_price, EUR_price]
            try:
                eur = float(vals[1])
                if eur > 0 and len(date_str) == 10:  # YYYY-MM-DD only
                    prices.append((date_str, eur))
            except (IndexError, TypeError, ValueError):
                continue

    print(f"  Got {len(prices)} daily price observations (trading days)")
    return prices if prices else None


def quarter_key(date_str):
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return f"{dt.year}-Q{(dt.month - 1) // 3 + 1}"


def year_key(date_str):
    return date_str[:4]


def compute_averages(prices):
    by_q = defaultdict(list)
    by_y = defaultdict(list)
    for date_str, price in prices:
        by_q[quarter_key(date_str)].append(price)
        by_y[year_key(date_str)].append(price)
    quarterly = {k: round(sum(v) / len(v), 2) for k, v in by_q.items()}
    annual = {k: round(sum(v) / len(v), 2) for k, v in by_y.items()}
    return quarterly, annual


def latest_completed_quarter():
    now = datetime.now()
    q = (now.month - 1) // 3 + 1
    if q == 1:
        return f"{now.year - 1}-Q4"
    return f"{now.year}-Q{q - 1}"


def current_quarter():
    now = datetime.now()
    return f"{now.year}-Q{(now.month - 1) // 3 + 1}"


def main():
    existing = {}
    if DATA_FILE.exists():
        with open(DATA_FILE) as f:
            existing = json.load(f)

    prices = fetch_icap()
    if not prices:
        print("\nFetch failed. Existing values preserved.")
        return 1

    quarterly, annual = compute_averages(prices)

    # For the current (partial) quarter, include it but note it's provisional
    cur_q = current_quarter()
    completed_q = latest_completed_quarter()
    current_year = str(datetime.now().year)

    # Annual: don't overwrite the current partial year
    merged_annual = dict(existing.get("annual", {}))
    for k, v in annual.items():
        if k != current_year:
            merged_annual[k] = v

    # Use the most recently completed quarter that actually has data
    for q_candidate in [completed_q] + [f"{y}-Q{qi}" for y in range(datetime.now().year, 2018, -1) for qi in range(4, 0, -1)]:
        if q_candidate in quarterly:
            default_price = quarterly[q_candidate]
            latest_period = q_candidate
            break
    else:
        default_price = existing.get("default", 70.0)
        latest_period = existing.get("latest_period", "unknown")

    provisional = ""
    if cur_q in quarterly:
        n = len([p for d, p in prices if quarter_key(d) == cur_q])
        provisional = f" · {cur_q} provisional ({n} weeks): €{quarterly[cur_q]}/t"

    out = {
        "default": default_price,
        "latest_period": latest_period,
        "source": "ICAP Allowance Price Explorer (systems 33 & 34, secondary market weekly)",
        "source_url": "https://allowancepriceexplorer.icapcarbonaction.com",
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "note": (
            "Quarterly and annual average EUA secondary market prices (€/tCO₂e). "
            f"Run scripts/update_ets_prices.py to refresh.{provisional}"
        ),
        "quarterly": dict(sorted(quarterly.items())),
        "annual": dict(sorted(merged_annual.items())),
    }

    with open(DATA_FILE, "w") as f:
        json.dump(out, f, indent=2)

    print(f"\nUpdated {DATA_FILE.relative_to(SCRIPT_DIR.parent)}")
    print(f"  Default price : €{default_price}/tCO₂e  ({latest_period})")
    print(f"  Quarters      : {', '.join(sorted(quarterly.keys()))}")
    if cur_q in quarterly:
        print(f"  Current Q     : €{quarterly[cur_q]}/t (provisional)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
