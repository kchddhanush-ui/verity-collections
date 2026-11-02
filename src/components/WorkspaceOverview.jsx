import React, { useMemo, useState } from "react";
import { buildAnalytics, caseStatus } from "../lib/analytics";
import { caseNumber, formatHearingDate, indiaToday } from "../lib/hearings";
import { WorkspaceIcon as Icon } from "./WorkspaceIcon";
import { CompanyBrief } from "./CompanyBrief";
import { accountName } from "./WorkspaceChrome";

const number = (value) =>
  value == null
    ? "—"
    : value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
export function WorkspaceOverview({
  cases,
  user,
  company,
  onNavigate,
  onOpenCase,
  onRefresh,
  busy,
  today = indiaToday(),
}) {
  const [months, setMonths] = useState(6);
  const model = useMemo(
    () => buildAnalytics(cases, { today, months }),
    [cases, today, months],
  );
  const max = Math.max(
    1,
    ...model.trend.flatMap((row) => [row.filings, row.disposals]),
  );
  const recent = useMemo(
    () =>
      cases
        .filter((item) =>
          Number.isFinite(
            Date.parse(item.last_checked_at || item.last_listed_at),
          ),
        )
        .slice()
        .sort(
          (a, b) =>
            Date.parse(b.last_checked_at || b.last_listed_at) -
            Date.parse(a.last_checked_at || a.last_listed_at),
        )
        .slice(0, 3),
    [cases],
  );
  const hour = +new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hourCycle: "h23",
  }).format(new Date());
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const next = model.upcoming[0];
  const metrics = [
    [
      "Portfolio cases",
      model.total,
      "In the loaded company portfolio",
      "briefcase",
      "",
    ],
    [
      "Pending matters",
      model.pending,
      `${model.total ? number((model.pending / model.total) * 100) : "—"}% of portfolio`,
      "clock",
      "amber-icon",
    ],
    [
      "Upcoming hearings · Next 30 days",
      model.upcoming.length,
      `Includes ${model.next7.length} hearings in the next 7 days`,
      "calendar",
      "blue-icon",
    ],
    [
      "Disposed",
      model.disposed,
      `${number(model.disposalRate)}${model.disposalRate == null ? "" : "%"} disposed share · known statuses`,
      "check",
      "violet-icon",
    ],
  ];
  return (
    <div className="workspace-overview">
      <div className="dashboard-welcome">
        <div>
          <span className="eyebrow">
            {formatHearingDate(today, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          <h1>
            {greeting}, {accountName(user).split(/[\s._-]/)[0]}.
          </h1>
          <p>Here’s what needs your attention across the legal portfolio.</p>
        </div>
        <div className="overview-actions">
          <a
            className="btn btn-outline"
            href="https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="external" size={16} />
            Open eCourts
          </a>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={onRefresh}
          >
            <Icon name="refresh" size={16} />
            {busy ? "Syncing…" : "Sync portfolio"}
          </button>
        </div>
      </div>
      <section className="attention-strip">
        <div className="attention-icon">
          <Icon name="calendar" />
        </div>
        <div>
          <strong>
            {model.next7.length} hearings coming up in the next 7 days
          </strong>
          <p>
            {next
              ? `Your next saved hearing is ${caseNumber(next.item)} on ${formatHearingDate(next.day)}.`
              : "No saved next-hearing dates in the next 30 days."}
          </p>
        </div>
        <button onClick={() => onNavigate("calendar")}>
          Review calendar <Icon name="arrow" size={15} />
        </button>
      </section>
      <div className="overview-metrics console-metrics">
        {metrics.map(([label, value, note, icon, tone]) => (
          <article key={label}>
            <div className={`metric-icon ${tone}`}>
              <Icon name={icon} />
            </div>
            <span>{label}</span>
            <strong>{number(value)}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="card activity-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Portfolio activity</span>
              <h2>Case movement</h2>
            </div>
            <select
              aria-label="Activity period"
              value={months}
              onChange={(event) => setMonths(+event.target.value)}
            >
              <option value={6}>Last 6 months</option>
              <option value={12}>Last 12 months</option>
            </select>
          </div>
          <div className="activity-chart">
            {model.trend.map((row) => (
              <div className="activity-column" key={row.month}>
                <span style={{ height: `${(row.filings / max) * 140}px` }} />
                <i style={{ height: `${(row.disposals / max) * 140}px` }} />
                <small>
                  {formatHearingDate(row.month + "-01", { month: "short" })}
                </small>
                <span className="visually-hidden">
                  {row.month}: {row.filings} filings, {row.disposals} disposals.
                </span>
              </div>
            ))}
          </div>
          <div className="chart-footer">
            <span>
              <i className="opened-key" />
              Filings
            </span>
            <span>
              <i className="closed-key" />
              Disposed
            </span>
          </div>
          <p className="fine-print">
            Recorded source dates for the loaded portfolio.
          </p>
          <details className="analytics-chart-data">
            <summary>View monthly counts</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Filings</th>
                    <th scope="col">Disposed</th>
                  </tr>
                </thead>
                <tbody>
                  {model.trend.map((row) => (
                    <tr key={row.month}>
                      <th scope="row">{row.month}</th>
                      <td>{row.filings}</td>
                      <td>{row.disposals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section className="card upcoming-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Next up</span>
              <h2>Upcoming hearings</h2>
            </div>
            <button
              className="text-action"
              onClick={() => onNavigate("calendar")}
            >
              View all <Icon name="arrow" size={14} />
            </button>
          </div>
          {model.upcoming.slice(0, 3).map((row) => (
            <button
              className="hearing-row"
              key={row.item.cnr}
              onClick={() => onOpenCase(row.item)}
            >
              <div className="date-tile">
                <strong>{+row.day.slice(-2)}</strong>
                <span>
                  {formatHearingDate(row.day, { month: "short" }).toUpperCase()}
                </span>
              </div>
              <div>
                <strong>{caseNumber(row.item)}</strong>
                <span>{row.item.data.court || "Court not recorded"}</span>
              </div>
              <Icon name="chevron" size={16} />
            </button>
          ))}
          {!model.upcoming.length && (
            <p className="empty">No upcoming saved hearings.</p>
          )}
        </section>
      </div>
      <section className="card recent-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Recent records</span>
            <h2>Latest saved cases</h2>
          </div>
          <button className="text-action" onClick={() => onNavigate("cases")}>
            View portfolio <Icon name="arrow" size={14} />
          </button>
        </div>
        <div className="recent-list">
          {recent.map((item) => (
            <div key={item.cnr}>
              <span
                className={`status-dot ${caseStatus(item) === "Disposed" ? "green" : caseStatus(item) === "Pending" ? "gold" : "blue"}`}
              />
              <div>
                <button
                  className="text-action"
                  onClick={() => onOpenCase(item)}
                >
                  {caseNumber(item)} · {caseStatus(item)}
                </button>
                <p>{item.data.court || "Court not recorded"}</p>
              </div>
              <time dateTime={item.last_checked_at || item.last_listed_at}>
                {new Date(
                  item.last_checked_at || item.last_listed_at,
                ).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))}
        </div>
        {!recent.length && (
          <p className="empty">
            Saved case records will appear here after capture.
          </p>
        )}
      </section>
      <details className="company-brief-details card">
        <summary>Company presentation brief</summary>
        <CompanyBrief cases={cases} company={company} />
      </details>
      <p className="fine-print">
        Figures describe the loaded company portfolio. Hearing dates and case
        statuses reflect saved court records.
      </p>
    </div>
  );
}
