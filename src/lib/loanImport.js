const key = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const headerKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Spreadsheet accounting formats export zero as a dash ("  -   "). Treat a
// lone dash as 0 so a row like "350,000 | - | 350,000" is not rejected.
const DASH = /^[-—–]+$/;
const amount = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return { value: null, valid: true };
  if (DASH.test(raw)) return { value: 0, valid: true, dash: true };
  if (!/^[₹\s,0-9]+(?:\.\d{1,2})?$/.test(raw)) return { value: null, valid: false };
  const valueNumber = Number(raw.replace(/[₹,\s]/g, ""));
  return { value: Number.isFinite(valueNumber) && valueNumber >= 0 ? valueNumber : null, valid: Number.isFinite(valueNumber) && valueNumber >= 0 };
};
export const formatInr = (value) => value == null ? "—" : new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:0 }).format(value);
export function parseCsv(text) {
  const rows = []; let row = [], cell = "", quote = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (ch === '"') { if (quote && text[i + 1] === '"') { cell += ch; i++; } else quote = !quote; }
    else if (ch === ',' && !quote) { row.push(cell); cell = ""; }
    else if ((ch === '\n' || ch === '\r') && !quote) { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "").trim()) || [];
  return rows.map((values, index) => ({
    line: index + 2,
    values: Object.fromEntries(headers.map((name, column) => [name, values[column]?.trim() || ""])),
  }));
}
const pick = (values, names) => { const entries = Object.entries(values); return entries.find(([name]) => names.includes(headerKey(name)))?.[1] || ""; };
export function previewLoanImport(rows, cases) {
  const by = (read) => { const map = new Map(); cases.filter((item) => item.id).forEach((item) => { const value = key(read(item)); if (value) map.set(value, [...(map.get(value) || []), item]); }); return map; };
  const cnrs = by((item) => item.cnr), caseNumbers = by((item) => item.data?.case_reference || item.data?.registration_number), filings = by((item) => item.data?.filing_number);
  const seen = new Set(); const matched = [], unmatched = [], ambiguous = [], invalid = [], duplicates = [], noData = [];
  rows.forEach((row) => {
    const cnr = pick(row.values,["cnrnumber","cnr"]), caseNumber = pick(row.values,["casenumber","caseno","casereference"]), filing = pick(row.values,["filingnumber","filingno"]);
    const identity = [key(cnr),key(caseNumber),key(filing)].join("|");
    if (!identity.replaceAll("|", "")) return invalid.push(row);
    if (seen.has(identity)) return duplicates.push(row); seen.add(identity);
    const db = amount(pick(row.values,["dbamount"])), recovered = amount(pick(row.values,["posrecovered"])), pos = amount(pick(row.values,["posasofnov16"]));
    if (!db.valid || !recovered.valid || !pos.valid) return invalid.push(row);
    // All-dash or blank amounts mean the sheet has no loan data for this case.
    const hasAmount = [db, recovered, pos].some((item) => item.value != null && !item.dash);
    if (!hasAmount) return noData.push(row);
    const choices = (key(cnr) && cnrs.get(key(cnr))) || (key(caseNumber) && caseNumbers.get(key(caseNumber))) || (key(filing) && filings.get(key(filing))) || [];
    if (!choices.length) return unmatched.push(row); if (choices.length !== 1) return ambiguous.push(row);
    matched.push({ ...row, case:choices[0], db_amount:db.value, pos_recovered:recovered.value, pos_as_of_nov_16:pos.value });
  });
  return { total:rows.length, matched, unmatched, ambiguous, invalid, duplicates, noData };
}
