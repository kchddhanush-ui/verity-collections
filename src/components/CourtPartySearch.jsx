import React, { useState } from "react";
import { extensionRequest } from "../lib/extensionBridge";

const courtFields = ["State", "District", "Court complex", "Establishment"];
const initialCriteria = { party: "", year: "", status: "Pending" };

function validCaptcha(value) {
  return typeof value?.challengeId === "string" && typeof value.image === "string" &&
    value.image.length <= 350000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.image);
}

export function CourtPartySearch({ dashboardPayload, onSaved }) {
  const [choices, setChoices] = useState([]);
  const [selections, setSelections] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canReload, setCanReload] = useState(false);
  const [captcha, setCaptcha] = useState(null);
  const [prepared, setPrepared] = useState(false);
  const [notice, setNotice] = useState("");
  const [criteria, setCriteria] = useState(initialCriteria);
  const [started, setStarted] = useState(false);

  async function request(fields) {
    const result = await extensionRequest("PARTY_SEARCH", { ...dashboardPayload(), ...fields });
    if (!result || result.error) throw new Error(result?.error || "eCourts did not respond.");
    if (["prepare", "refresh"].includes(fields.step) && !validCaptcha(result))
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

  async function openCourt(reloadExisting = false, restoreSearch = false) {
    const ping = await extensionRequest("PING");
    if (!ping?.editableCourtSearch)
      throw new Error("Reload Lawcovery Case Capture 1.10.0 in Chrome and refresh Lawcovery.");
    const result = await extensionRequest("PARTY_SEARCH", {
      ...dashboardPayload(), step: "open", reloadExisting, restoreSearch,
    });
    if (result?.error || !result?.options?.length) {
      setCanReload(result?.canReload === true);
      throw new Error(result?.error || "eCourts did not return court options.");
    }
    return result.options;
  }

  function start(reloadExisting = false) {
    run(async () => {
      const options = await openCourt(reloadExisting);
      setCaptcha(null);
      setPrepared(false);
      setNotice("");
      setSelections([]);
      setChoices([options]);
      setCriteria(initialCriteria);
      setStarted(true);
    });
  }

  function invalidateCaptcha() {
    setCaptcha(null);
    setPrepared(false);
    setNotice("");
  }

  function choose(index, value) {
    if (!choices[index]?.some(option => option.value === value)) return;
    invalidateCaptcha();
    const prefix = selections.slice(0, index);
    const available = choices.slice(0, index + 1);
    setSelections(prefix);
    setChoices(available);
    run(async () => {
      const result = await request({ step: index, value });
      setSelections([...prefix, value]);
      if (result.options) setChoices([...available, result.options]);
    });
  }

  function editCriteria(event) {
    const { name, value } = event.target;
    setCriteria(previous => ({ ...previous, [name]: value }));
    invalidateCaptcha();
  }

  function prepare(event) {
    event.preventDefault();
    run(async () => {
      setCaptcha(await request({ step: "prepare", ...criteria }));
      setPrepared(true);
    });
  }

  function refreshCaptcha() {
    setCaptcha(null);
    run(async () => setCaptcha(await request({ step: "refresh" })));
  }

  function restoreSearch() {
    setCaptcha(null);
    run(async () => {
      const available = [await openCourt(true, true)];
      const restored = [];
      setChoices([...available]);
      setSelections([]);
      setPrepared(false);
      for (const [index, value] of selections.entries()) {
        if (!available[index]?.some(option => option.value === value))
          throw new Error("An earlier court selection is unavailable. Choose it again.");
        const result = await request({ step: index, value });
        restored.push(value);
        if (result.options) available.push(result.options);
        setSelections([...restored]);
        setChoices([...available]);
      }
      setCaptcha(await request({ step: "prepare", ...criteria }));
      setPrepared(true);
      setNotice("Search details restored. Enter the new CAPTCHA to continue.");
    });
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
      if (validCaptcha(result.nextCaptcha)) setCaptcha(result.nextCaptcha);
      if (result.saved) await onSaved?.();
    });
  }

  return (
    <section className="card sync-card court-party-search" aria-labelledby="court-party-title">
      <p className="panel-kicker">ECOURTS SEARCH</p>
      <h2 id="court-party-title">Search by party name</h2>
      <p>Choose the court, enter the party name and type the eCourts CAPTCHA here. Lawcovery opens an eCourts tab in the background when needed and saves results to this workspace. Keep the eCourts tab open for future searches.</p>
      {started && (
        <div className="court-location-fields">
          {choices.map((options, index) => (
            <label key={courtFields[index]}>
              {courtFields[index]}
              <select value={selections[index] || ""} disabled={busy} onChange={event => choose(index, event.target.value)}>
                <option value="" disabled>Choose {courtFields[index].toLowerCase()}</option>
                {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {started && selections.length === courtFields.length && (
        <form onSubmit={prepare}>
          <label>Petitioner or respondent<input name="party" value={criteria.party} onChange={editCriteria} required minLength={3} maxLength={99} disabled={busy} /></label>
          <label>Registration year<input name="year" value={criteria.year} onChange={editCriteria} required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} disabled={busy} /></label>
          <label>Status<select name="status" value={criteria.status} onChange={editCriteria} disabled={busy}>
            <option>Pending</option><option>Disposed</option><option>Both</option>
          </select></label>
          {!prepared && <button className="btn btn-primary" disabled={busy} type="submit">Continue to CAPTCHA</button>}
        </form>
      )}
      {busy && <p role="status">Waiting for eCourts…</p>}
      {prepared && (
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
      {selections.length === courtFields.length && criteria.party.trim().length >= 3 &&
        /^\d{4}$/.test(criteria.year.trim()) && (prepared || error) && (
          <button className="btn" type="button" disabled={busy} onClick={restoreSearch}>
            Restore expired search session
          </button>
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
