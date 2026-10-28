"""Fetch UK imports from the United States of UK CBAM goods, monthly, from HMRC's
uktradeinfo OData API (Overseas Trade Statistics, non-EU imports).

Scope: the 570 CN8 codes in HMRC's UK CBAM default values (data/uk/uk_cbam_default_values.csv),
so the trade list and the default-value list are the same set of goods by construction.

  FlowTypeId 3 = Non-EU Imports (the US is a non-EU partner)
  CountryId 400 = United States. (902 "USA" is a legacy code; it returned no records for
  the CBAM headings when checked on 2026-10-28, so it is not queried.)
  NetMass is in kg, Value in GBP. Records are split by port; this script sums ports.

The fetch is resumable: each 4-digit heading is cached under data/uk/raw/uktradeinfo_cache/
and skipped on later runs, and each run stops after a time budget. Re-run until it prints
"all headings cached", then it writes the combined file.

Output: data/uk/raw/uktradeinfo_us_cbam_imports_monthly.csv
  cn_code, month (YYYY-MM), tonnes, gbp

Usage: python3 scripts/fetch_uk_trade.py [--start 202201] [--budget 150] [--refresh]
  --refresh deletes the cache first (use when pulling a newer month).
"""
import argparse, csv, json, os, shutil, sys, time, urllib.parse, urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DV = os.path.join(ROOT, "data", "uk", "uk_cbam_default_values.csv")
CACHE = os.path.join(ROOT, "data", "uk", "raw", "uktradeinfo_cache")
OUT = os.path.join(ROOT, "data", "uk", "raw", "uktradeinfo_us_cbam_imports_monthly.csv")
API = "https://api.uktradeinfo.com/OTS"
US = 400

ap = argparse.ArgumentParser()
ap.add_argument("--start", default="202201")
ap.add_argument("--budget", type=float, default=150)
ap.add_argument("--refresh", action="store_true")
args = ap.parse_args()

if args.refresh and os.path.isdir(CACHE):
    shutil.rmtree(CACHE)
os.makedirs(CACHE, exist_ok=True)

codes = sorted({r["cn_code"] for r in csv.DictReader(open(DV))})
wanted = set(codes)
headings = sorted({c[:4] for c in codes})
t0 = time.time()


def get(url):
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Niskanen-CBAM-calculator"})
            return json.loads(urllib.request.urlopen(req, timeout=60).read())
        except Exception as e:  # rate limit or transient error: back off
            wait = 5 * (attempt + 1)
            print(f"  retry in {wait}s: {e}", file=sys.stderr)
            time.sleep(wait)
    sys.exit(f"failed: {url}")


for h in headings:
    path = os.path.join(CACHE, f"{h}.json")
    if os.path.exists(path):
        continue
    if time.time() - t0 > args.budget:
        left = sum(not os.path.exists(os.path.join(CACHE, f"{x}.json")) for x in headings)
        print(f"time budget reached; {left} headings left, re-run to continue", file=sys.stderr)
        sys.exit(0)
    lo, hi = int(h) * 10000, (int(h) + 1) * 10000
    flt = (f"CountryId eq {US} and FlowTypeId eq 3 and MonthId ge {args.start} "
           f"and CommodityId ge {lo} and CommodityId lt {hi}")
    url = API + "?$filter=" + urllib.parse.quote(flt)
    recs = []
    while url:
        d = get(url)
        for r in d.get("value", []):
            recs.append([r["CommodityId"], r["MonthId"], r.get("NetMass") or 0, r.get("Value") or 0])
        url = d.get("@odata.nextLink")
        time.sleep(0.3)
    json.dump(recs, open(path, "w"))
    print(f"{h}: {len(recs)} records", file=sys.stderr)

print("all headings cached", file=sys.stderr)
agg = defaultdict(lambda: [0.0, 0.0])
for h in headings:
    for cid, mid, kg, gbp in json.load(open(os.path.join(CACHE, f"{h}.json"))):
        cn = f"{cid:08d}"
        if cn not in wanted:
            continue
        a = agg[(cn, f"{str(mid)[:4]}-{str(mid)[4:]}")]
        a[0] += kg / 1000.0
        a[1] += gbp
with open(OUT, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["cn_code", "month", "tonnes", "gbp"])
    for (cn, ym), (t, v) in sorted(agg.items()):
        w.writerow([cn, ym, round(t, 3), round(v, 2)])
print(f"wrote {len(agg)} rows to {OUT}", file=sys.stderr)
