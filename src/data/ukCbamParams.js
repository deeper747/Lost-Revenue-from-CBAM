// UK CBAM rate parameters.
//
// UK CBAM liability on a good = embodied emissions (tCO2e) × the sector's CBAM rate (£/tCO2e),
// less any carbon price relief. The U.S. has no explicit federal carbon price, so U.S.-origin
// goods get no relief and the calculator applies none.
//
// The CBAM rate for each sector and quarter is (HMRC, "Illustrative CBAM rates (and worked
// example)", 16 Oct 2026):
//
//   rate = average UK ETS auction price of the preceding quarter
//          × [1 − baseline free allocation % × free allowance phase-out reduction factor]
//
// https://www.gov.uk/government/publications/illustrative-cbam-rates-and-worked-example-for-carbon-border-adjustment-mechanism-cbam
// Raw copy: data/uk/raw/hmrc_illustrative_cbam_rates_2026-10-16.json

/** UK CBAM liability starts on goods imported from 1 January 2027 (Finance Act 2026, Sch. 17). */
export const UK_CBAM_START_YEAR = 2027;
export const UK_CBAM_START_YM = "2027-01";

/**
 * Average UK ETS auction clearing price for Q3 (Jul–Sep) 2026, £/tCO2e. This is the price
 * HMRC used for the illustrative rates, and it is the slider's starting value.
 */
export const UK_REFERENCE_PRICE = 58.15;
export const UK_REFERENCE_PRICE_QTR = "2026-Q3";

/**
 * Illustrative CBAM rates at £58.15 and the 2027 phase-out factor (HMRC Table 1).
 * They create no liability and are not forecasts; HMRC publishes the first binding rates
 * (Q1 2027) before the end of 2026 and new rates at the start of each quarter after that.
 */
export const UK_ILLUSTRATIVE_RATES = {
  "Iron & Steel": 9.69,
  Aluminum: 9.79,
  Cement: 8.78,
  Fertilizers: 1.45,
  Hydrogen: 9.24,
};

/**
 * Free allowance phase-out reduction factor, by scheme year. 2027–2030 are set in law:
 * The Greenhouse Gas Emissions Trading Scheme (Amendment) Order 2026 (SI 2026/278),
 * art. 19, inserting para. 14 into art. 16 of the Free Allocation Regulation.
 * https://www.legislation.gov.uk/uksi/2026/278/article/19/made
 *
 * ASSUMPTION for 2031–2035: no UK factor has been legislated past 2030. The 2027–2030 UK
 * factors are exactly the EU CBAM factors for 2026–2029 shifted one year later, so the
 * calculator extends that one-year lag through 2035. Flagged in the methodology text.
 */
export const UK_PHASEOUT_FACTOR = {
  2027: 0.975,
  2028: 0.95,
  2029: 0.9,
  2030: 0.775,
  // assumed (EU CBAM factor of the previous year)
  2031: 0.515,
  2032: 0.39,
  2033: 0.265,
  2034: 0.14,
  2035: 0.0,
};
export const UK_PHASEOUT_LEGISLATED_THROUGH = 2030;

/**
 * Baseline free allocation % by sector: free allowances ÷ direct emissions for the UK ETS
 * sub-installations producing each CBAM good. HMRC publishes only cement's (87.1%). The
 * other four are backed out of HMRC's illustrative rates:
 *     FA = (1 − rate ÷ £58.15) ÷ 0.975
 * so the calculator reproduces Table 1 exactly at £58.15. Backing out cement gives 87.08%,
 * which matches the published 87.1%. Fertiliser solves to just above 100% because of
 * rounding in the £1.45 rate and is capped at 100%.
 * HMRC says these percentages may change once the UK ETS Authority finishes checking the
 * Baseline Data Reporting submissions; they are held constant after 2027.
 */
const backOut = rate => Math.min(1, (1 - rate / UK_REFERENCE_PRICE) / UK_PHASEOUT_FACTOR[2027]);
export const UK_FREE_ALLOCATION_PCT = Object.fromEntries(
  Object.entries(UK_ILLUSTRATIVE_RATES).map(([sec, r]) => [sec, backOut(r)])
);

/** Mark-up already built into HMRC's published default values (none for fertiliser). */
export const UK_MARKUP_PCT = { "Iron & Steel": 10, Aluminum: 10, Cement: 10, Fertilizers: 0, Hydrogen: 10 };

/**
 * US dollars per pound: Bank of England annual average spot rate for 2025 (series XUAAUSS),
 * the same "last full year's average" basis the EU side uses for $/€.
 */
export const GBP_USD = 1.3185;
