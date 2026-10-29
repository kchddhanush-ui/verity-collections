import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  analyticsOptions,
  buildAnalytics,
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
