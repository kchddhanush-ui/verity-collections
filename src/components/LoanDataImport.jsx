import React, { useRef, useState } from "react";
import { parseCsv, previewLoanImport } from "../lib/loanImport";

export function LoanDataImport({ cases, onImport }) {
  const input = useRef(null); const [preview, setPreview] = useState(null); const [filename, setFilename] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function choose(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setMessage(""); setFilename(file.name);
    if (!/\.csv$/i.test(file.name)) return setMessage("Choose a CSV file.");
    const rows = parseCsv(await file.text());
    setPreview(previewLoanImport(rows, cases));
  }
  async function confirm() {
    if (!preview?.matched.length) return; setBusy(true); setMessage("");
    try { const result = await onImport(filename, preview); setMessage(`${result.updated} matched case${result.updated === 1 ? "" : "s"} updated safely.`); setPreview(null); if (input.current) input.current.value = ""; }
    catch (error) {
      const detail = String(error?.message || "");
      // PostgREST returns this when the local SQL migration has not been
      // applied to the connected Supabase project. A raw schema-cache error is
      // not actionable for an administrator using this screen.
      setMessage(
        /import_loan_data.*schema cache/i.test(detail)
          ? "Loan import is not enabled for this database yet. Ask an administrator to apply the loan data import migration, then try again. No case records were changed."
          : detail || "The loan data import could not be completed. No case records were changed.",
      );
    } finally { setBusy(false); }
  }
  return <section className="loan-import console-panel card">
    <div className="section-heading"><div><p className="panel-kicker">ADMINISTRATION</p><h2>Import loan data</h2><p className="muted">Upload a CSV to enrich existing cases. No case identities or court data are changed.</p></div><button className="btn" type="button" onClick={() => input.current?.click()}>Choose CSV</button></div>
    <input ref={input} hidden type="file" accept=".csv,text/csv" onChange={choose} />
    {message && <p role="status">{message}</p>}
    {preview && <div className="loan-import-preview"><p><strong>{preview.total}</strong> CSV rows reviewed</p><div className="loan-import-counts"><span>Matched <b>{preview.matched.length}</b></span><span>Unmatched <b>{preview.unmatched.length}</b></span><span>Ambiguous <b>{preview.ambiguous.length}</b></span><span>Duplicates <b>{preview.duplicates.length}</b></span><span>No loan data <b>{preview.noData.length}</b></span><span>Invalid <b>{preview.invalid.length}</b></span></div><p className="muted">Only uniquely matched rows with valid non-negative amounts will be saved. A dash (-) is read as zero; rows where every amount is blank or a dash are skipped.</p><button className="btn btn-primary" disabled={!preview.matched.length || busy} onClick={confirm}>{busy ? "Importing…" : `Confirm ${preview.matched.length} updates`}</button></div>}
  </section>;
}
