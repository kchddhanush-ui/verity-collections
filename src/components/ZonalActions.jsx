import React, { useMemo, useState } from "react";
import { Dropdown } from "./Dropdown";
import { Metric } from "./AnalyticsDashboard";
import "../analytics-dashboard.css";
import { ZONAL_ACTIONS, actionPriority, caseStatusOf, clean, postalTone, zonePerformance, zonesOf } from "../lib/zonalActions";
import { dummyZonalRows } from "../lib/zonalDummy"; // TEMPORARY dummy data
import "../zonal-actions.css";

const PRIORITY_GROUPS = [
  { level: "high", label: "High priority", why: "Postal returned or not booked, or a warrant / arrest to execute" },
  { level: "medium", label: "Medium priority", why: "Summons or warrant in transit" },
  { level: "low", label: "Low priority", why: "Delivered and waiting on the court" },
  { level: "disposed", label: "Disposed", why: "Closed cases, no action pending" },
];
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const pctFormat = (v) => `${Math.round(v * 10) / 10}%`;
const caseCount = (k) => `${k} ${k === 1 ? "case" : "cases"}`;

// Zone-wise action board: what each zonal officer needs to do on each case.
export function ZonalActions({ cases = [], rows: givenRows }) {
  const rows = useMemo(() => givenRows || [...ZONAL_ACTIONS, ...dummyZonalRows(cases)], [givenRows, cases]);
  const zones = useMemo(() => zonesOf(rows), [rows]);
  const performance = useMemo(() => zonePerformance(rows, zones), [rows, zones]);
  // Comparison table: zones needing the most action first, zones without data last.
  const ranked = useMemo(() => [...performance].sort((a, b) =>
    (b.cases ? 1 : 0) - (a.cases ? 1 : 0) || (b.share ?? -1) - (a.share ?? -1) || b.nbw - a.nbw || a.zone.localeCompare(b.zone)), [performance]);
  const [zone, setZone] = useState(() => ranked[0]?.zone || zones[0]);
  const [status, setStatus] = useState("");
  const [legal, setLegal] = useState("");
  const [postal, setPostal] = useState("");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [openGroup, setOpenGroup] = useState("");
  const [focusCase, setFocusCase] = useState("");

  const inZone = rows.filter((row) => clean(row.zone) === zone);
  const legalOptions = [...new Set(inZone.map((row) => clean(row.legalStatus)).filter(Boolean))].sort();
  const postalOptions = [...new Set(inZone.map((row) => clean(row.postalStatus)).filter(Boolean))].sort();
  const q = query.trim().toLowerCase();
  // The filters at the top apply to the whole zone view: figures and list.
  const scoped = inZone.filter((row) =>
    (!status || caseStatusOf(row) === status) &&
    (!legal || clean(row.legalStatus) === legal) &&
    (!postal || clean(row.postalStatus) === postal) &&
    (!q || [row.entity, row.filingNumber, row.trackingNumber].some((value) => String(value || "").toLowerCase().includes(q))),
  );
  const filtersOn = Boolean(status || legal || postal || q);
  // Cases needing the most action come first.
  const ordered = scoped
    .map((row) => ({ row, priority: actionPriority(row) }))
    .sort((a, b) => b.priority.score - a.priority.score || String(a.row.entity).localeCompare(String(b.row.entity)));
  const clearFilters = () => { setStatus(""); setLegal(""); setPostal(""); setQuery(""); };
  const chooseZone = (name) => { setZone(name); clearFilters(); setOpenGroup(""); setFocusCase(""); };

  const pending = scoped.filter((row) => caseStatusOf(row) === "Pending");
  const disposed = scoped.length - pending.length;
  const groupBy = (list, key) => [...new Set(list.map(key))]
    .map((label) => {
      const n = list.filter((row) => key(row) === label).length;
      return { label, count: n, share: pct(n, list.length) };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const stageRows = groupBy(pending, (row) => clean(row.legalStatus) || "Stage not recorded");
  const tracked = scoped.filter((row) => clean(row.postalStatus));
  const followUp = tracked.filter((row) => ["bad", "warn"].includes(postalTone(row.postalStatus))).length;
  const postalRows = groupBy(tracked, (row) => clean(row.postalStatus)).map((row) => ({ ...row, tone: postalTone(row.label) }));

  const caseKey = (row, index) => `${row.zone}-${row.filingNumber}-${index}`;
  const openCase = (level, key) => {
    setOpenGroup(level);
    setFocusCase(key);
    setTimeout(() => document.getElementById(`za-case-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };
  const renderCase = (row, priority, index) => {
    const tone = postalTone(row.postalStatus);
    const tracking = clean(row.trackingNumber);
    const key = caseKey(row, index);
    return (
      <li key={key} id={`za-case-${key}`} className={`za-case pr-${priority.level} ${focusCase === key ? "is-focus" : ""}`} style={{ "--i": Math.min(index, 12) }}>
        <div className="za-case-id">
          <div className="za-case-title">
            <strong>{row.entity}</strong>
            <span>Filing no. {row.filingNumber}</span>
          </div>
          <span className="za-pills">
            <span className="za-pill legal">{clean(row.legalStatus) || "Not recorded"}</span>
          </span>
        </div>
        <div className="za-case-post">
          <small>Postal status</small>
          <span className={`za-pill post ${tone}`}>{clean(row.postalStatus) || "No postal record"}</span>
          {tracking && (
            <span className="za-track">
              <code>{tracking}</code>
              <button type="button" onClick={() => copy(tracking)} aria-label={`Copy tracking number ${tracking}`}>
                {copied === tracking ? "Copied" : "Copy"}
              </button>
            </span>
          )}
        </div>
        <div className="za-case-action lit">
          <small>Call to action</small>
          <strong>{row.action}</strong>
          <p><span>Next step</span>{row.nextStep}</p>
        </div>
      </li>
    );
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(""), 1500); } catch {}
  };

  return (
    <section className="za" aria-labelledby="za-title">
      <header className="za-head">
        <div>
          <p className="za-kicker">ZONE TRACKER</p>
          <h1 id="za-title">What each zone needs to do next</h1>
          <p>Every case with its legal status, postal status and the action expected from the zonal officer.</p>
        </div>
        <div className="za-zones" role="tablist" aria-label="Zone">
          {performance.map((row) => (
            <button type="button" role="tab" key={row.zone} aria-selected={zone === row.zone}
              className={zone === row.zone ? "is-on" : ""} onClick={() => chooseZone(row.zone)}>
              {row.zone}
            </button>
          ))}
        </div>
      </header>

      {inZone.length > 0 && (
        <div className="za-filters">
          <label className="za-search">
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Entity, filing or tracking number" />
          </label>
          <label><span>Case status</span>
            <Dropdown ariaLabel="Case status" value={status} onChange={setStatus} options={[{ value: "", label: "All cases" }, "Pending", "Disposed"]} />
          </label>
          <label><span>Legal status</span>
            <Dropdown ariaLabel="Legal status" value={legal} onChange={setLegal} options={[{ value: "", label: "All legal statuses" }, ...legalOptions]} />
          </label>
          <label><span>Postal status</span>
            <Dropdown ariaLabel="Postal status" value={postal} onChange={setPostal} options={[{ value: "", label: "All postal statuses" }, ...postalOptions]} />
          </label>
          <button type="button" className="za-clear" disabled={!filtersOn} onClick={clearFilters}>Clear</button>
        </div>
      )}


      {inZone.length === 0 ? (
        <div className="za-empty za-empty-zone">
          <strong>No cases for the {zone} zone yet</strong>
          <span>They will appear here once the {zone} zone's data is added.</span>
        </div>
      ) : (
        <>
          <div className="analytics-metrics za-metrics">
            <Metric label="Cases in zone" icon="cases" value={scoped.length} format={(v) => String(Math.round(v))}
              note={filtersOn ? `of ${inZone.length} · filters on` : `${tracked.length} with postal tracking`} />
            <Metric label="Pending cases" icon="clock" value={pct(pending.length, scoped.length)} format={pctFormat}
              note={caseCount(pending.length)} tone="attention" kind="metric-percentage" share={pct(pending.length, scoped.length)} />
            <Metric label="Disposed cases" icon="check" value={pct(disposed, scoped.length)} format={pctFormat}
              note={caseCount(disposed)} tone="success" kind="metric-percentage" share={pct(disposed, scoped.length)} />
            <Metric label="Postal follow-up" icon="calendar" value={pct(followUp, tracked.length)} format={pctFormat}
              note={`${caseCount(followUp)} · returned or not booked`} tone="highlight" kind="metric-percentage" share={pct(followUp, tracked.length)} />
          </div>

          <article className="analytics-panel card stage-panel">
            <header>
              <div>
                <p className="panel-kicker">PENDING</p>
                <h2>Pending cases by stage</h2>
              </div>
              <span>{zone} zone · click a card to filter</span>
            </header>
            {pending.length === 0 ? (
              <p className="analytics-empty">No pending cases for this selection.</p>
            ) : (
              <div className="stage-cards">
                <button type="button" className={`stage-card total ${status === "Pending" && !legal ? "is-selected" : ""}`}
                  onClick={() => { const on = status === "Pending" && !legal; setStatus(on ? "" : "Pending"); setLegal(""); }}>
                  <span>All pending</span>
                  <strong>{pending.length}</strong>
                  <small>cases</small>
                </button>
                {stageRows.map((row) => (
                  <button type="button" key={row.label} aria-pressed={legal === row.label}
                    className={`stage-card ${/nbw/i.test(row.label) ? "nbw" : ""} ${legal === row.label ? "is-selected" : ""}`}
                    onClick={() => setLegal(legal === row.label ? "" : row.label)}>
                    <span>{row.label}</span>
                    <strong>{row.share}%</strong>
                    <small>{caseCount(row.count)}</small>
                    <i><b style={{ inlineSize: `${row.share}%` }} /></i>
                    {/nbw/i.test(row.label) && <em>Review priority</em>}
                  </button>
                ))}
              </div>
            )}
          </article>

          {postalRows.length > 0 && (
            <article className="analytics-panel card stage-panel za-postal-panel">
              <header>
                <div>
                  <p className="panel-kicker">POSTAL</p>
                  <h2>Postal status</h2>
                </div>
                <span>{caseCount(tracked.length)} with postal tracking</span>
              </header>
              <div className="stage-cards">
                {postalRows.map((row) => (
                  <button type="button" key={row.label} aria-pressed={postal === row.label}
                    className={`stage-card za-post-card ${row.tone} ${postal === row.label ? "is-selected" : ""}`}
                    onClick={() => setPostal(postal === row.label ? "" : row.label)}>
                    <span>{row.label}</span>
                    <strong>{row.share}%</strong>
                    <small>{caseCount(row.count)}</small>
                    <i><b style={{ inlineSize: `${row.share}%` }} /></i>
                  </button>
                ))}
              </div>
            </article>
          )}

          {scoped.length === 0 ? (
            <p className="za-empty">No cases match these filters.</p>
          ) : (
            <div className="za-groups">
              {PRIORITY_GROUPS.map((group) => {
                const items = ordered.filter((entry) => entry.priority.level === group.level);
                if (!items.length) return null;
                const open = openGroup === group.level;
                return (
                  <article key={group.level} className={`za-group pr-${group.level} ${open ? "is-open" : ""}`}>
                    <button type="button" className="za-group-head" aria-expanded={open}
                      onClick={() => { setOpenGroup(open ? "" : group.level); setFocusCase(""); }}>
                      <span className={`za-priority ${group.level}`}>{group.label}</span>
                      <strong>{caseCount(items.length)}</strong>
                      <span className="za-group-why">{group.why}</span>
                      <span className="za-group-toggle">{open ? "Hide details" : "View case details"}<i aria-hidden="true">›</i></span>
                    </button>
                    {!open ? (
                      <ul className="za-group-list">
                        {items.map(({ row }, index) => (
                          <li key={`${row.filingNumber}-${index}`}>
                            <button type="button" onClick={() => openCase(group.level, caseKey(row, index))}>
                              <code>{row.filingNumber}</code>
                              <span title={row.entity}>{row.entity}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ol className="za-list">
                        {items.map(({ row, priority }, index) => renderCase(row, priority, index))}
                      </ol>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
