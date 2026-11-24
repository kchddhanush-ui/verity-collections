import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, previewLoanImport } from "../src/lib/loanImport.js";

test("loan import uses CNR, then case number, then an unambiguous filing number", () => {
  const cases = [
    { id:"one", cnr:"KABC030000012024", data:{ case_reference:"C.C./12/2024", filing_number:"99/2024" } },
    { id:"two", cnr:"KABC030000022024", data:{ case_reference:"C.C./13/2024", filing_number:"100/2024" } },
  ];
  const rows = parseCsv('Case number,CNR number,Filing number,DB Amount,POS as of Nov 16,POS recovered\nC.C./12/2024,KABC030000012024,99/2024,"1,000",900,250\n,CNR missing,100/2024,500,,100\nC.C./12/2024,KABC030000012024,99/2024,10,,1');
  const preview = previewLoanImport(rows, cases);
  assert.equal(preview.matched.length, 2);
  assert.equal(preview.unmatched.length, 0);
  assert.equal(preview.duplicates.length, 1);
  assert.deepEqual(preview.matched[0].db_amount, 1000);
  assert.deepEqual(preview.matched[0].pos_recovered, 250);
});
test("spreadsheet dashes are zero, and all-dash rows are skipped as having no loan data", () => {
  const cases = ["KABC030014642024", "KABC030006142024", "KABC030036782024", "KABC030000992024"]
    .map((cnr) => ({ id: cnr, cnr, data: {} }));
  // Rows exported from Excel's accounting format, as in the November loan sheet.
  const rows = parseCsv([
    'CNR number, DB Amount, POS as of Nov 16, POS recovered',
    'KABC030014642024,"  350,000 ",  -   ,"  350,000 "',
    'KABC030006142024,  -   ,  -   ,  -   ',
    'KABC030036782024,"  33,655 ","  33,655 ",  -   ',
    'KABC030000992024,abc,,',
  ].join("\n"));
  const preview = previewLoanImport(rows, cases);
  assert.equal(preview.matched.length, 2);
  assert.equal(preview.noData.length, 1);
  assert.equal(preview.invalid.length, 1);
  assert.deepEqual(
    preview.matched.map((row) => [row.db_amount, row.pos_as_of_nov_16, row.pos_recovered]),
    [[350000, 0, 350000], [33655, 33655, 0]],
  );
});
