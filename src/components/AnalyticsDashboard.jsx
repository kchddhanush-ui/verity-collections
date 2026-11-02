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
import { caseNumber, formatHearingDate, indiaToday, parseCourtDate } from "../lib/hearings";
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
        Disposals use Disposal Date, falling back to Decision Date on disposed cases.
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
      key: "long_pending",
      label: "Pending · over 1 year",
      rows: model.longPending,
      dateLabel: "Filed / registered",
    },
    {
      key: "nbw",
      label: "Pending · NBW",
      rows: model.pendingNbw.map(item => ({ item, day: parseCourtDate(item.data?.next_hearing_date) })),
      dateLabel: "Next hearing",
    },
    {
      key: "summons",
      label: "Pending · SUMMONS",
      rows: model.pendingSummons.map(item => ({ item, day: parseCourtDate(item.data?.next_hearing_date) })),
      dateLabel: "Next hearing",
    },
    {
      key: "disposed",
      label: "Disposed cases",
      rows: model.closedCases,
      dateLabel: "Disposal / decision date",
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
    ["Cases in view", count(model.total), "Current selected portfolio", "cases"],
    ["Pending", count(model.pending), "Confirmed pending cases", "clock"],
    ["Disposed", count(model.disposed), "Confirmed disposed cases", "check"],
    ["Disposed share", percent(model.disposalRate), `${model.known} cases with a known status`, "analytics"],
    ["Average disposal TAT", model.averageTat === null ? "—" : `${count(model.averageTat)} days`, `${model.tatSamples} disposed cases with valid date pairs`, "clock"],
    ["Median disposal TAT", model.medianTat === null ? "—" : `${count(model.medianTat)} days`, "Middle duration in the same TAT sample", "clock"],
    ["Pending · over 1 year", count(model.longPending.length), "Aged cases for portfolio review", "cases"],
    ["Hearings · next 7 days", count(model.next7.length), "Today and the following 6 days", "calendar"],
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
              {["Pending", "Disposed", "Status unavailable"].map(
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
          Scope: the currently loaded company portfolio. All figures follow
          your filters. As of {" "}
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
              note="Every case is counted once; cases without a confirmed status remain visible."
            >
              <Bars rows={[
                { label: "Pending", count: model.pending },
                { label: "Disposed", count: model.disposed },
                { label: "Status unavailable", count: model.unknown + model.listed },
              ]} total={model.total} />
              <p className="muted">
                Disposed share = disposed ÷ (pending + disposed). Unknown and
                listed-only records are excluded; this is not a recovery or win
                rate.
              </p>
            </Panel>
            <Panel
              title="Cases by stage"
              note="Where cases currently stand in the court process."
            >
              <Bars
                rows={model.stages}
                total={model.detailed}
                empty="Capture detailed records to see case stages."
              />
            </Panel>
            <Panel title="Disposal turnaround" className="analytics-wide"
              note={`Time from filing to disposal for ${model.tatSamples} of ${model.disposed} disposed cases with valid dates.`}>
              <Bars rows={model.tatBands} total={model.tatSamples} tone="gold"
                empty="Disposal turnaround will appear when disposed cases have valid filing and closure dates." />
              <p className="muted">Calendar days from Filing Date to Disposal Date, falling back to Decision Date. Cases without a valid chronological pair are excluded, rather than treated as zero.</p>
            </Panel>
            <Panel
              title="Filings & disposals"
              className="analytics-wide"
              note="Recorded filings and disposals by month for the selected portfolio."
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
              note="Scheduled court commitments grouped across the next 30 days."
            >
              <Bars
                rows={model.hearingWeeks.map((row) => ({
                  label: `${formatHearingDate(row.from, { day: "numeric", month: "short" })} – ${formatHearingDate(row.through, { day: "numeric", month: "short" })}`,
                  count: row.count,
                }))}
                total={model.upcoming.length}
                empty="No saved next-hearing dates in the next 30 days."
              />
            </Panel>
            <Panel
              title="Case mix"
              note="The mix of case types in the selected portfolio."
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
              title="Court portfolio & disposal TAT"
              className="analytics-wide"
              note="Portfolio workload and average disposal time by court. TAT samples reflect the selected case mix."
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
                        "Average disposal TAT",
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
                        <td>{row.averageTat === null ? "—" : `${count(row.averageTat)} days`}<small>{row.tatSamples} cases in TAT sample</small></td>
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
            <p className="panel-kicker">PORTFOLIO PRIORITIES</p>
            <h2 id="analytics-review-title">Cases to discuss with your team</h2>
            <p className="muted">
              Review upcoming commitments, aged pending cases and active stages.
              Open a case to see its saved details. Categories may overlap.
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
                              : "Not recorded"}
                            {review === "long_pending" && <small>{count(row.days)} days pending</small>}
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
          <details className="muted analytics-methodology">
            <summary>Report basis & definitions</summary>
            <p>Figures cover the loaded company portfolio: up to 1,000 detailed cases and 1,000 listings merged by CNR. They follow the filters and describe saved records.</p>
            <p>Disposed share uses pending plus disposed cases as its denominator. A disposed status does not establish recovery or a favourable outcome. Cases with an unavailable status remain in the portfolio total.</p>
            <p>Average and median disposal TAT use the same sample: confirmed disposed cases with Filing Date and a valid Disposal Date, falling back to Decision Date. Missing, future and reversed date pairs are excluded. Calendar days are used. Pending age uses Filing Date, falling back to Registration Date. Today follows India time.</p>
            <p>Monthly counts use the source dates on the current selected cases; they do not reconstruct historical portfolio balances. Court figures describe this company portfolio, not all cases in each court.</p>
          </details>
        </>
      )}
    </div>
  );
}
