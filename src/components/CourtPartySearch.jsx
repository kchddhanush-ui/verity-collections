import React, { useState } from "react";
import { extensionRequest } from "../lib/extensionBridge";

const courtFields = ["State", "District", "Court complex", "Establishment"];

export function CourtPartySearch({ dashboardPayload, onSaved }) {
  const [choices, setChoices] = useState([]);
  const [selections, setSelections] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canReload, setCanReload] = useState(false);
  const [captcha, setCaptcha] = useState(null);
  const [prepared, setPrepared] = useState(false);
  const [notice, setNotice] = useState("");
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);

  async function request(fields) {
    const result = await extensionRequest("PARTY_SEARCH", { ...dashboardPayload(), ...fields });
    if (!result || result.error) throw new Error(result?.error || "eCourts did not respond.");
    if (["prepare", "refresh"].includes(fields.step) &&
        (typeof result.challengeId !== "string" || typeof result.image !== "string" ||
          result.image.length > 350000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.image)))
      throw new Error("The eCourts CAPTCHA could not be displayed. Show the eCourts tab to continue.");
    return result;
  }

  async function run(action) {
    setBusy(true);
    setError("");
    setCanReload(false);
    try {
      await action();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function start(reloadExisting = false) {
    setStarted(false);
    setCaptcha(null);
    setPrepared(false);
    setFinished(false);
    setNotice("");
    setSelections([]);
    setChoices([]);
    run(async () => {
      const ping = await extensionRequest("PING");
      if (!ping?.reloadCourtTab) throw new Error("Reload Lawcovery Case Capture 1.9.1 in Chrome and refresh Lawcovery.");
      const result = await extensionRequest("PARTY_SEARCH", {
        ...dashboardPayload(), step: "open", reloadExisting,
      });
      if (result?.error || !result?.options?.length) {
        setCanReload(result?.canReload === true);
        throw new Error(result?.error || "eCourts did not return court options.");
      }
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
      setCaptcha(result);
      setPrepared(true);
    });
  }

  function refreshCaptcha() {
    setCaptcha(null);
    run(async () => setCaptcha(await request({ step: "refresh" })));
  }

  function search(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const answer = String(new FormData(form).get("captcha") || "").trim();
    const challengeId = captcha.challengeId;
    form.reset();
    setCaptcha(null);
    run(async () => {
      const result = await request({ step: "submit", answer, challengeId });
      setNotice(result.message);
      setFinished(true);
      if (result.saved) await onSaved?.();
    });
  }

  return (
    <section className="card sync-card court-party-search" aria-labelledby="court-party-title">
      <p className="panel-kicker">ECOURTS SEARCH</p>
      <h2 id="court-party-title">Search by party name</h2>
      <p>Choose the court, enter the party name and type the eCourts CAPTCHA here. Use Open eCourts once and keep that tab open. Lawcovery uses it in the background and saves results to this workspace.</p>
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
      {started && selections.length === courtFields.length && !prepared && (
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
      {prepared && !finished && (
        <div className="party-captcha">
          {captcha && (
            <form method="post" onSubmit={search}>
              <img src={captcha.image} alt="eCourts CAPTCHA. For audio, show the eCourts tab." />
              <label>
                CAPTCHA
                <input name="captcha" required maxLength={6} pattern="[A-Za-z0-9]{1,6}"
                  autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy} />
              </label>
              <button className="btn btn-primary" type="submit" disabled={busy}>Search eCourts</button>
            </form>
          )}
          <button className="btn" type="button" disabled={busy} onClick={refreshCaptcha}>Get a new CAPTCHA</button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {started && (prepared || error) && (
        <button className="btn" type="button" disabled={busy} onClick={() => run(() => request({ step: "focus" }))}>Show eCourts tab</button>
      )}
      {error && <p role="alert">{error}</p>}
      {canReload && (
        <button className="btn" disabled={busy} type="button" onClick={() => start(true)}>
          Reload open eCourts tab
        </button>
      )}
      <button className="btn" disabled={busy} type="button" onClick={() => start()}>
        {started ? "Start over" : "Load court options"}
      </button>
    </section>
  );
}
