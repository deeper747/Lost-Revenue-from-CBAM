# Data Maintenance Notes

Last reviewed: 2026-10-28 (UK section added; EU sections carried over from the EU calculator)

---

## 1. EU ETS Price (`src/data/ets_prices.json`)

**Source:** ICAP Allowance Price Explorer — `https://allowancepriceexplorer.icapcarbonaction.com/api/systems`  
**Update script:** `python3 scripts/update_ets_prices.py`

The script pulls daily secondary market EUA prices (systems 33 & 34) and computes quarterly averages. The calculator default is set to the most recently completed quarter.

**When to run:**
- At the start of each new quarter, once the previous quarter's data appears on ICAP (typically a few weeks after quarter-end)
- Before any major public release or presentation
- If the ETS price has moved significantly and the default feels stale

**Known limitation:** ICAP does not publish an update schedule. The data currently ends 2025-12-15. Check whether the end date has advanced before assuming the script will produce new output. If ICAP has not updated after 6–8 weeks into a new quarter, seed the value manually using a published source (e.g. EEX, Ember Climate, or Reuters).

**Current default:** €80.37/tCO₂e (2025-Q4 average)

---

## 1b. Official CBAM Certificate Price (`public/data/cbam_live_config.json`)

**Source:** European Commission — `https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en`

Section 1 covers the ETS price series used for history and for the forecast slider. This file is different: it carries the **official quarterly CBAM certificate prices**, and it is fetched by the browser at runtime rather than compiled into the bundle. That is the whole point of it — when the Commission publishes a new quarter, edit this one file and upload it. No rebuild, no redeploy of the app code.

**To add a quarter:**

```json
{
  "ets_quarterly_prices": {
    "2026-Q1": 75.36,
    "2026-Q2": 75.28,
    "2026-Q3": 79.10
  }
}
```

That is the only edit. The dashboard derives everything else from these entries:

| Shown in the UI | Derived as |
|---|---|
| How far the confirmed band runs | last month of the latest priced quarter |
| "Price on your choice from *X* on" | the month after that |
| Slider's starting value | the latest published price |

**Do not add `ets_confirmed_through` or `forecast_from`.** They used to be separate fields here and they are the reason the confirmed band once silently fell back to March: the Q2 update touched `src/data/ets_prices.json` and `src/config/publicationConfig.js` but not this file, and this file wins at runtime. They are now computed by `confirmedThroughFromPrices()` in `src/config/publicationConfig.js` and cannot be set by hand.

`default_forecast_ets` is still accepted here as an optional override for the slider's starting value. Leave it out unless you deliberately want the slider to open somewhere other than the latest official price.

**Note on precedence:** the runtime file is *merged over* the bundled `ets_prices.json`, quarter by quarter. A stale upload can therefore only ever fail to move the confirmed band forward — it can no longer pull it backward.

---

## 2. Trade Data — Eurostat Comext (`src/App.jsx`, `TRADE` constant)

**Source:** Eurostat Comext DS-045409 — US exports to EU27, by CN code  
**Live fetch:** The "Live Cost Clock" tab fetches 2026 monthly data directly from the Comext API at runtime.  
**Static baseline:** The `TRADE` object in `App.jsx` contains pre-loaded annual totals for 2022–2025.

### Comext publication lag

Eurostat publishes monthly trade data on a rolling basis with the following typical lags:

| Data type | Lag after reference month |
|---|---|
| Extra-EU aggregated & detailed | ~46 days (~6.5 weeks) |
| Intra-EU detailed | ~70 days (~2.5 months) |

Since DS-045409 covers extra-EU trade (US → EU27), **data for a given month is typically available within 6–7 weeks** of that month ending. For example, January 2026 data would normally appear in mid-March 2026.

Eurostat publishes a [release calendar](https://ec.europa.eu/eurostat/news/release-calendar) with exact dates in advance.

### Provisional vs. final

Monthly data is initially published as **provisional** (flagged `p` in the API). Revisions occur regularly as member states submit corrections. Data is not considered **final** until October of the following year — so 2026 monthly figures won't be final until October 2027.

For calculator purposes, provisional figures are fine. Just be aware that figures for the most recent 1–2 months may shift slightly in subsequent releases.

### When to update the static baseline

- **2025 final data:** Expected October 2026. Update the `TRADE` constant in `App.jsx` at that point.
- **Mid-year check:** If you want to lock in provisional 2026 year-to-date figures (e.g. for a publication), extract from Comext in Q3 or Q4 2026 once several months of data are available.

**How to update:** Re-run the Comext data extraction process and replace the `TRADE` constant in `App.jsx`. The CN-code matching logic (`CN_MAP`) should not need changes unless the regulation's CN code list changes.

---

## 3. CBAM Default Values (`CBAM_DEFAULT_VALUE_ROWS` in `src/data/cbamDefaultValues.js`)

**Source:** EU Implementing Regulation 2025/2621, Annex I (US default values), as replaced by Correcting Regulation (EU) 2026/1740 (OJ L, 31.7.2026; in force 3.8.2026, applies retroactively from 1.1.2026)  
**Update trigger:** Only if the European Commission issues a further implementing regulation updating the default values. Monitor the EUR-Lex CBAM page for new implementing acts.

**2026-08-05 update (Reg 2026/1740):** No US emission default value changed (verified row by row against both OJ texts). Codes and routes updated:

- 2507 00 80 → TARIC 2507 00 80 80 (scope narrowed to calcined kaolinic clay); route indicator dropped
- 2523 10 00 → TARIC 2523 10 00 10 (white clinker, B) / 2523 10 00 90 (grey/other, A); calculator attributes 8-digit trade flows to the grey variant (predominant in US exports); white rows listed with zero tonnage
- 2523 90 00 → TARIC 2523 90 00 10 (white, B) / 2523 90 00 90 (grey/other, A); same treatment
- 7205 route (C) → (C)/(F); benchmark lookup keeps the conservative (C) value
- Route changes not affecting rows in the calculator subset: 7225 19 90 and 7226 19 80 (F→C), 7306 30 18 (gained C), 7318 12 10 and 7318 14 10 (lost C)

**Benchmarks (`src/data/cbamBenchmarks.js`):** from Reg 2025/2620, which 2026/1740 does NOT amend. Only the cement keys were renamed to the new TARIC codes.

---

## 4. Mark-up Schedule

**Source:** EU IR 2025/2621 as corrected by Reg (EU) 2026/1740, Annex I opening text  
**Current schedule:** 10% (2026), 20% (2027), 30% (2028+); Fertilisers 1% throughout  
**Note:** The correcting regulation deleted the printed 2026/27/28 mark-up columns (recital 10). The calculator now computes marked-up values as `round(total × factor, 3)` in `cbamDefaultValues.js`, matching the CBAM Registry approach. Do not re-add hardcoded mark-up columns.  
**Update trigger:** Only if the Commission amends the phase-in schedule. No changes expected before 2028.

---

## 5. FAQ & Narrative Text

- **ETS price history** (FAQ): Update when a significant market event occurs (e.g. a new multi-year high or low). The February 2026 drop to ~€69/t is already reflected.
- **Other countries' CBAMs** (FAQ): Monitor UK legislation progress (CBAM expected 2027), Australia's follow-up to the 2026 leakage review, and Taiwan's implementation rules.
- **EUR/USD rate** (`EUR_USD = 1.08`): Currently fixed at the 2022–24 ECB average. Consider updating if the rate shifts materially for a sustained period.

---

## 6. UK CBAM (added 2026-10-28)

Everything below lives alongside the EU pipeline and does not touch it.

### 6a. Official quarterly UK CBAM rates (`public/data/cbam_live_config.json` → `uk_cbam_rates`)

**Source:** HMRC publishes sector-level CBAM rates at the start of each quarter. The first (Q1 2027) is due before the end of 2026.

```json
"uk_cbam_rates": {
  "2027-Q1": { "Iron & Steel": 0.00, "Aluminum": 0.00, "Cement": 0.00, "Fertilizers": 0.00, "Hydrogen": 0.00 }
}
```

Values are £/tCO2e. Sector names must match exactly (the calculator uses U.S. spelling for "Aluminum" and "Fertilizers"). A listed quarter overrides the formula; later quarters use the slider. No rebuild needed.

### 6b. Rate parameters (`src/data/ukCbamParams.js`)

- **Free allocation %:** backed out of HMRC's illustrative rates (16 Oct 2026). When HMRC publishes final baseline percentages for all five sectors, replace `UK_FREE_ALLOCATION_PCT` with them.
- **Phase-out factor:** 2027–2030 are in SI 2026/278. 2031–2035 are an assumption. Replace them if a later order sets them, and update `UK_PHASEOUT_LEGISLATED_THROUGH`.
- **Reference price:** £58.15 (Q3 2026). Once official rates exist, consider moving the slider's start to the latest UK ETS quarterly average.
- **GBP/USD:** 1.3185, the Bank of England 2025 annual average. Roll forward in step with the EU side's EUR/USD.

### 6c. UK default values (`data/uk/uk_cbam_default_values.csv`)

**Source:** HMRC guidance pages, one per sector, published 16 Oct 2026. Raw JSON copies from the GOV.UK content API are in `data/uk/raw/hmrc_default_values_*.json`.

**Update trigger:** HMRC revises the values (they run 1 Jan 2027 to 31 Dec 2028; country-specific values start in 2029), or the CN list changes. Re-parse the pages, then run `node scripts/build_uk_data.mjs`.

The published values already include the mark-up. Never apply one on top.

### 6d. UK trade (`data/uk/raw/uktradeinfo_us_cbam_imports_monthly.csv`)

**Source:** HMRC Overseas Trade Statistics, uktradeinfo OData API, FlowTypeId 3 (non-EU imports), CountryId 400 (United States), summed across ports.

**To refresh:** `python3 scripts/fetch_uk_trade.py --refresh`, re-run until it prints "all headings cached", then `node scripts/build_uk_data.mjs`. The API rate-limits; the script backs off and caches per 4-digit heading.

**Lag:** HMRC publishes monthly trade about six weeks after the month ends. The pull on 2026-10-28 ran through 2026-08.

**Known lumpiness:** iron ore pellets (CN 2601 12 00) are zero in 2022 and 80–157 kt a year in 2023–2025. They dominate U.S. steel-sector tonnage to the UK in those years, but at a low default value (0.494 tCO2e/t).
