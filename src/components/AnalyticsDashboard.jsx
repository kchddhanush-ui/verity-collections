import React, { useMemo, useState } from "react";
import {
  analyticsOptions,
  buildAnalytics,
  caseStage,
  caseStatus,
  filterCases,
  filingYear,
  annualActivity,
  percentage,
} from "../lib/analytics";
import {
  formatHearingDate,
  indiaToday,
} from "../lib/hearings";
import { WorkspaceIcon } from "./WorkspaceIcon";

const count = (value) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const percent = (value) => (value === null ? "—" : `${count(value)}%`);
function Panel({ title, note, children, className = "" }) {
  return (
    <section
      className={`console-panel analytics-panel card chart-card ${className}`}
    >
      <h2>{title}</h2>
      {note && <p className="muted">{note}</p>}
      {children}
    </section>
  );
}
function Trend({ model }) {
  const max = Math.max(
    1,
    ...model.trend.flatMap((row) => [row.filings, row.disposals]),
  );
  return (
    <>
      <div className="analytics-legend">
        <span>
          <i className="legend-filings" aria-hidden="true" />
          Filings
        </span>
        <span>
          <i className="legend-decisions" aria-hidden="true" />
          Disposals
        </span>
      </div>
      <div
        className="analytics-trend-scroll"
        tabIndex="0"
        role="region"
        aria-label="Monthly filings and recorded disposals"
      >
        <ol className="analytics-trend">
          {model.trend.map((row) => (
            <li key={row.month}>
              <span className="visually-hidden">
                {formatHearingDate(`${row.month}-01`, {
                  month: "long",
                  year: "numeric",
                })}
                : {row.filings} filings, {row.disposals} disposals.
              </span>
              <div className="trend-columns" aria-hidden="true">
                <div>
                  <span>{row.filings}</span>
                  <i
                    className="trend-filings"
                    style={{ blockSize: `${(row.filings / max) * 140}px` }}
                  />
                </div>
                <div>
                  <span>{row.disposals}</span>
                  <i
                    className="trend-decisions"
                    style={{ blockSize: `${(row.disposals / max) * 140}px` }}
                  />
                </div>
              </div>
              <span className="trend-month" aria-hidden="true">
                {formatHearingDate(`${row.month}-01`, {
                  month: "short",
                  year: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {!model.trend.some((row) => row.filings || row.disposals) && (
        <p className="analytics-empty">
          No valid filing or disposal dates fall in this window.
        </p>
      )}
      <p className="muted">
        Filings and disposals belong to the currently selected case portfolio.
        Disposals use Disposal Date, falling back to Decision Date on disposed
        cases.
      </p>
      <details className="analytics-chart-data">
        <summary>View monthly counts</summary>
        <div
          className="case-table-wrap"
          role="region"
          tabIndex="0"
          aria-label="Monthly trend data"
        >
          <table className="case-table">
            <caption>Monthly filings and disposals</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Filings</th>
                <th scope="col">Disposals</th>
              </tr>
            </thead>
            <tbody>
              {model.trend.map((row) => (
                <tr key={row.month}>
                  <th scope="row">
                    {formatHearingDate(`${row.month}-01`, {
                      month: "short",
                      year: "numeric",
                    })}
                  </th>
                  <td>{row.filings}</td>
                  <td>{row.disposals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function AnalyticsDashboard({
  cases,
  onStageCases,
  today = indiaToday(),
}) {
  const [filters, setFilters] = useState({
    court: "",
    type: "",
    status: "",
    stage: "",
    search: "",
    year: "",
  });
  const [months, setMonths] = useState(6);

  const options = useMemo(() => analyticsOptions(cases), [cases]);
  const filtered = useMemo(() => filterCases(cases, filters), [cases, filters]);
  const model = useMemo(
    () => buildAnalytics(filtered, { today, months }),
    [filtered, today, months],
  );
  const setFilter = (name, value) =>
    setFilters((old) => ({ ...old, [name]: value }));
  const years = [...new Set(cases.map(filingYear).filter(Boolean))].sort().reverse();
  const pendingCounts = new Map(options.stages.map((stage) => [stage, 0]));
  for (const item of filtered) {
    if (caseStatus(item) === "Pending") {
      const stage = caseStage(item);
      pendingCounts.set(stage, pendingCounts.get(stage) + 1);
    }
  }
  const pendingStages = [...pendingCounts].sort(([a, first], [b, second]) =>
    second - first || a.localeCompare(b),
  );
  const annualRows = months === "annual"
    ? annualActivity(filterCases(cases, { ...filters, year: "" }), today)
    : [];
  const metrics = [
    [
      "Cases in view",
      count(model.total),
      "Current selected portfolio",
      "cases",
    ],
    ["Pending", count(model.pending), "Confirmed pending cases", "clock"],
    ["Disposed", count(model.disposed), "Confirmed disposed cases", "check"],
    [
      "Disposed share",
      percent(model.disposalRate),
      `${model.known} cases with a known status`,
      "analytics",
    ],
  ];
  const activeFilters = Object.values(filters).some(Boolean);
  return (
    <div className="analytics-dashboard">
      <section
        className="console-panel analytics-filters card filters"
        aria-label="Analytics filters"
      >
        <div className="analytics-filter-heading card-title-row">
          <div>
            <p className="panel-kicker">COMPANY PERFORMANCE</p>
            <p role="status">
              <strong>{model.total}</strong> of {cases.length} loaded cases
              {activeFilters ? " · filtered" : ""}
            </p>
          </div>
          <button
            disabled={!activeFilters}
            onClick={() =>
              setFilters({
                court: "",
                type: "",
                status: "",
                stage: "",
                search: "",
                year: "",
              })
            }
          >
            Clear filters
          </button>
        </div>
        <div className="analytics-filter-grid filter-grid">
          <label>
            Court
            <select
              value={filters.court}
              onChange={(e) => setFilter("court", e.target.value)}
            >
              <option value="">All courts</option>
              {options.courts.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Case type
            <select
              value={filters.type}
              onChange={(e) => setFilter("type", e.target.value)}
            >
              <option value="">All case types</option>
              {options.types.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {["Pending", "Disposed", "Status unavailable"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Case stage
            <select
              value={filters.stage}
              onChange={(e) => setFilter("stage", e.target.value)}
            >
              <option value="">All stages</option>
              {options.stages.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filing year
            <select value={filters.year} onChange={(e) => setFilter("year", e.target.value)}>
              <option value="">All years</option>
              {years.map((year) => <option key={year}>{year}</option>)}
            </select>
          </label>
          <label>
            Search portfolio
            <div className="search-box">
              <WorkspaceIcon name="search" size={16} />
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                placeholder="Case, CNR, party or court"
              />
            </div>
          </label>
        </div>
        <p className="muted">
          Scope: the currently loaded company portfolio. Portfolio totals follow your filters. As of {formatHearingDate(today)} (India).
        </p>
      </section>
      <div className="analytics-metrics metric-grid">
        {metrics.map(([label, value, note, icon], index) => (
          <article
            className={`metric-card ${index === 0 ? "highlight" : ""}`}
            key={label}
          >
            <div>
              <span>{label}</span>
              <WorkspaceIcon name={icon} size={18} />
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <Panel title="Pending cases by stage" note={model.pending
        ? `Share of ${count(model.pending)} pending cases`
        : "No pending cases match these filters."}>
        <div className="pending-stage-grid">
          {pendingStages.map(([stage, total]) => {
            const share = percentage(total, model.pending) ?? 0;
            return (
              <button className="pending-stage-card" key={stage} type="button"
                disabled={!total || !onStageCases}
                onClick={() => onStageCases({ ...filters, status: "Pending", stage })}>
                <span>{stage} {total > 0 && <WorkspaceIcon name="arrow" size={16} />}</span>
                <strong>{count(total)} {total === 1 ? "case" : "cases"}</strong>
                <small>{percent(share)}</small>
                <progress max="100" value={share} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </Panel>
      <div>
        <Panel
          title="Filings & disposals"
          className="analytics-primary-trend"
          note="Recorded filings and disposals by month for the selected portfolio."
        >
          <label className="analytics-trend-window">
            Trend window
            <select
              value={months}
              onChange={(e) => setMonths(e.target.value === "annual" ? "annual" : Number(e.target.value))}
            >
              <option value={6}>Last 6 months</option>
              <option value={12}>Last 12 months</option>
              <option value="annual">Year on year</option>
            </select>
          </label>
          {months === "annual" ? (
            <div className="case-table-wrap">
              <p>All filing years. Events count in the year they occurred. Other filters still apply.</p>
              {annualRows.length ? (
                <table className="case-table">
                  <caption>Annual filings and disposals</caption>
                  <thead><tr><th scope="col">Year</th><th scope="col">Filings</th><th scope="col">Disposals</th></tr></thead>
                  <tbody>{annualRows.map((row) => (
                    <tr key={row.year}><th scope="row">{row.year}</th><td>{row.filings}</td><td>{row.disposals}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p>No dated filings or disposals match these filters.</p>}
            </div>
          ) : <Trend model={model} />}
        </Panel>
      </div>
      <Panel
        title="Court breakdown"
        className="court-card"
        note="Case totals by court for the filtered portfolio."
      >
        <div
          className="case-table-wrap analytics-table-wrap"
          role="region"
          tabIndex="0"
          aria-label="Court portfolio breakdown"
        >
          <table className="case-table">
            <caption>Court workload in the filtered portfolio</caption>
            <thead>
              <tr>
                {[
                  "Court",
                  "Cases",
                  "Pending",
                  "Disposed",
                  "Hearings · 7 days",
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.courts.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.total}</td>
                  <td>{row.pending}</td>
                  <td>{row.disposed}</td>
                  <td>{row.next7}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
