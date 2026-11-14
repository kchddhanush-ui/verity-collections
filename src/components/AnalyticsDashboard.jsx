import React, { useMemo, useState } from "react";
import {
  NO_STAGE,
  activitySeries,
  advocatePerformance,
  buildAnalytics,
  caseStatus,
  courtName,
  filingYears,
  nbwInsight,
  pendingStageCards,
  scopeCases,
} from "../lib/analytics";
import "../analytics-dashboard.css";
import "../theme-system.css";

const n = (value) => (value == null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 1 }));
// 412 -> "412 days", with a months/years hint once it is long enough to matter.
const days = (value) => (value == null ? "—" : `${Math.round(value).toLocaleString("en-IN")} days`);
const span = (value) =>
  value == null ? "" : value < 60 ? "" : value < 730 ? `≈ ${(value / 30.4).toFixed(1)} months` : `≈ ${(value / 365).toFixed(1)} years`;

function Metric({ label, value, note, tone = "" }) {
  return (
    <article className={`analytics-metric ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Bars({ rows, onSelect, empty }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  if (!rows.some((row) => row.count)) return <p className="analytics-empty">{empty}</p>;
  return (
    <div className="analytics-bars">
      {rows.map((row) => (
        <button key={row.label} className="analytics-bar" disabled={!row.count} onClick={() => onSelect(row)}>
          <span>{row.label}</span>
          <i><b style={{ inlineSize: `${(row.count / max) * 100}%` }} /></i>
          <strong>{row.count}</strong>
        </button>
      ))}
    </div>
  );
}

// Filings vs disposals. Every bar shows its number; clicking a column shows the
// exact figures below the chart and lets you open those cases.
function Activity({ series, granularity, setGranularity, year, onOpen }) {
  const [picked, setPicked] = useState(null);
  const max = Math.max(...series.rows.flatMap((row) => [row.filings, row.disposals]), 1);
  const BAR_AREA = 150; // px
  const height = (value) => (value ? Math.max(3, Math.round((value / max) * BAR_AREA)) : 0);
  const selected = series.rows.find((row) => row.key === picked) || null;
  const rangeText =
    granularity === "month" ? (year ? `Months of ${year}` : "Last 12 months") : "By year";
  return (
    <article className="analytics-panel card analytics-activity">
      <header>
        <div>
          <p className="panel-kicker">ACTIVITY</p>
          <h2>Filings and disposals</h2>
        </div>
        <div className="analytics-segment" role="group" aria-label="Chart grouping">
          {[["year", "Yearly"], ["month", "Monthly"]].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={granularity === value}
              onClick={() => { setGranularity(value); setPicked(null); }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="activity-key">
        <span><i className="filed" /> Filed</span>
        <span><i className="disposed" /> Disposed</span>
        <small>{rangeText} · click a bar for details</small>
      </div>
      {series.rows.length === 0 ? (
        <p className="analytics-empty">No filing or disposal dates recorded yet.</p>
      ) : (
        <div className="activity-chart" role="group" aria-label="Filings and disposals chart">
          {series.rows.map((row) => (
            <button
              key={row.key}
              className={`activity-column ${picked === row.key ? "is-selected" : ""}`}
              aria-pressed={picked === row.key}
              aria-label={`${row.label}: ${row.filings} filed, ${row.disposals} disposed`}
              onClick={() => setPicked(picked === row.key ? null : row.key)}
            >
              <div className="activity-bars" style={{ blockSize: BAR_AREA + 18 }}>
                <span className="activity-bar">
                  <em>{row.filings}</em>
                  <i className="filed" style={{ blockSize: height(row.filings) }} />
                </span>
                <span className="activity-bar">
                  <em>{row.disposals}</em>
                  <i className="disposed" style={{ blockSize: height(row.disposals) }} />
                </span>
              </div>
              <span className="activity-label">{row.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="activity-detail" aria-live="polite">
        {selected ? (
          <>
            <strong>{selected.label}{granularity === "month" && year ? ` ${year}` : ""}</strong>
            <span>{n(selected.filings)} filed</span>
            <span>{n(selected.disposals)} disposed</span>
            <button disabled={!selected.filings} onClick={() => onOpen(selected.filedCases)}>View filed cases →</button>
            <button disabled={!selected.disposals} onClick={() => onOpen(selected.disposedCases)}>View disposed cases →</button>
          </>
        ) : (
          <span className="analytics-footnote">
            Showing {n(series.shownFilings)} of {n(series.totalFilings)} filings and {n(series.shownDisposals)} of{" "}
            {n(series.totalDisposals)} disposals that have a recorded date.
          </span>
        )}
      </div>
    </article>
  );
}

function AdvocateTable({ rows, onOpen }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("cases");
  const [showAll, setShowAll] = useState(false);
  const sorters = {
    cases: (a, b) => b.total - a.total,
    disposed: (a, b) => b.disposed - a.disposed || b.total - a.total,
    fastest: (a, b) => (a.averageTat ?? Infinity) - (b.averageTat ?? Infinity),
    slowest: (a, b) => (b.averageTat ?? -Infinity) - (a.averageTat ?? -Infinity),
  };
  const needle = query.trim().toUpperCase();
  const visible = rows
    .filter((row) => !needle || row.label.includes(needle))
    .sort((a, b) => sorters[sort](a, b) || a.label.localeCompare(b.label));
  const shown = showAll ? visible : visible.slice(0, 12);
  return (
    <article className="analytics-panel card advocate-panel">
      <header>
        <div>
          <p className="panel-kicker">ADVOCATES</p>
          <h2>Advocate-wise performance</h2>
        </div>
        <span>{rows.length} advocate{rows.length === 1 ? "" : "s"}</span>
      </header>
      <div className="advocate-tools">
        <input
          type="search"
          placeholder="Search advocate…"
          aria-label="Search advocate"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label>
          Sort by
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="cases">Most cases</option>
            <option value="disposed">Most disposed</option>
            <option value="fastest">Fastest TAT</option>
            <option value="slowest">Slowest TAT</option>
          </select>
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="analytics-empty">No advocate matches this search.</p>
      ) : (
        <div className="advocate-scroll">
          <table className="advocate-table">
            <thead>
              <tr>
                <th>Advocate</th>
                <th className="num">Cases</th>
                <th>Where their cases stand</th>
                <th className="num">Avg. TAT (filing → disposal)</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const unknown = row.total - row.disposed - row.pending;
                return (
                  <tr key={row.label}>
                    <td>
                      <button className="advocate-name" onClick={() => onOpen(row.cases)}>{row.label}</button>
                    </td>
                    <td className="num"><strong>{row.total}</strong></td>
                    <td>
                      <div className="advocate-chips">
                        {row.disposed > 0 && (
                          <button className="chip done" onClick={() => onOpen(row.disposedCases)}>
                            {row.disposed} disposed
                          </button>
                        )}
                        {row.stages.map((stage) => (
                          <button
                            key={stage.label}
                            className={`chip ${stage.label === "NBW" ? "nbw" : ""}`}
                            onClick={() => onOpen(stage.cases)}
                          >
                            {stage.count} {stage.label === NO_STAGE ? "no stage" : stage.label}
                          </button>
                        ))}
                        {unknown > 0 && <span className="chip muted">{unknown} status unknown</span>}
                      </div>
                    </td>
                    <td className="num">
                      <strong>{days(row.averageTat)}</strong>
                      <small>
                        {row.tatSamples
                          ? `${span(row.averageTat) ? `${span(row.averageTat)} · ` : ""}${row.tatSamples} disposed case${row.tatSamples === 1 ? "" : "s"}`
                          : "No disposed cases yet"}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {visible.length > 12 && (
        <button className="analytics-link show-all" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show top 12" : `Show all ${visible.length} advocates`}
        </button>
      )}
      <p className="analytics-footnote">
        A case with more than one advocate is counted under each of them. TAT is the average number of days from filing
        date to disposal date, using disposed cases where both dates are recorded.
      </p>
    </article>
  );
}

export function AnalyticsDashboard({ cases, onDrillDown }) {
  const [courtQuery, setCourtQuery] = useState("");
  const [year, setYear] = useState("");
  const [granularity, setGranularity] = useState("year");

  const courts = useMemo(() => [...new Set(cases.map(courtName))].sort(), [cases]);
  const years = useMemo(() => filingYears(cases), [cases]);
  const scoped = useMemo(() => scopeCases(cases, { court: courtQuery, year }), [cases, courtQuery, year]);
  const model = useMemo(() => buildAnalytics(scoped), [scoped]);
  const stages = useMemo(() => pendingStageCards(scoped), [scoped]);
  const nbw = useMemo(() => nbwInsight(scoped), [scoped]);
  const series = useMemo(() => activitySeries(scoped, { granularity, year }), [scoped, granularity, year]);
  const advocates = useMemo(() => advocatePerformance(scoped), [scoped]);

  const open = (items) => onDrillDown({ cases: items });
  const filtered = Boolean(courtQuery.trim() || year);

  if (!cases.length)
    return (
      <section className="analytics-no-data console-panel card">
        <p className="panel-kicker">PORTFOLIO ANALYTICS</p>
        <h2>Analytics will appear as cases are captured.</h2>
        <p>Connect your eCourts capture workflow, then return here to track pending stages, disposals and turnaround time.</p>
      </section>
    );

  const total = Math.max(model.total, 1);
  const topStage = stages.rows[0];

  return (
    <section className="analytics-dashboard" aria-label="Portfolio analytics">
      <div className="analytics-overview">
        <div>
          <p className="console-eyebrow">PORTFOLIO ANALYTICS</p>
          <h1>Pending, disposals, and turnaround.</h1>
          <p>
            {filtered
              ? `Showing ${n(model.total)} of ${n(cases.length)} saved case records for your selection.`
              : `Based on ${n(model.total)} saved case record${model.total === 1 ? "" : "s"}.`}{" "}
            Select any number or bar to open those cases.
          </p>
        </div>
      </div>

      <div className="analytics-filters" role="search" aria-label="Analytics filters">
        <label>
          <span>Court</span>
          <input
            type="search"
            list="analytics-court-options"
            placeholder="Search or pick a court…"
            value={courtQuery}
            onChange={(event) => setCourtQuery(event.target.value)}
          />
          <datalist id="analytics-court-options">
            {courts.map((court) => <option key={court} value={court} />)}
          </datalist>
        </label>
        <label>
          <span>Filing year</span>
          <select value={year} onChange={(event) => setYear(event.target.value)}>
            <option value="">All years</option>
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button
          className="analytics-clear"
          disabled={!filtered}
          onClick={() => { setCourtQuery(""); setYear(""); }}
        >
          Clear filters
        </button>
        {filtered && model.total === 0 && <p className="analytics-empty">No cases match this court / year.</p>}
      </div>

      <div className="analytics-metrics">
        <Metric label="Cases in portfolio" value={n(model.total)} note={`${model.coverage ?? 0}% with details`} />
        <Metric
          label="Pending cases"
          value={n(model.pending)}
          note={topStage ? `${topStage.count} at ${topStage.label}` : "No pending cases"}
          tone="attention"
        />
        <Metric
          label="Disposed cases"
          value={n(model.disposed)}
          note={model.disposalRate == null ? "Status not recorded" : `${model.disposalRate}% of known outcomes`}
          tone="success"
        />
        <Metric
          label="Avg. time to disposal (TAT)"
          value={days(model.averageTat)}
          note={
            model.tatSamples
              ? `${[span(model.averageTat), `median ${days(model.medianTat)}`].filter(Boolean).join(" · ")} · ${n(model.tatSamples)} cases`
              : "Needs filing and disposal dates"
          }
          tone="highlight"
        />
      </div>

      <article className="analytics-panel card stage-panel">
        <header>
          <div>
            <p className="panel-kicker">PENDING</p>
            <h2>Pending cases by stage</h2>
          </div>
          <span>Filing → pending stages → disposal</span>
        </header>
        {stages.rows.length === 0 ? (
          <p className="analytics-empty">No pending cases.</p>
        ) : (
          <div className="stage-cards">
            <button className="stage-card total" onClick={() => open(scoped.filter((item) => caseStatus(item) === "Pending"))}>
              <span>All pending</span>
              <strong>{n(stages.total)}</strong>
              <small>sum of all stages below</small>
            </button>
            {stages.rows.map((row) => (
              <button
                key={row.label}
                className={`stage-card ${row.label === "NBW" ? "nbw" : ""}`}
                onClick={() => open(row.cases)}
              >
                <span>{row.label}</span>
                <strong>{n(row.count)}</strong>
                <small>{row.share}% of pending</small>
                <i><b style={{ inlineSize: `${row.share}%` }} /></i>
                {row.label === "NBW" && <em>Review priority</em>}
              </button>
            ))}
          </div>
        )}
        {nbw.count > 0 && (
          <div className="nbw-insight" role="note">
            <div>
              <strong>
                {n(nbw.count)} of {n(nbw.pendingTotal)} pending cases ({nbw.share}%) are at NBW.
              </strong>
              <p>
                NBW is a pending enforcement stage. It is highlighted for review priority; it does not establish a
                recovery or predict a case outcome.
                {nbw.sample > 0 && (
                  <>
                    {" "}In your records, {n(nbw.throughNbw)} of {n(nbw.sample)} disposed cases ({nbw.throughRate}%) went
                    through NBW before closing.
                  </>
                )}
              </p>
            </div>
            <button onClick={() => open(nbw.cases)}>View NBW cases →</button>
          </div>
        )}
      </article>

      <Activity
        series={series}
        granularity={granularity}
        setGranularity={setGranularity}
        year={year}
        onOpen={open}
      />

      <div className="analytics-grid two">
        <article className="analytics-panel card">
          <header>
            <div>
              <p className="panel-kicker">CASE AGE</p>
              <h2>Pending case ageing</h2>
            </div>
            <span>{model.longPending.length} over 1 year</span>
          </header>
          <Bars
            rows={model.age.filter((row) => row.label !== "Date not recorded")}
            onSelect={(row) => open(row.cases)}
            empty="No pending cases with filing dates."
          />
          <button className="analytics-callout review-queue" onClick={() => open(model.longPending.map((row) => row.item))}>
            <strong>{model.longPending.length} cases pending for more than a year</strong>
            <span>Open review queue →</span>
          </button>
        </article>
        <article className="analytics-panel card">
          <header>
            <div>
              <p className="panel-kicker">TURNAROUND</p>
              <h2>Filing to disposal time</h2>
            </div>
            <span>{n(model.tatSamples)} disposed cases</span>
          </header>
          <div className="tat-summary">
            <div><small>Average</small><strong>{days(model.averageTat)}</strong><span>{span(model.averageTat)}</span></div>
            <div><small>Median</small><strong>{days(model.medianTat)}</strong><span>{span(model.medianTat)}</span></div>
          </div>
          <Bars rows={model.tatBands} onSelect={(row) => open(row.cases)} empty="No disposed cases with both dates." />
        </article>
      </div>

      <div className="analytics-grid two">
        <article className="analytics-panel card">
          <header>
            <div>
              <p className="panel-kicker">CASE MIX</p>
              <h2>Current portfolio status</h2>
            </div>
            <span>{model.coverage ?? 0}% detailed</span>
          </header>
          <div className="status-content">
            <div
              className="status-donut"
              style={{
                "--pending": `${(model.pending / total) * 100}%`,
                "--disposed": `${((model.pending + model.disposed) / total) * 100}%`,
              }}
            >
              <strong>{model.total}</strong>
              <small>cases</small>
            </div>
            <div className="status-legend">
              {model.status.map((row) => (
                <button key={row.label} onClick={() => open(scoped.filter((item) => caseStatus(item) === row.label))}>
                  <i className={row.label.toLowerCase().replaceAll(" ", "-")} />
                  <span>{row.label}</span>
                  <strong>{row.count}</strong>
                </button>
              ))}
            </div>
          </div>
        </article>
        <article className="analytics-panel card">
          <header>
            <div>
              <p className="panel-kicker">COURTS</p>
              <h2>Portfolio by court</h2>
            </div>
            <span>{model.courts.length} recorded</span>
          </header>
          <div className="court-list">
            {model.courts.slice(0, 6).map((court) => (
              <button key={court.label} onClick={() => open(scoped.filter((item) => courtName(item) === court.label))}>
                <span>{court.label}</span>
                <strong>{court.total}</strong>
                <small>
                  {court.pending} pending · {court.disposed} disposed
                  {court.averageTat != null ? ` · avg TAT ${days(court.averageTat)}` : ""}
                </small>
              </button>
            ))}
          </div>
        </article>
      </div>

      <AdvocateTable rows={advocates} onOpen={open} />

      <p className="analytics-disclaimer">
        Scope: currently loaded workspace records. Court status and disposal do not establish recovery amounts or
        favourable outcomes. TAT uses filing-to-disposal dates where both are available.
      </p>
    </section>
  );
}
