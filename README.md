# US CBAM Exposure Calculator: EU and UK

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC_BY--NC_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

An interactive calculator from the [Niskanen Center](https://www.niskanencenter.org) that estimates what the EU and UK carbon border adjustment mechanisms (CBAMs) charge on U.S. exports. A toggle switches between three views:

| View | What it totals |
|------|----------------|
| **EU only** | EU CBAM exposure, identical to the [EU-only calculator](https://the-niskanen-center.github.io/US-CBAM-calculator/) |
| **UK only** | UK CBAM exposure, which starts on goods imported from 1 January 2027 |
| **EU + UK** | Both, added in U.S. dollars, with each side shown separately in the sector table |

This repository started as a copy of [`US-CBAM-calculator`](https://github.com/The-Niskanen-Center/US-CBAM-calculator). The EU side is unchanged; the UK side is new.

## How costs are calculated

**EU CBAM** (from January 2026)

```
EU cost ($) = Export tonnes × max(0, Default value × (1 + Mark-up) − Benchmark × CBAM factor) × EU ETS price (€) × $1.13/€
```

See the EU calculator's README for sources and the update procedure; both carry over unchanged.

**UK CBAM** (from January 2027)

```
UK cost ($) = Import tonnes × UK default value × CBAM rate (£) × $1.3185/£
CBAM rate   = UK ETS price × [1 − Baseline free allocation % × Phase-out factor]
```

| Input | Value | Source |
|-------|-------|--------|
| UK default values | One per CN8 code, 570 codes, same for every origin in 2027 and 2028. Already include a 10% mark-up (none for fertiliser). | HMRC, [Check the default values for the CBAM](https://www.gov.uk/government/publications/check-the-default-values-for-the-carbon-border-adjustment-mechanism-cbam), 16 Oct 2026 |
| UK ETS price | Slider, starting at £58.15 (Q3 2026 average auction price) | HMRC, [Illustrative CBAM rates and worked example](https://www.gov.uk/government/publications/illustrative-cbam-rates-and-worked-example-for-carbon-border-adjustment-mechanism-cbam/carbon-border-adjustment-mechanism-cbam-illustrative-cbam-rates-and-worked-example), 16 Oct 2026 |
| Free allocation % | Cement 87.1% published; the other four backed out of HMRC's illustrative rates so the model reproduces them at £58.15 | Same |
| Phase-out factor | 97.5% (2027), 95% (2028), 90% (2029), 77.5% (2030) in law. 2031–2035 **assumed**: the EU schedule one year later, reaching 0% in 2035 | [SI 2026/278, art. 19](https://www.legislation.gov.uk/uksi/2026/278/article/19/made) |
| Trade volumes | UK imports from the U.S. by CN8 and month, 2022 to latest release; projections use the 2022–2025 monthly average | HMRC Overseas Trade Statistics via the [uktradeinfo API](https://www.uktradeinfo.com/) |
| Exchange rate | $1.3185/£, 2025 annual average | Bank of England, series XUAAUSS |

Carbon price relief is zero because the U.S. has no explicit federal carbon price.

## Caveats specific to the UK side

- **Rates are illustrative until HMRC publishes binding ones.** The first official rates (Q1 2027) are due before the end of 2026. Add them to `public/data/cbam_live_config.json` and they override the formula for that quarter.
- **Free allocation percentages may move.** HMRC says the sub-installation list behind them is still being checked by the UK ETS Authority.
- **Default values change in 2029.** The UK moves to country-specific values then. The calculator holds the 2027–2028 values constant after 2028.
- **Broader product scope than the EU rows.** UK CBAM lists 570 CN8 codes; the EU side tracks the U.S.-relevant rows of the EU regulation. UK and EU trade volumes are not like for like.
- **EU–UK ETS linking.** The UK and EU are negotiating to link their emissions trading systems, with a summit set for 20 November 2026. A full link would let each exempt the other's goods from its CBAM. As of October 2026, HMRC lists no exempt jurisdictions. A link would not exempt U.S.-origin goods from either CBAM.

## Updating the UK data

```bash
python3 scripts/fetch_uk_trade.py            # pulls HMRC trade (resumable; re-run until "all headings cached")
python3 scripts/fetch_uk_trade.py --refresh  # start over, e.g. after HMRC releases a new month
node scripts/build_uk_data.mjs               # rebuilds src/data/ukTradeData.js and ukCbamDefaultValues.js
```

`data/uk/uk_cbam_default_values.csv` was parsed from HMRC's guidance pages; raw copies of those pages sit in `data/uk/raw/`. See `DATA_MAINTENANCE.md` for the full checklist.

## Development

```bash
npm install
npm run dev       # local dev server at http://localhost:5173
npm run build     # production build to dist/
npm run deploy    # build + deploy to this repo's gh-pages branch
```

Before the first deploy, check that the URLs in `index.html` match this repository (currently set to `deeper747.github.io/Lost-Revenue-from-CBAM`).

## License

This work is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). See [LICENSE](LICENSE).

You are free to reproduce and adapt this work for non-commercial purposes. If you reproduce or cite the **findings or data**, please credit the Niskanen Center. Attribution is not required if you reuse only the underlying code or methodology.

**Trademark notice:** The Niskanen Center name, logo, and visual identity are trademarks of the Niskanen Center and may not be reused in ways that suggest affiliation or endorsement.
