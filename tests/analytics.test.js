import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  analyticsOptions,
  buildAnalytics,
  disposalDays,
  caseStatus,
  caseType,
  filterCases,
  percentage,
} from "../src/lib/analytics.js";
import { mergePortfolio } from "../src/lib/portfolio.js";
const today = "2026-10-29";
function row(
  id,
  data = {},
  hasDetails = true,
  checked = "2026-10-29T08:00:00Z",
) {
  return {
    cnr: `KAAA0100000${id}2025`,
    hasDetails,
    data: {
      court: "Example Court",
      case_type: "C.C. - CRIMINAL CASES",
      ...data,
    },
    last_checked_at: checked,
  };
}
const find = (rows, label) => rows.find((row) => row.label === label)?.count;
test("analytics separates status and coverage denominators and normalises types/stages/courts", () => {
  const rows = [
    row(1, { case_status: " pending ", case_stage: " nbw " }),
    row(2, { case_status: "Disposed", case_stage: "FOR  STEPS" }),
    row(3, { case_stage: "NBW", court: " example   court " }),
    row(4, { case_status: "Pending", case_stage: "NBW" }, false),
  ];
  const m = buildAnalytics(rows, { today });
  assert.equal(m.total, 4);
  assert.equal(m.detailed, 3);
  assert.equal(m.coverage, 75);
  assert.equal(m.pending, 1);
  assert.equal(m.disposed, 1);
  assert.equal(m.unknown, 1);
  assert.equal(m.listed, 1);
  assert.equal(m.disposalRate, 50);
  assert.equal(m.known, 2);
  assert.equal(
    m.status.reduce((sum, r) => sum + r.count, 0),
    4,
  );
  assert.equal(find(m.stages, "NBW"), 2);
  assert.equal(find(m.stages, "FOR STEPS"), 1);
  assert.equal(m.courts.length, 1);
  assert.equal(m.courts[0].total, 4);
  assert.equal(caseType(rows[0]), "C.C.");
  assert.equal(
    caseType(row(5, { case_type: "", case_reference: "P.C.R./12/2025" })),
    "P.C.R.",
  );
  assert.equal(percentage(0, 0), null);
  assert.equal(
    buildAnalytics([row(1, {}, false)], { today }).disposalRate,
    null,
  );
  assert.equal(
    caseStatus(row(9, { case_status: "Unknown" })),
    "Status unknown",
  );
});
test("hearing horizons include today, exclude disposed/listed and keep past dates separate", () => {
  const rows = [
    row(1, { case_status: "Pending", next_hearing_date: today }),
    row(2, { case_status: "Pending", next_hearing_date: addDays(today, 6) }),
    row(3, { case_status: "Pending", next_hearing_date: addDays(today, 7) }),
    row(4, { next_hearing_date: addDays(today, 29) }),
    row(5, { next_hearing_date: addDays(today, 30) }),
    row(6, { case_status: "Disposed", next_hearing_date: today }),
    row(7, { case_status: "Pending", next_hearing_date: today }, false),
    row(8, { case_status: "Pending", next_hearing_date: addDays(today, -1) }),
    row(9, { case_status: "Pending", next_hearing_date: "31-02-2026" }),
  ];
  const m = buildAnalytics(rows, { today });
  assert.equal(m.next7.length, 2);
  assert.equal(m.upcoming.length, 4);
  assert.equal(m.pastHearing.length, 1);
  assert.equal(m.noNext.length, 1);
  assert.equal(
    m.hearingWeeks.reduce((sum, r) => sum + r.count, 0),
    4,
  );
  assert.equal(m.hearingWeeks[4].count, 1);
  assert.equal(m.courts[0].next7, 2);
});
test("case age bands and recency handle boundaries, India time and missing dates", () => {
  const ages = [0, 90, 91, 180, 181, 365, 366, 730, 731];
  const rows = ages.map((days, i) =>
    row(i, { case_status: "Pending", filing_date: addDays(today, -days) }),
  );
  rows.push(row(10, { case_status: "Pending", filing_date: "invalid" }));
  const m = buildAnalytics(rows, { today });
  assert.deepEqual(
    m.age.map((r) => r.count),
    [2, 2, 2, 2, 1, 1],
  );
  const recencyRows = [
    row(1, {}, true, "2026-10-28T20:00:00Z"),
    row(2, {}, true, "2026-10-22T08:00:00Z"),
    row(3, {}, true, "2026-09-29T08:00:00Z"),
    row(4, {}, true, "bad"),
    row(5, {}, false, "2026-01-01T00:00:00Z"),
  ];
  const r = buildAnalytics(recencyRows, { today });
  assert.deepEqual(
    r.freshness.map((r) => r.count),
    [1, 1, 1, 1],
  );
  assert.equal(r.stale.length, 1);
  assert.equal(r.stale[0].days, 30);
});
test("decision trends use explicit Decision Date; median excludes missing, future and reversed dates", () => {
  const rows = [
    row(1, {
      case_status: "Disposed",
      filing_date: "01-10-2026",
      decision_date: "11-10-2026",
      disposal_date: "20-10-2026",
    }),
    row(2, {
      case_status: "Disposed",
      registration_date: "01-10-2026",
      decision_date: "21-10-2026",
    }),
    row(3, {
      case_status: "Disposed",
      filing_date: "01-10-2026",
      disposal_date: "22-10-2026",
    }),
    row(4, {
      case_status: "Disposed",
      filing_date: "20-10-2026",
      decision_date: "10-10-2026",
    }),
    row(5, {
      case_status: "Disposed",
      filing_date: "01-10-2026",
      decision_date: "30-10-2026",
    }),
  ];
  const m = buildAnalytics(rows, { today });
  assert.equal(m.medianDays, 15);
  assert.equal(m.durationSamples, 2);
  assert.equal(m.missingDecision.length, 2);
  assert.equal(m.trend.at(-1).filings, 4);
  assert.equal(m.trend.at(-1).decisions, 3);
  assert.equal(m.trend[0].month, "2026-05");
  assert.equal(m.trend.length, 6);
  assert.equal(
    buildAnalytics(rows, { today, months: 12 }).trend[0].month,
    "2025-11",
  );
  assert.equal(buildAnalytics([rows[2]], { today }).medianDays, null);
});
test("filters affect the cohort consistently and listing/detail joins remain one case", () => {
  const rows = [
    row(1, {
      case_status: "Pending",
      case_stage: "NBW",
      petitioners: ["Example Finance"],
    }),
    row(2, {
      case_status: "Disposed",
      court: "Other court",
      case_type: "P.C.R.",
    }),
    row(3, {}, false),
  ];
  assert.equal(filterCases(rows, { search: " finance " }).length, 1);
  assert.equal(filterCases(rows, { status: "Listed only" }).length, 1);
  assert.equal(filterCases([...rows, row(4, {})], { status: "Status unavailable" }).length, 2);
  assert.equal(filterCases(rows, { stage: "NBW" }).length, 1);
  assert.equal(
    filterCases(rows, {
      court: "OTHER COURT",
      type: "P.C.R.",
      status: "Disposed",
    }).length,
    1,
  );
  assert.equal(
    filterCases(rows, { status: "Disposed", stage: "NBW" }).length,
    0,
  );
  assert.equal(analyticsOptions(rows).types.length, 2);
  const merged = mergePortfolio(
    [{ ...rows[0], last_checked_at: "2026-10-29T00:00:00Z" }],
    [{ ...rows[0], last_seen_at: "2026-10-29T00:00:00Z" }],
  );
  assert.equal(buildAnalytics(merged, { today }).total, 1);
  const empty = buildAnalytics([], { today });
  assert.equal(empty.total, 0);
  assert.equal(empty.coverage, null);
  assert.equal(empty.medianDays, null);
});

test("disposal TAT uses one filing-to-closure sample for averages, medians, bands and courts", () => {
  const rows = [
    row(1, { case_status: "Disposed", filing_date: "01-10-2026", disposal_date: "11-10-2026", decision_date: "21-10-2026" }),
    row(2, { case_status: "Disposed", filing_date: "01-09-2026", decision_date: "01-10-2026", court: "Other Court" }),
    row(3, { case_status: "Disposed", filing_date: "01-10-2026", disposal_date: "01-10-2026" }),
    row(4, { case_status: "Disposed", registration_date: "01-10-2026", disposal_date: "11-10-2026" }),
    row(5, { case_status: "Pending", filing_date: "01-10-2026", disposal_date: "11-10-2026" }),
    row(6, { case_status: "Disposed", filing_date: "20-10-2026", disposal_date: "11-10-2026" }),
    row(7, { case_status: "Disposed", filing_date: "01-10-2026", disposal_date: "30-10-2026" }),
    row(8, { case_status: "Disposed", filing_date: "01-10-2026", disposal_date: "11-10-2026" }, false),
  ];
  const model = buildAnalytics(rows, { today });
  assert.equal(model.tatSamples, 3);
  assert.equal(model.averageTat, 40 / 3);
  assert.equal(model.medianTat, 10);
  assert.equal(model.tatBands.reduce((sum, band) => sum + band.count, 0), 3);
  assert.equal(model.tatBands[0].count, 3);
  assert.equal(model.courts.find(court => court.label === "EXAMPLE COURT").averageTat, 5);
  assert.equal(model.courts.find(court => court.label === "OTHER COURT").averageTat, 30);
  assert.equal(model.trend.at(-1).disposals, 5, "valid closure dates count disposed cases even when the filing date is unusable");
  const empty = buildAnalytics([rows[4]], { today });
  assert.equal(empty.averageTat, null);
  assert.equal(empty.medianTat, null);
  assert.equal(empty.tatSamples, 0);
});

test("company priorities use confirmed pending status and a strict over-one-year cutoff", () => {
  const rows = [
    row(1, { case_status: "Pending", filing_date: addDays(today, -365), case_stage: " nbw " }),
    row(2, { case_status: "Pending", filing_date: addDays(today, -366), case_stage: " summons " }),
    row(3, { case_status: "Pending", registration_date: addDays(today, -731), case_stage: "NBW" }),
    row(4, { case_status: "Disposed", filing_date: addDays(today, -800), case_stage: "NBW" }),
    row(5, { case_status: "Pending", filing_date: addDays(today, 1), case_stage: "SUMMONS" }),
    row(6, { case_status: "Pending", filing_date: addDays(today, -800), case_stage: "NBW" }, false),
  ];
  const model = buildAnalytics(rows, { today });
  assert.deepEqual(model.longPending.map(row => row.days), [731, 366]);
  assert.equal(model.pendingNbw.length, 2);
  assert.equal(model.pendingSummons.length, 2);
  const scoped = buildAnalytics(filterCases(rows, { stage: "SUMMONS" }), { today });
  assert.equal(scoped.longPending.length, 1);
  assert.equal(scoped.pendingNbw.length, 0);
  assert.equal(scoped.pendingSummons.length, 2);
});

test("detail availability distinguishes listings and combines with case filters", () => {
  const cases = [
    { cnr: "detail", hasDetails: true, data: { filing_date: "01-01-2025" } },
    { cnr: "listing", hasDetails: false, data: { filing_date: "01-01-2025" } },
    { cnr: "older", hasDetails: true, data: { filing_date: "01-01-2024" } },
  ];
  assert.deepEqual(filterCases(cases, { details: "available", year: "2025" }).map(item => item.cnr), ["detail"]);
  assert.deepEqual(filterCases(cases, { details: "missing" }).map(item => item.cnr), ["listing"]);
  assert.equal(filterCases(cases, {}).length, 3);
});

import {
  activitySeries,
  advocatePerformance,
  caseAdvocates,
  advocateKey,
  businessType,
  loanType,
  LOAN_TYPES,
  matchesLender,
  nbwInsight,
  pendingStageCards,
  recoveryAnalytics,
  scopeCases,
} from "../src/lib/analytics.js";

const adv = (name) => [`1) Example Finance Pvt Ltd   Advocate- ${name}`];
test("pending stage cards add up to the overall pending number and ignore disposed cases", () => {
  const rows = [
    row(1, { case_status: "Pending", case_stage: "NBW" }),
    row(2, { case_status: "Pending", case_stage: "NBW" }),
    row(3, { case_status: "Pending", case_stage: "SUMMONS" }),
    row(4, { case_status: "Pending", case_stage: "---" }),
    row(5, { case_status: "Disposed", case_stage: "FOR STEPS" }),
  ];
  const cards = pendingStageCards(rows);
  assert.equal(cards.total, buildAnalytics(rows, { today }).pending);
  assert.equal(cards.rows.reduce((s, r) => s + r.count, 0), 4);
  assert.equal(find(cards.rows, "NBW"), 2);
  assert.equal(find(cards.rows, "Stage not recorded"), 1);
  assert.equal(find(cards.rows, "FOR STEPS"), undefined);
});
test("court (contains) and filing-year scope", () => {
  const rows = [
    row(1, { court: "City Civil Court", filing_date: "10th January 2024" }),
    row(2, { court: "Chief Metropolitan Magistrate Court", filing_date: "5th May 2025" }),
  ];
  assert.equal(scopeCases(rows, { court: "metropolitan" }).length, 1);
  assert.equal(scopeCases(rows, { year: "2024" }).length, 1);
  assert.equal(scopeCases(rows, { court: "court", year: "2025" }).length, 1);
  assert.equal(scopeCases(rows, {}).length, 2);
});
test("business type and lender scope use the captured case data and combine with other filters", () => {
  const rows = [
    row(1, { business_type: "Secured", lender: "Niyogin", filing_date: "10th January 2024" }),
    row(2, { business_type: "Unsecured", petitioners: ["Trillianloans Private Limited"], filing_date: "5th May 2025" }),
    row(3, { case_type: "P.C.R. - PRIVATE COMPLAINTS", lender: "IDFC" }),
  ];
  assert.equal(businessType(rows[0]), "Secured");
  assert.equal(businessType(rows[2]), "P.C.R.");
  assert.equal(matchesLender(rows[1], "Trillianloans"), true);
  assert.equal(scopeCases(rows, { businessType: "Secured", lender: "Niyogin", year: "2024" }).length, 1);
  assert.equal(scopeCases(rows, { lender: "IDFC" }).length, 1);
  assert.equal(analyticsOptions(rows).businessTypes.includes("Secured"), true);
});
test("advocate performance counts disposed vs pending-by-stage and filing-to-disposal TAT", () => {
  const mk = (id, status, stage, filing, disposal, advocate) =>
    row(id, { case_status: status, case_stage: stage, filing_date: filing, disposal_date: disposal, petitioners: adv(advocate) });
  const rows = [
    mk(1, "Disposed", "", "2024-01-01", "2024-01-11", "A ONE"),
    mk(2, "Disposed", "", "2024-01-01", "2024-01-31", "A ONE"),
    mk(3, "Pending", "NBW", "2024-02-01", "", "A ONE"),
    mk(4, "Pending", "NBW", "2024-02-01", "", "A ONE"),
    mk(5, "Pending", "SUMMONS", "2024-02-01", "", "A ONE"),
    mk(6, "Pending", "NBW", "2024-02-01", "", "B TWO"),
  ];
  const [a, b] = advocatePerformance(rows, today);
  assert.equal(a.label, "A ONE");
  assert.equal(a.total, 5);
  assert.equal(a.disposed, 2);
  assert.equal(a.pending, 3);
  assert.equal(find(a.stages, "NBW"), 2);
  assert.equal(find(a.stages, "SUMMONS"), 1);
  assert.equal(a.averageTat, 20); // (10 + 30) / 2
  assert.equal(b.averageTat, null);
  assert.deepEqual(caseAdvocates(row(9, {})), ["Advocate not recorded"]);
});
test("activity series gives yearly and monthly buckets with the cases behind each bar", () => {
  const rows = [
    row(1, { case_status: "Disposed", filing_date: "2024-03-01", disposal_date: "2024-06-01" }),
    row(2, { case_status: "Pending", filing_date: "2025-03-01" }),
  ];
  const yearly = activitySeries(rows, { today });
  assert.deepEqual(yearly.rows.map((r) => [r.key, r.filings, r.disposals]), [["2024", 1, 1], ["2025", 1, 0]]);
  const monthly = activitySeries(rows, { today, granularity: "month", year: "2024" });
  assert.equal(monthly.rows.length, 12);
  assert.equal(monthly.rows.find((r) => r.key === "2024-06").disposedCases.length, 1);
  assert.equal(monthly.shownFilings, 1);
});
test("NBW insight reports pending share and how many disposed cases passed through NBW", () => {
  const rows = [
    row(1, { case_status: "Pending", case_stage: "NBW" }),
    row(2, { case_status: "Pending", case_stage: "SUMMONS" }),
    row(3, { case_status: "Disposed", history: [["x", "2024-01-01", "y", "SUMMONS"], ["x", "2024-02-01", "y", "NBW"]] }),
    row(4, { case_status: "Disposed", history: [["x", "2024-01-01", "y", "EVIDENCES"]] }),
  ];
  const insight = nbwInsight(rows);
  assert.equal(insight.count, 1);
  assert.equal(insight.share, 50);
  assert.equal(insight.sample, 2);
  assert.equal(insight.throughNbw, 1);
  assert.equal(insight.throughRate, 50);
});
test("recovery analytics derives totals and percentage from imported INR values", () => {
  const rows = [
    row(1, { db_amount: 1000, pos_recovered: 250, lender: "IDFC", business_type: "Retail", case_status: "Pending" }),
    row(2, { db_amount: 500, pos_recovered: 500, lender: "IDFC", business_type: "Retail", case_status: "Disposed" }),
    row(3, { db_amount: "not-an-amount", pos_recovered: 20 }),
  ];
  const recovery = recoveryAnalytics(rows);
  assert.equal(recovery.totalLoan, 1500);
  assert.equal(recovery.totalRecovered, 750);
  assert.equal(recovery.outstanding, 750);
  assert.equal(recovery.percentage, 50);
});
test("recovery analytics prefers the dedicated case amount columns", () => {
  const records = [
    { ...row(1, { db_amount: 1, pos_recovered: 1 }), db_amount: 2000, pos_recovered: 500 },
  ];
  const recovery = recoveryAnalytics(records);
  assert.equal(recovery.totalLoan, 2000);
  assert.equal(recovery.totalRecovered, 500);
  assert.equal(recovery.outstanding, 1500);
  assert.equal(recovery.percentage, 25);
});
test("recovery counts a loan once even when several cases carry it", () => {
  const laha = { db_amount: 5408844, pos_recovered: 492201, pos_as_of_nov_16: 4916643 };
  const rows = [
    // One loan pursued through a P.C.R. and the C.C. it became, with a casing difference.
    { ...row(1, { respondents: ["1) LAHA FRUITS AGENCY"], case_type: "P.C.R. - PRIVATE COMPLAINTS", case_status: "Disposed" }), ...laha },
    { ...row(2, { respondents: ["1) Laha Fruits Agency"], case_type: "C.C. - CRIMINAL CASES", case_status: "Pending" }), ...laha },
    // Co-accused and "REP BY" text do not make it a different borrower.
    { ...row(3, { respondents: ["1) LAHA FRUITS AGENCY REP BY ITS PROPRIETOR X2) Y"], case_type: "C.C. - CRIMINAL CASES", case_status: "Pending" }), ...laha },
    // Different borrowers that share round amounts stay separate loans.
    { ...row(4, { respondents: ["1) MOHAMMAD SHAKEEL"], case_status: "Pending" }), db_amount: 100000, pos_recovered: 0, pos_as_of_nov_16: 100000 },
    { ...row(5, { respondents: ["1) VARAM TRADERS"], case_status: "Pending" }), db_amount: 100000, pos_recovered: 0, pos_as_of_nov_16: 100000 },
  ];
  const recovery = recoveryAnalytics(rows);
  assert.equal(recovery.caseCount, 5);
  assert.equal(recovery.loanCount, 3);
  assert.equal(recovery.totalLoan, 5408844 + 200000);
  assert.equal(recovery.totalRecovered, 492201);
  assert.equal(recovery.outstanding, 5408844 + 200000 - 492201);
  assert.equal(recovery.records.length, 5);
});
test("time to disposal excludes P.C.R. complaints, which are disposed when registered as a C.C.", () => {
  const rows = [
    // A complaint taken on file the same day it was filed.
    row(1, { case_type: "P.C.R. - PRIVATE COMPLAINTS", case_status: "Disposed", filing_date: "04-01-2024", decision_date: "04th January 2024" }),
    row(2, { case_type: "P.C.R. - PRIVATE COMPLAINTS", case_status: "Disposed", filing_date: "04-05-2024", decision_date: "09th July 2024" }),
    // The criminal cases they became: these are the real disposals.
    row(3, { case_type: "C.C. - CRIMINAL CASES", case_status: "Disposed", filing_date: "04-01-2024", decision_date: "30th August 2025" }),
    row(4, { case_type: "C.C. - CRIMINAL CASES", case_status: "Disposed", filing_date: "02-08-2024", decision_date: "19th June 2025" }),
  ];
  const today = "2026-11-17";
  const model = buildAnalytics(rows, { today });
  const cc = [604, 321]; // 2024-01-04 -> 2025-08-30, 2024-08-02 -> 2025-06-19
  assert.equal(model.tatSamples, 2);
  assert.equal(model.averageTat, (cc[0] + cc[1]) / 2);
  assert.equal(model.medianDays, (cc[0] + cc[1]) / 2);
  assert.equal(disposalDays(rows[0], today), null);
  assert.equal(disposalDays(rows[2], today), cc[0]);
  // Disposal counts still include the complaints; only the duration ignores them.
  assert.equal(model.disposed, 4);
});

test("loan type filter offers the fixed product list and matches the case's loan type field", () => {
  assert.equal(LOAN_TYPES.length, 16);
  assert.equal(LOAN_TYPES[0], "Business Loan");
  assert.equal(LOAN_TYPES.at(-1), "BNPL");
  const rows = [
    row(1, { loan_type: "msme loan" }),
    row(2, { loan_type: "Two-Wheeler Loan" }),
    row(3, { case_type: "C.C. - CRIMINAL CASES" }),
  ];
  assert.equal(loanType(rows[0]), "MSME Loan");
  assert.equal(loanType(rows[1]), "Two Wheeler Loan");
  assert.equal(loanType(rows[2]), "", "court case type is not a loan product");
  assert.deepEqual(scopeCases(rows, { loanType: "MSME Loan" }).map((r) => r.id), [rows[0].id]);
  assert.equal(scopeCases(rows, { loanType: "Car Loan" }).length, 0);
});

test("advocate spellings that differ only by honorifics, dots, spacing or case are one advocate", () => {
  const spellings = ["C.H.DODDEGOWDA", "C H DODDEGOWDA", "C.H. DODDEGOWDA", "Sri. C.H. Doddegowda", "SRI. C . H. DODDEGOWDA", "SRI.C H .DODDEGOWDA ADVOCATE"];
  const rows = spellings.map((name, i) => row(i + 1, { case_status: "Pending", petitioners: [`1) NINJACART Advocate- ${name}`] }));
  rows.push(row(20, { case_status: "Pending", petitioners: ["1) NINJACART Advocate- HARISHA M T"] }));
  rows.push(row(21, { case_status: "Pending", petitioners: ["1) NINJACART Advocate- HARISHA M"] }));
  assert.equal(new Set(spellings.map(advocateKey)).size, 1);
  const result = advocatePerformance(rows, "2026-11-17");
  const dodde = result.find((r) => advocateKey(r.label) === "CHDODDEGOWDA");
  assert.equal(dodde.total, 6);
  assert.equal(dodde.spellings.length > 1, true);
  // Different letters stay separate.
  assert.ok(result.some((r) => r.label === "HARISHA M"));
  assert.ok(result.some((r) => r.label === "HARISHA M T"));
  // A case listing the same advocate twice counts once.
  assert.deepEqual(caseAdvocates(row(30, { petitioners: ["1) X Advocate- C.H.DODDEGOWDA", "2) Y Advocate- Sri. C H Doddegowda"] })).length, 1);
});
