import React, { useEffect, useMemo, useState } from "react";
import {
  analyticsOptions,
  buildAnalytics,
  caseStage,
  caseStatus,
  courtName,
  filterCases,
  percentage,
} from "../lib/analytics";
import { caseNumber, formatHearingDate, indiaToday } from "../lib/hearings";
import { WorkspaceIcon } from "./WorkspaceIcon";
import "../analytics.css";

const count = (value) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const percent = (value) => (value === null ? "—" : `${count(value)}%`);
function Panel({ title, note, children, className = "" }) {
  return (
    <section className={`console-panel analytics-panel ${className}`}>
      <h2>{title}</h2>
      {note && <p className="muted">{note}</p>}
      {children}
    </section>
  );
}
function Bars({ rows, total, empty = "No matching records.", tone = "green" }) {
  if (!total) return <p className="analytics-empty">{empty}</p>;
  return (
    <dl
      tabIndex="0"
      aria-label="Counts by category"
      className={`analytics-bars analytics-bars-${tone}`}
    >
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            <span className="analytics-track" aria-hidden="true">
              <span
                style={{ inlineSize: `${percentage(row.count, total) || 0}%` }}
              />
            </span>
            <span>
              {count(row.count)}{" "}
              <small>{percent(percentage(row.count, total))}</small>
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
function Trend({ model }) {
  const max = Math.max(
    1,
    ...model.trend.flatMap((row) => [row.filings, row.decisions]),
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
          Decision dates
        </span>
      </div>
      <div
        className="analytics-trend-scroll"
        tabIndex="0"
        role="region"
        aria-label="Monthly filings and recorded decision dates"
      >
        <ol className="analytics-trend">
          {model.trend.map((row) => (
            <li key={row.month}>
              <span className="visually-hidden">
                {formatHearingDate(`${row.month}-01`, {
                  month: "long",
                  year: "numeric",
                })}
                : {row.filings} filings, {row.decisions} decision dates.
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
                  <span>{row.decisions}</span>
                  <i
                    className="trend-decisions"
                    style={{ blockSize: `${(row.decisions / max) * 140}px` }}
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
      {!model.trend.some((row) => row.filings || row.decisions) && (
        <p className="analytics-empty">
          No valid filing or Decision Date values fall in this window.
        </p>
      )}
      <p className="muted">
        Valid filing dates: {model.filingDates}/{model.detailed} detailed cases.
        Valid Decision Dates: {model.decisionDates}/{model.detailed}. Counts
        follow the current filtered cohort; they do not reconstruct past case
        statuses.
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
            <caption>Monthly filings and Decision Date records</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Filings</th>
                <th scope="col">Decision dates</th>
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
                  <td>{row.decisions}</td>
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
  onOpenCase,
  today = indiaToday(),
}) {
  const [filters, setFilters] = useState({
    court: "",
    type: "",
    status: "",
    stage: "",
    search: "",
  });
  const [months, setMonths] = useState(6);
  const [review, setReview] = useState("upcoming");
  const [page, setPage] = useState(1);
  const options = useMemo(() => analyticsOptions(cases), [cases]);
  const filtered = useMemo(() => filterCases(cases, filters), [cases, filters]);
  const model = useMemo(
    () => buildAnalytics(filtered, { today, months }),
    [filtered, today, months],
  );
  useEffect(() => setPage(1), [filters, review]);
  const setFilter = (name, value) =>
    setFilters((old) => ({ ...old, [name]: value }));
  const reviews = [
    {
      key: "upcoming",
      label: "Hearings · next 30 days",
      rows: model.upcoming,
      dateLabel: "Next hearing",
    },
    {
      key: "past",
      label: "Past next-hearing dates",
      rows: model.pastHearing,
      dateLabel: "Saved next hearing",
    },
    {
      key: "no_next",
      label: "Pending · no hearing date",
      rows: model.noNext.map((item) => ({ item })),
      dateLabel: "Next hearing",
    },
    {
      key: "missing_decision",
      label: "Disposed · missing/invalid Decision Date",
      rows: model.missingDecision.map((item) => ({ item })),
      dateLabel: "Decision Date",
    },
    {
      key: "stale",
      label: "Checks · 30+ days ago",
      rows: model.stale,
      dateLabel: "Last saved check",
    },
    {
      key: "listed",
      label: "Awaiting detailed capture",
      rows: filtered.filter((c) => !c.hasDetails).map((item) => ({ item })),
      dateLabel: "Hearing date",
    },
  ];
  const selectedReview = reviews.find((row) => row.key === review);
  const pages = Math.max(1, Math.ceil(selectedReview.rows.length / 10));
  const currentPage = Math.min(page, pages);
  const reviewRows = selectedReview.rows.slice(
    (currentPage - 1) * 10,
    currentPage * 10,
  );
  const metrics = [
    [
      "Cases in view",
      count(model.total),
      `${model.detailed} detailed · ${model.listed} listed only`,
      "cases",
    ],
    ["Pending", count(model.pending), "Confirmed pending status", "clock"],
    ["Disposed", count(model.disposed), "Confirmed disposed status", "check"],
    [
      "Disposed share",
      percent(model.disposalRate),
      `${model.known} cases with known status`,
      "analytics",
    ],
    [
      "Hearings · next 7 days",
      count(model.next7.length),
      "Today and the following 6 days",
      "calendar",
    ],
    [
      "Past next-hearing dates",
      count(model.pastHearing.length),
      "Saved dates to check again",
      "refresh",
    ],
    [
      "Detail coverage",
      percent(model.coverage),
      `${model.detailed} of ${model.total} cases`,
      "capture",
    ],
    [
      "Median days to decision",
      model.medianDays === null ? "—" : count(model.medianDays),
      `${model.durationSamples} disposed cases with valid dates`,
      "clock",
    ],
  ];
  const activeFilters = Object.values(filters).some(Boolean);
  return (
    <div className="analytics-dashboard">
      <section
        className="console-panel analytics-filters"
        aria-label="Analytics filters"
      >
        <div className="analytics-filter-heading">
          <div>
            <p className="panel-kicker">PORTFOLIO ANALYTICS</p>
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
              })
            }
          >
            Clear filters
          </button>
        </div>
        <div className="analytics-filter-grid">
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
              {["Pending", "Disposed", "Status unknown", "Listed only"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
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
            Search portfolio
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder="Case, CNR, party or court"
            />
          </label>
        </div>
        <p className="muted">
          Scope: saved records currently loaded for this company, up to 1,000
          detailed cases and 1,000 listings merged by CNR. Figures follow the
          filters above; listed-only records have no confirmed status. Today:{" "}
          {formatHearingDate(today)} (India).
        </p>
      </section>
      {!model.total ? (
        <div className="console-panel console-empty">
          <WorkspaceIcon name="analytics" size={32} />
          <h2>
            {cases.length
              ? "No cases match these filters"
              : "Analytics starts with saved cases"}
          </h2>
          <p>
            {cases.length
              ? "Clear or adjust the filters to see your portfolio."
              : "Complete an eCourts search and capture cases to populate this dashboard. Figures update as details are saved."}
          </p>
        </div>
      ) : (
        <>
          <div className="analytics-metrics">
            {metrics.map(([label, value, note, icon]) => (
              <article key={label}>
                <div>
                  <span>{label}</span>
                  <WorkspaceIcon name={icon} size={18} />
                </div>
                <strong>{value}</strong>
                <small>{note}</small>
              </article>
            ))}
          </div>
          <div className="analytics-grid">
            <Panel
              title="Portfolio status"
              note="Every case is counted once. Listed-only records stay separate from detailed cases with an unknown status."
            >
              <Bars rows={model.status} total={model.total} />
              <p className="muted">
                Disposed share = disposed ÷ (pending + disposed). Unknown and
                listed-only records are excluded; this is not a recovery or win
                rate.
              </p>
            </Panel>
            <Panel
              title="Cases by stage"
              note={`${model.detailed} detailed cases. Stage labels are normalised for case and spacing.`}
            >
              <Bars
                rows={model.stages}
                total={model.detailed}
                empty="Capture detailed records to see case stages."
              />
            </Panel>
            <Panel
              title="Filings & decision dates"
              className="analytics-wide"
              note="Actual source dates on the filtered case records. Disposal Date is not substituted for Decision Date."
            >
              <label className="analytics-trend-window">
                Trend window
                <select
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                >
                  <option value={6}>Last 6 months</option>
                  <option value={12}>Last 12 months</option>
                </select>
              </label>
              <Trend model={model} />
            </Panel>
            <Panel
              title="Pending case age"
              note="Uses filing date, falling back to registration date. Only confirmed pending cases are included; unknown or future start dates are excluded from dated bands."
            >
              <Bars
                rows={model.age}
                total={model.pending}
                tone="gold"
                empty="No confirmed pending cases in this view."
              />
            </Panel>
            <Panel
              title="Hearing workload · next 30 days"
              note="One saved next date per non-disposed detailed case. The last interval covers two days."
            >
              <Bars
                rows={model.hearingWeeks.map((row) => ({
                  label: `${formatHearingDate(row.from, { day: "numeric", month: "short" })} – ${formatHearingDate(row.through, { day: "numeric", month: "short" })}`,
                  count: row.count,
                }))}
                total={model.upcoming.length}
                empty="No saved next-hearing dates in the next 30 days."
              />
              <p className="muted">
                {model.noNext.length} pending cases have no recognised
                next-hearing date. {model.pastHearing.length} non-disposed cases
                have a saved next date before today.
              </p>
            </Panel>
            <Panel
              title="Case mix"
              note="All filtered cases, including listings. Case types use the source code, for example C.C. or P.C.R."
            >
              <Bars rows={model.types} total={model.total} />
            </Panel>
            <Panel
              title="Nature of disposal"
              note="Source descriptions on disposed cases. These labels are not interpreted as win/loss outcomes."
            >
              <Bars
                rows={model.disposalTypes}
                total={model.disposed}
                tone="gold"
                empty="No confirmed disposed cases in this view."
              />
            </Panel>
            <Panel
              title="Capture recency"
              note="Time since the last saved detail check, not a guarantee that court records are current. Listed-only cases are excluded."
            >
              <Bars
                rows={model.freshness}
                total={model.detailed}
                empty="No detailed checks saved yet."
              />
            </Panel>
            <Panel
              title="Date completeness"
              note="Dates must be valid calendar dates on or before today. Decision Date coverage is checked only for disposed cases."
            >
              <h3>Filing dates · {model.detailed} detailed cases</h3>
              <Bars
                rows={[
                  { label: "Filing date present", count: model.filingDates },
                ]}
                total={model.detailed}
                empty="Capture details to assess filing dates."
              />
              <h3>Decision Dates · {model.disposed} disposed cases</h3>
              <Bars
                rows={[
                  {
                    label: "Decision Date present",
                    count: model.datedDisposed,
                  },
                ]}
                total={model.disposed}
                empty="No disposed cases to assess Decision Dates."
              />
              <p className="muted">
                Missing dates are not assumed to be zero. Median time to
                decision uses {model.durationSamples} disposed cases with valid
                start and Decision Dates in chronological order.
              </p>
            </Panel>
            <Panel
              title="Judge / courtroom distribution"
              className="analytics-wide"
              note="Current judge or courtroom labels on detailed records. Historical judge changes are not counted as additional cases."
            >
              <Bars
                rows={model.judges}
                total={model.detailed}
                empty="Capture case details to see judge and courtroom labels."
              />
            </Panel>
            <Panel
              title="Court distribution"
              className="analytics-wide"
              note="Cases grouped by the saved court name; these are portfolio counts, not court-wide case totals."
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
                        "Detailed",
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
                        <td>{row.detailed}</td>
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
          <section
            className="console-panel analytics-review"
            aria-labelledby="analytics-review-title"
          >
            <p className="panel-kicker">CASE FOLLOW-UP</p>
            <h2 id="analytics-review-title">Cases behind the numbers</h2>
            <p className="muted">
              Open a case to review its saved details. Past next-hearing dates
              call for a fresh check; they do not confirm a missed hearing.
              Categories can overlap and should not be added together.
            </p>
            <nav
              className="analytics-review-tabs"
              aria-label="Case follow-up categories"
            >
              {reviews.map((row) => (
                <button
                  key={row.key}
                  aria-pressed={review === row.key}
                  onClick={() => setReview(row.key)}
                >
                  {row.label}
                  <span>{row.rows.length}</span>
                </button>
              ))}
            </nav>
            <p role="status">
              {selectedReview.rows.length} cases · {selectedReview.label}
            </p>
            {reviewRows.length ? (
              <>
                <div
                  className="case-table-wrap analytics-table-wrap"
                  role="region"
                  tabIndex="0"
                  aria-label="Cases for follow-up"
                >
                  <table className="case-table">
                    <caption>{selectedReview.label}</caption>
                    <thead>
                      <tr>
                        {[
                          "Case / CNR",
                          "Court",
                          "Stage / status",
                          selectedReview.dateLabel,
                        ].map((label) => (
                          <th scope="col" key={label}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reviewRows.map((row) => (
                        <tr key={row.item.cnr}>
                          <th scope="row">
                            <button
                              className="case-open"
                              onClick={() => onOpenCase(row.item)}
                            >
                              {caseNumber(row.item)}
                              <small>{row.item.cnr}</small>
                            </button>
                          </th>
                          <td>{courtName(row.item)}</td>
                          <td>
                            {row.item.hasDetails
                              ? caseStage(row.item)
                              : "Awaiting details"}
                            <small>{caseStatus(row.item)}</small>
                          </td>
                          <td>
                            {row.day
                              ? formatHearingDate(row.day)
                              : review === "stale"
                                ? `${row.days} days ago`
                                : "Not recorded / invalid"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="analytics-pagination">
                  <span>
                    Page {currentPage} of {pages} · 10 cases per page
                  </span>
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous page
                  </button>
                  <button
                    disabled={currentPage === pages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next page
                  </button>
                </div>
              </>
            ) : (
              <p className="analytics-empty">
                No cases in this follow-up category match your filters.
              </p>
            )}
          </section>
          <p className="muted analytics-methodology">
            This dashboard describes saved case records, not live court activity
            or recovered money. A disposed status does not establish a
            favourable outcome. Refresh cases or complete another source capture
            to update the figures.{" "}
            {model.latestCheck &&
              `Most recent saved detail check: ${new Date(model.latestCheck).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (India).`}
          </p>
        </>
      )}
    </div>
  );
}
