import { test } from "node:test";
import assert from "node:assert/strict";
import { currentRecordedStage, previousRecordedStage } from "../src/lib/caseStages.js";

test("saved disposed case without a stage displays its recorded outcome", () => {
  const data = { case_status: "Disposed", history: [["Judge", "20-07-2024", "", "Disposed"]] };
  assert.equal(currentRecordedStage(data), "Disposed");
  assert.equal(previousRecordedStage(data), "—");
});

test("missing stage uses latest dated hearing purpose and previous distinct purpose", () => {
  const data = { history: [["", "10-01-2024", "", "SUMMONS"], ["", "10-03-2024", "", "NBW"], ["", "10-02-2024", "", "NBW"], ["", "", "", "ORDERS"]] };
  assert.equal(currentRecordedStage(data), "NBW");
  assert.equal(previousRecordedStage(data), "SUMMONS");
  assert.equal(currentRecordedStage({ ...data, case_stage: "ARGUMENTS" }), "ARGUMENTS");
  assert.equal(previousRecordedStage({ ...data, case_stage: "ARGUMENTS" }), "NBW");
  assert.equal(currentRecordedStage({ ...data, case_status: "Disposed" }), "Disposed");
});

test("no recorded stage remains empty without inventing history", () => {
  assert.equal(currentRecordedStage({ case_stage: "—" }), "—");
  assert.equal(previousRecordedStage({}), "—");
});
