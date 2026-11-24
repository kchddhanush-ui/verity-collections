import { test } from "node:test";
import assert from "node:assert/strict";
import { caseCsv } from "../src/lib/csv.js";

test("CSV keeps Unicode, quotes and multiline fields and neutralises spreadsheet formulas", () => {
  const result = caseCsv(["Name", "Notes"], [
    ['தமிழ், "Company"', "Line 1\nLine 2"],
    ["=1+1", " @SUM(A1)"],
  ]);
  assert.equal(result, '\uFEFF"Name","Notes"\r\n"தமிழ், ""Company""","Line 1\nLine 2"\r\n"\'=1+1","\' @SUM(A1)"');
});
