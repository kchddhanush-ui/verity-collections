import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCourtDate,
  hearingEvents,
  filterHearingEvents,
  indiaToday,
  monthWeeks,
  shiftMonth,
  caseNumber,
} from "../src/lib/hearings.js";

const row = (cnr, data, hasDetails = true) => ({ cnr, data, hasDetails });
test("court dates are unambiguous calendar days with ordinal/Indian and ISO formats", () => {
  for (const date of [
    "07-10-2026",
    "07/10/2026",
    "7th October 2026",
    "7 Oct 2026",
    "2026-10-07",
    "7-Oct-2026",
  ])
    assert.equal(parseCourtDate(date), "2026-10-07");
  assert.equal(parseCourtDate("18th December 2026"), "2026-12-18");
  assert.equal(parseCourtDate("29-02-2024"), "2024-02-29");
  for (const date of [
    "31-02-2026",
    "29-02-2025",
    "31-04-2026",
    "2026-13-01",
    "-",
    "",
    null,
    "07-10-26",
    "October 7 2026",
    "2026-10-07T23:00:00Z",
  ])
    assert.equal(parseCourtDate(date), null, String(date));
  assert.equal(indiaToday(new Date("2026-10-29T20:00:00Z")), "2026-10-30");
});
test("calendar uses Hearing Date, combines same case/day, and preserves multiple cases on a day", () => {
  const a = row("KAAA010000012025", {
    case_type: "C.C. - CRIMINAL CASES",
    registration_number: "1/2025",
    first_hearing_date: "07-10-2026",
    next_hearing_date: "16th November 2026",
    history: [
      ["Judge", "01-10-2026", "07-10-2026", "SUMMONS"],
      ["Judge", "07-10-2026", "16-11-2026", "EVIDENCE"],
      ["Judge", "07-10-2026", "16-11-2026", "EVIDENCE"],
      ["Judge", "07-10-2026", "31-11-2026", "invalid"],
    ],
  });
  const events = hearingEvents([
    a,
    row("KAAA010000022025", { next_hearing_date: "16-11-2026" }),
    row("KAAA010000032025", { next_hearing_date: "16-11-2026" }, false),
  ]);
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((e) => e.day),
    ["2026-10-07", "2026-11-16", "2026-11-16"],
  );
  assert.equal(events[0].isNext, false);
  assert.equal(events[1].isNext, true);
  assert.deepEqual(events[1].purposes, ["EVIDENCE"]);
  assert.equal(caseNumber(a), "C.C./1/2025");
  assert.equal(
    caseNumber(row("cnr", { case_reference: "P.C.R./2/2025" })),
    "P.C.R./2/2025",
  );
});
test("disposed cases retain recorded history without advertising a next hearing", () => {
  const events = hearingEvents([
    row("KAAA010000012025", {
      case_status: "Disposed",
      next_hearing_date: "16-11-2026",
      history: [["Judge", "01-10-2026", "07-10-2026", "DISPOSAL"]],
    }),
  ]);
  assert.deepEqual(
    events.map((e) => e.day),
    ["2026-10-07"],
  );
  assert.equal(events[0].isNext, false);
  assert.deepEqual(
    hearingEvents([row("test", { history: [null, {}, ["x"]] })]),
    [],
  );
});
test("calendar week alignment, leap day, and month transitions", () => {
  const weeks = monthWeeks("2026-11");
  assert.equal(weeks[0][6], "2026-11-01");
  assert.equal(weeks[1][0], "2026-11-02");
  assert.equal(weeks.flat().filter(Boolean).length, 30);
  assert.equal(monthWeeks("2024-02").flat().filter(Boolean).length, 29);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("calendar search matches case number, CNR, party, court and hearing purpose", () => {
  const events = hearingEvents([
    row("KAAA010000012025", {
      registration_number: "42/2025",
      petitioners: ["Example Finance"],
      respondents: ["Example Trader"],
      court: "Example Magistrate",
      history: [["Judge", "01-10-2026", "07-10-2026", "SUMMONS"]],
    }),
  ]);
  for (const query of [
    "42/2025",
    "KAAA010000012025",
    "finance",
    "TRADER",
    "Magistrate",
    " summons ",
  ])
    assert.equal(filterHearingEvents(events, query).length, 1, query);
  assert.equal(filterHearingEvents(events, "someone else").length, 0);
  assert.equal(filterHearingEvents(events, "").length, 1);
});
