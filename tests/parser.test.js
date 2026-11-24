import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import "../extension/parser.js";
const fixture = await readFile(
  new URL("./fixtures/case-details.html", import.meta.url),
  "utf8",
);
function doc() {
  return parseHTML(fixture).document;
}
test("extract saved case structure without harvesting forms or tokens", () => {
  const d = doc();
  const result = VerityParser.extract(d, () => true);
  assert.equal(result.cnr, "KAAA010000012025");
  assert.equal(result.data.case_stage, "NBW");
  assert.equal(result.data.next_hearing_date, "18th December 2026");
  assert.equal(result.data.history.length, 5);
  assert.equal(result.data.processes.length, 3);
  assert.equal(result.data.petitioners.length, 1);
  assert.equal(result.data.registration_number, "1/2025");
  assert.ok(!JSON.stringify(result).includes("app_token"));
});
test("hidden saved case does not trigger capture", () => {
  assert.equal(VerityParser.extract(doc()), null);
});
test("incomplete or ambiguous case is not captured", () => {
  const d = doc();
  d.querySelector(".case_status_table").remove();
  assert.equal(
    VerityParser.extract(d, () => true),
    null,
  );
  const d2 = doc();
  d2.body.append(d2.querySelector(".case_details_table").cloneNode(true));
  assert.equal(
    VerityParser.extract(d2, () => true),
    null,
  );
});
test("matching search results are not interpreted as case details", () => {
  assert.equal(
    VerityParser.extract(
      parseHTML(
        '<table id="dispTable"><tr><td>1/2025 Example</td></tr></table>',
      ).document,
      () => true,
    ),
    null,
  );
});

test("Decision Date is captured separately from Disposal Date on a disposed case", () => {
  const d = doc();
  d.querySelector(".case_status_table tbody").innerHTML =
    `<tr><th>Case Status</th><td>Disposed</td></tr><tr><th>Decision Date</th><td>07-10-2026</td></tr><tr><th>Disposal Date</th><td>08-10-2026</td></tr><tr><th>Nature of Disposal</th><td>Contested</td></tr>`;
  const result = VerityParser.extract(d, () => true);
  assert.equal(result.parser_version, "1.1.0");
  assert.equal(result.data.decision_date, "07-10-2026");
  assert.equal(result.data.disposal_date, "08-10-2026");
  assert.equal(result.data.case_status, "Disposed");
  for (const label of ["Decision Date", "DECISION DATE :"]) {
    d.querySelector(".case_status_table tbody").innerHTML =
      `<tr><th>Case Status</th><td>Disposed</td></tr><tr><th>${label}</th><td>07-10-2026</td></tr>`;
    const single = VerityParser.extract(d, () => true);
    assert.equal(single.data.decision_date, "07-10-2026");
    assert.equal(single.data.disposal_date, undefined);
  }
  d.querySelector(".case_status_table tbody").innerHTML =
    "<tr><th>Case Status</th><td>Disposed</td></tr><tr><th>Decision Date</th><td>-</td></tr>";
  assert.equal(
    VerityParser.extract(d, () => true).data.decision_date,
    undefined,
  );
});
test("party cells keep each numbered party separate and drop repeated lines", () => {
  const d = doc();
  d.querySelector(".Respondent_Advocate_table").innerHTML =
    "<li>1) KOTESHWAR TRADING COMPANY AND ANOTHER<br>2) NILESH PATIDAR</li>";
  d.querySelector(".Petitioner_Advocate_table").innerHTML =
    "<li>1) NINJACART SERVICES PVT.LTD<br>NINJACART SERVICES PVT.LTD<br>&nbsp;&nbsp;Advocate- HARISHA.M<br></li>";
  const result = VerityParser.extract(d, () => true);
  assert.deepEqual(result.data.respondents, ["1) KOTESHWAR TRADING COMPANY AND ANOTHER", "2) NILESH PATIDAR"]);
  assert.deepEqual(result.data.petitioners, ["1) NINJACART SERVICES PVT.LTD Advocate- HARISHA.M"]);
});
test("the standard single-party layout is unchanged", () => {
  const result = VerityParser.extract(doc(), () => true);
  assert.deepEqual(result.data.petitioners, ["1) Example Finance Pvt Ltd Advocate- EXAMPLE ADVOCATE"]);
  assert.deepEqual(result.data.respondents, ["1) EXAMPLE RESPONDENT"]);
});
test("'Date Not Updated' and dash placeholders are not saved as values", () => {
  const d = doc();
  const cell = (label) => [...d.querySelectorAll(".case_details_table th, .case_status_table th")]
    .find((th) => th.textContent.trim().toLowerCase().replace(/\s*:\s*$/, "") === label)?.nextElementSibling;
  cell("next hearing date").textContent = "18th December 2026 Date Not Updated";
  cell("first hearing date").textContent = "Date Not Updated";
  const result = VerityParser.extract(d, () => true);
  assert.equal(result.data.next_hearing_date, "18th December 2026");
  assert.equal("first_hearing_date" in result.data, false);
  // A dash-only stage is "not recorded". With no stage and no status the page
  // is incomplete, so it is not captured rather than saved with "---".
  const d2 = doc();
  const stage = [...d2.querySelectorAll(".case_details_table th, .case_status_table th")]
    .find((th) => th.textContent.trim().toLowerCase().replace(/\s*:\s*$/, "") === "case stage").nextElementSibling;
  stage.textContent = "---";
  const r2 = VerityParser.extract(d2, () => true);
  assert.ok(!r2 || !("case_stage" in r2.data));
});
