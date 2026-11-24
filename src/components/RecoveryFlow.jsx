import React, { useEffect, useRef, useState } from "react";
import "../recovery-flow.css";

// The standard legal and recovery path for an unpaid loan. Days are counted
// from the demand notice; start/end place each stage on the roadmap.
export const PHASES = [
  { id: "pre", label: "Pre-litigation", range: "Day 1 – 60", from: 0, to: 60 },
  { id: "lit", label: "Litigation", range: "Day 60 – 150", from: 60, to: 150 },
  { id: "enf", label: "Enforcement", range: "Day 150 onwards", from: 150, to: 220 },
];

export const FLOW_STAGES = [
  {
    title: "Demand Notice Issuance", short: "Demand notice", when: "Day 1", start: 1, end: 1, phase: "pre",
    what: "A formal demand for the overdue amount is sent to the borrower.",
    next: "No payment or response within 30 days → legal notice.",
    gap: "30 days",
  },
  {
    title: "Legal Notice Issuance", short: "Legal notice", when: "By day 30", start: 30, end: 30, phase: "pre",
    what: "A legal notice is issued through the advocate, giving the borrower a final chance to pay.",
    next: "The borrower has a 30-day window (day 30 – 60) to respond. No response → case filing.",
    gap: "30-day window",
  },
  {
    title: "Case Filing", short: "Case filing", when: "Day 60 – 75", start: 60, end: 75, phase: "lit",
    what: "The case is filed in the competent court once the response window lapses.",
    next: "The court registers the case and issues summons.",
  },
  {
    title: "Summon Issuance", short: "Summons", when: "Day 75 – 90", start: 75, end: 90, phase: "lit",
    what: "The court issues summons directing the borrower to appear.",
    next: "Hearings continue; non-appearance moves the case to trial / NBW.",
    gap: "Hearings",
  },
  {
    title: "Trial / NBW", short: "Trial / NBW", when: "Day 120 – 150", start: 120, end: 150, phase: "lit",
    what: "The trial proceeds. If the borrower does not appear, the court issues a Non-Bailable Warrant (NBW).",
    next: "The NBW is sent to the police station.",
  },
  {
    title: "Warrant Delivery to Police Station", short: "Warrant to police", when: "Day 150 – 180", start: 150, end: 180, phase: "enf",
    what: "The warrant is delivered to the jurisdictional police station for execution.",
    next: "Police take up the warrant.",
  },
  {
    title: "Warrant Execution", short: "Warrant execution", when: "Day 180 – 200", start: 180, end: 200, phase: "enf",
    what: "The police execute the warrant against the borrower.",
    next: "The borrower is arrested or comes forward to settle.",
  },
  {
    title: "Arrest / Settlement", short: "Arrest / settlement", when: "Day 200 onwards", start: 200, end: 220, phase: "enf",
    what: "The borrower is arrested and produced before the court, or settles the dues.",
    next: "Recovery is closed on settlement.",
  },
];

const SCALE = 220; // days covered by the roadmap
const at = (day) => Math.min(1, Math.max(0, day / SCALE));
const STEP_MS = 3000;

export function RecoveryFlow() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const root = useRef(null);
  const stage = FLOW_STAGES[active];
  const last = FLOW_STAGES.length - 1;
  const phase = PHASES.find((item) => item.id === stage.phase);

  useEffect(() => {
    if (!playing) return undefined;
    if (active >= last) { setPlaying(false); return undefined; }
    const timer = setTimeout(() => setActive((i) => Math.min(last, i + 1)), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, active, last]);

  useEffect(() => {
    const sync = () => setPresenting(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (!root.current?.contains(document.activeElement) && document.fullscreenElement !== root.current) return;
      if (event.key === "ArrowRight") { setPlaying(false); setActive((i) => Math.min(last, i + 1)); }
      if (event.key === "ArrowLeft") { setPlaying(false); setActive((i) => Math.max(0, i - 1)); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [last]);

  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (active >= last) setActive(0);
    setPlaying(true);
  };
  const present = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else root.current?.requestFullscreen?.().catch(() => {});
  };
  const pick = (index) => { setPlaying(false); setActive(index); };

  return (
    <section ref={root} className={`rf ${presenting ? "is-presenting" : ""}`} aria-labelledby="rf-title">
      <header className="rf-head">
        <div>
          <p className="rf-kicker">LEGAL &amp; RECOVERY FLOW</p>
          <h1 id="rf-title">From demand notice to recovery in about 200 days</h1>
          <p className="rf-lede">
            Eight stages across pre-litigation, litigation and enforcement, each with its target timeline counted from
            the day the demand notice is issued.
          </p>
        </div>
        <div className="rf-actions">
          <button type="button" className="rf-btn rf-primary" onClick={play}>
            {playing ? "Pause" : active >= last ? "Replay flow" : "Play flow"}
          </button>
          <button type="button" className="rf-btn" onClick={() => pick(0)} disabled={active === 0 && !playing}>Restart</button>
          <button type="button" className="rf-btn" onClick={present}>{presenting ? "Exit full screen" : "Present"}</button>
        </div>
      </header>

      <ul className="rf-phases" aria-label="Phases">
        {PHASES.map((item, index) => (
          <li key={item.id} className={`rf-phase ${item.id} ${stage.phase === item.id ? "is-current" : ""}`}>
            <span className="rf-phase-num">{index + 1}</span>
            <div><strong>{item.label}</strong><span>{item.range}</span></div>
          </li>
        ))}
      </ul>

      <ol className="rf-steps" style={{ "--progress": active / last }}>
        <span className="rf-track" aria-hidden="true"><b /></span>
        {FLOW_STAGES.map((item, index) => (
          <li
            key={item.title}
            className={`rf-step ${item.phase} ${index === active ? "is-active" : ""} ${index < active ? "is-done" : ""}`}
            style={{ "--i": index }}
          >
            <button type="button" onClick={() => pick(index)} aria-current={index === active ? "step" : undefined}>
              <span className="rf-node" aria-hidden="true">{index < active ? "✓" : index + 1}</span>
              <span className="rf-name">{item.title}</span>
              <span className="rf-day">{item.when}</span>
            </button>
            {item.gap && <span className="rf-gap" aria-hidden="true">{item.gap}</span>}
          </li>
        ))}
      </ol>

      <article key={active} className={`rf-detail ${stage.phase}`} aria-live="polite">
        <div className="rf-detail-title">
          <span className="rf-detail-num">{String(active + 1).padStart(2, "0")}</span>
          <div>
            <p>{phase.label} · Stage {active + 1} of {FLOW_STAGES.length}</p>
            <h2>{stage.title}</h2>
            <span className="rf-window">{stage.when}</span>
          </div>
        </div>
        <div className="rf-detail-block">
          <h3>What happens</h3>
          <p>{stage.what}</p>
        </div>
        <div className="rf-detail-block">
          <h3>Moves forward when</h3>
          <p>{stage.next}</p>
        </div>
        <div className="rf-nav">
          <button type="button" className="rf-btn" onClick={() => pick(Math.max(0, active - 1))} disabled={active === 0}>← Previous</button>
          <button type="button" className="rf-btn rf-primary" onClick={() => pick(Math.min(last, active + 1))} disabled={active === last}>Next stage →</button>
        </div>
      </article>

      <article className="rf-roadmap" aria-label="Recovery roadmap">
        <header>
          <div>
            <p className="rf-kicker">ROADMAP</p>
            <h2>The recovery journey at a glance</h2>
          </div>
          <span>About 200 days end to end</span>
        </header>
        <div className="rf-road">
          {FLOW_STAGES.map((item, index) => {
            const mid = at((item.start + item.end) / 2);
            return (
              <button
                type="button"
                key={item.title}
                className={`rf-mile ${item.phase} ${index % 2 ? "below" : "above"} ${index === active ? "is-active" : ""} ${index <= active ? "is-reached" : ""}`}
                style={{ "--x": mid, "--i": index }}
                onClick={() => pick(index)}
              >
                <span className="rf-mile-card">
                  <small>Stage {index + 1}</small>
                  <strong>{item.short}</strong>
                  <em>{item.when}</em>
                </span>
                <span className="rf-mile-stem" aria-hidden="true" />
              </button>
            );
          })}
          <div className="rf-axis" aria-hidden="true">
            {PHASES.map((item) => (
              <span key={item.id} className={`rf-axis-band ${item.id}`} style={{ "--from": at(item.from), "--to": at(item.to) }}>
                <em>{item.label}</em>
              </span>
            ))}
            {FLOW_STAGES.map((item, index) => (
              <span
                key={item.title}
                className={`rf-axis-span ${item.phase} ${index <= active ? "is-reached" : ""}`}
                style={{ "--from": at(item.start), "--to": at(item.end) }}
              />
            ))}
            <span className="rf-axis-window" style={{ "--from": at(30), "--to": at(60) }} title="30-day response window" />
            <span className="rf-axis-now" style={{ "--x": at(stage.start) }} />
          </div>
        </div>
      </article>
    </section>
  );
}
