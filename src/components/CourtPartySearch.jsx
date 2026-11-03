import React, { useState } from "react";
import { extensionRequest } from "../lib/extensionBridge";

const courtFields = ["State", "District", "Court complex", "Establishment"];

export function CourtPartySearch({ dashboardPayload }) {
  const [choices, setChoices] = useState([]);
  const [selections, setSelections] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);

  async function request(fields) {
    const result = await extensionRequest("PARTY_SEARCH", { ...dashboardPayload(), ...fields });
    if (!result || result.error) throw new Error(result?.error || "eCourts did not respond.");
    return result;
  }

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function start() {
    setStarted(false);
    setReady(false);
    setSelections([]);
    setChoices([]);
    run(async () => {
      const ping = await extensionRequest("PING");
      if (!ping?.partySearch) throw new Error("Reload Lawcovery Case Capture 1.5.0 in Chrome and refresh this page.");
      const result = await request({ step: "open" });
      setChoices(result.options || []);
      setStarted(true);
    });
  }

  function choose(value) {
    const option = choices.find((item) => item.value === value);
    if (!option) return;
    run(async () => {
      const result = await request({ step: selections.length, value });
      setSelections([...selections, option.label]);
      setChoices(result.options || []);
    });
  }

  function prepare(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(async () => {
      const result = await request({
        step: "prepare",
        party: String(form.get("party")).trim(),
        year: String(form.get("year")).trim(),
        status: form.get("status"),
      });
      if (!result.ready) throw new Error("Check the eCourts tab before continuing.");
      setReady(true);
    });
  }

  return (
    <section className="card sync-card court-party-search" aria-labelledby="court-party-title">
      <p className="panel-kicker">ECOURTS SEARCH</p>
      <h2 id="court-party-title">Search by party name</h2>
      <p>Choose the court and enter your search in Lawcovery. Finish the CAPTCHA and click Go in eCourts to save the results.</p>
      {selections.length > 0 && (
        <dl>{selections.map((label, index) => (
          <div key={courtFields[index]}><dt>{courtFields[index]}</dt><dd>{label}</dd></div>
        ))}</dl>
      )}
      {started && selections.length < courtFields.length && !error && (
        <label>
          {courtFields[selections.length]}
          <select value="" disabled={busy} onChange={(event) => choose(event.target.value)}>
            <option value="">Choose {courtFields[selections.length].toLowerCase()}</option>
            {choices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      )}
      {started && selections.length === courtFields.length && !ready && (
        <form onSubmit={prepare}>
          <label>Petitioner or respondent<input name="party" required minLength={3} maxLength={99} disabled={busy} /></label>
          <label>Registration year<input name="year" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} disabled={busy} /></label>
          <label>Status<select name="status" defaultValue="Pending" disabled={busy}>
            <option>Pending</option><option>Disposed</option><option>Both</option>
          </select></label>
          <button className="btn btn-primary" disabled={busy} type="submit">Continue to CAPTCHA</button>
        </form>
      )}
      {busy && <p role="status">Waiting for eCourts…</p>}
      {ready && <p role="status">The eCourts form is ready. Complete the CAPTCHA and click Go. Results will save to this workspace through your extension connection.</p>}
      {error && <p role="alert">{error}</p>}
      <button className="btn" disabled={busy} type="button" onClick={start}>
        {started ? "Start over" : "Load court options"}
      </button>
    </section>
  );
}
