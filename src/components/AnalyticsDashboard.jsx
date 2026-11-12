import React, { useEffect, useMemo, useState } from "react";
import {
  analyticsOptions,
  annualActivity,
  buildAnalytics,
  caseAdvocate,
  caseStage,
  courtPerformanceRows,
  filterCases,
  filingYear,
  observedStageDurations,
  pendingStageRows,
  percentage,
  portfolioDiagnostic,
} from "../lib/analytics";
import { createAnalyticsReport } from "../lib/analyticsReport";
import { caseCsv } from "../lib/csv";
import { formatHearingDate, indiaToday } from "../lib/hearings";
import { WorkspaceIcon } from "./WorkspaceIcon";

const EMPTY_FILTERS = { court: "", type: "", status: "", stage: "", search: "", year: "", advocate: "" };
const FILTER_NAMES = { court: "Court", year: "Filing year", type: "Case type", status: "Status", stage: "Stage", advocate: "Advocate", search: "Search" };

const phases = [
  ["Pre-Summoning & Issue of Process", ["SWORN STATEMENT", "SUMMONS", "NOTICE", "FOR STEPS", "AWAIT", "NBW"]],
  ["Appearance & Bail", ["APPEARANCE OF ACCUSED", "APPEARANCE OF ACCUSSED", "BAIL"]],
  ["Settlement / Pre-Trial Steps", ["A.D.R.", "ADR", "LOK ADALATH", "LOK ADALAT", "OBJECTION"]],
  ["Charge / Plea", ["FRAMING OF CHARGE OR PLEA"]],
  ["Trial & Evidence", ["EVIDENCES", "HEARING", "ACCUSED STATEMENT U/S 313 CRPC", "DEFENCE EVIDENCE"]],
  ["Final Arguments & Decision", ["ARGUMENTS", "ARGUMENT", "TO HEAR ON", "CALL ON", "ORDERS", "JUDGEMENT", "JUDGEMENTS"]],
];
const phaseStages = new Set(phases.flatMap(([, stages]) => stages));

const fmt = (value) => Number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 });
const pct = (value) => (value === null || value === undefined ? "—" : `${fmt(value)}%`);
const monthLabel = (month) => formatHearingDate(`${month}-01`, { month: "short", year: "2-digit" });

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sortRows(rows, { key, direction }) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    let compared;
    if (typeof left === "string" || typeof right === "string") {
      compared = collator.compare(String(left ?? ""), String(right ?? ""));
    } else {
      const diff = Number(left ?? -Infinity) - Number(right ?? -Infinity);
      compared = Number.isNaN(diff) ? 0 : diff;
    }
    return factor * compared || collator.compare(a.label, b.label);
  });
}

function upcomingHearings(cases, today, days) {
  const start = Date.parse(today);
  const end = start + days * 86400000;
  return cases
    .map((item) => {
      const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(item.data?.next_hearing_date || "");
      return match ? { item, time: Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])) } : null;
    })
    .filter((row) => row && row.time >= start && row.time <= end)
    .sort((a, b) => a.time - b.time)
    .map((row) => row.item);
}

function Panel({ id, title, note, action, className = "", children }) {
  return (
    <section id={id} className={`lw-panel analytics-panel ${className}`}>
      <header className="lw-panel-head">
        <div>
          <h2>{title}</h2>
          {note && <p className="muted">{note}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function CaseButton({ cases, onOpen, className = "", children, ...rest }) {
  const enabled = Boolean(cases?.length && onOpen);
  return (
    <button type="button" className={className} disabled={!enabled} onClick={() => onOpen(cases)} {...rest}>
      {children}
    </button>
  );
}

function HBars({ rows, suffix = "cases", onOpen }) {
  if (!rows.length) return <p className="lw-empty">No matching recorded data.</p>;
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="lw-hbars">
      {rows.map((row) => (
        <li key={row.label}>
          <CaseButton cases={row.cases} onOpen={onOpen} className="lw-hbar">
            <span className="lw-hbar-label">{row.label}</span>
            <span className="lw-hbar-track">
              <i style={{ inlineSize: `${Math.max(3, (row.count / max) * 100)}%` }} />
            </span>
            <strong>
              {fmt(row.count)} <small>{suffix}</small>
            </strong>
          </CaseButton>
        </li>
      ))}
    </ul>
  );
}

function TrendChart({ rows }) {
  const [active, setActive] = useState(null);
  const W = 720;
  const H = 240;
  const top = 16;
  const bottom = 36;
  const plotH = H - top - bottom;
  const plotW = W - 16;
  const max = Math.max(1, ...rows.flatMap((row) => [row.filings, row.disposals]));
  const slot = plotW / Math.max(1, rows.length);
  const barW = Math.max(4, Math.min(18, slot * 0.3));
  const activeRow = active === null ? null : rows[active];

  return (
    <div className="lw-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Filings and disposals by month" style={{ width: "100%", height: "auto" }}>
        {[0, 0.5, 1].map((step) => (
          <line key={step} x1="8" x2={W - 8} y1={top + plotH - step * plotH} y2={top + plotH - step * plotH} className="lw-grid" />
        ))}
        {rows.map((row, index) => {
          const cx = 8 + slot * index + slot / 2;
          const filingHeight = (row.filings / max) * plotH;
          const disposalHeight = (row.disposals / max) * plotH;
          return (
            <g key={row.month} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}>
              <rect x={cx - barW - 1} y={top + plotH - filingHeight} width={barW} height={filingHeight} rx="3" className="lw-bar-filings" />
              <rect x={cx + 1} y={top + plotH - disposalHeight} width={barW} height={disposalHeight} rx="3" className="lw-bar-disposals" />
              <text x={cx} y={H - 12} textAnchor="middle" className="lw-axis">
                {monthLabel(row.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="lw-readout" role="status">
        {activeRow
          ? `${monthLabel(activeRow.month)}: ${activeRow.filings} filings, ${activeRow.disposals} disposals`
          : "Hover over a month to see its numbers."}
      </p>
    </div>
  );
}

function Donut({ rows }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="lw-donut" role="img" aria-label="Case types">
      <circle cx="60" cy="60" r={radius} className="lw-donut-track" />
      {total > 0 &&
        rows.map((row, index) => {
          const length = (row.count / total) * circumference;
          const segment = (
            <circle
              key={row.label}
              cx="60"
              cy="60"
              r={radius}
              className={`lw-donut-seg seg-${index % 6}`}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          );
          offset += length;
          return segment;
        })}
      <text x="60" y="58" textAnchor="middle" className="lw-donut-total">{fmt(total)}</text>
      <text x="60" y="74" textAnchor="middle" className="lw-donut-caption">cases</text>
    </svg>
  );
}

export function AnalyticsDashboard({ cases, onStageCases, company = "Company", today = indiaToday() }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [windowSize, setWindowSize] = useState(12);
  const [presenting, setPresenting] = useState(false);
  const [courtSort, setCourtSort] = useState({ key: "total", direction: "desc" });
  const [priorityPage, setPriorityPage] = useState(0);
  const [prioritySearch, setPrioritySearch] = useState("");
  const [assumptions, setAssumptions] = useState({ exposure: "", rate: "10", years: "1", reviewDays: "365" });
  const [proxyAcknowledged, setProxyAcknowledged] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("lawcovery-presentation", presenting);
    return () => document.body.classList.remove("lawcovery-presentation");
  }, [presenting]);

  const options = useMemo(() => analyticsOptions(cases), [cases]);
  const filtered = useMemo(() => filterCases(cases, filters), [cases, filters]);
  const model = useMemo(() => buildAnalytics(filtered, { today, months: windowSize }), [filtered, today, windowSize]);
  const pendingRows = useMemo(() => pendingStageRows(filtered), [filtered]);
  const diagnostic = useMemo(
    () => portfolioDiagnostic(filtered, today, Number(assumptions.reviewDays) || 365),
    [filtered, today, assumptions.reviewDays],
  );
  const durations = useMemo(() => observedStageDurations(filtered, today), [filtered, today]);
  const annual = useMemo(() => annualActivity(filterCases(cases, { ...filters, year: "" }), today), [cases, filters, today]);
  const courtRows = useMemo(() => sortRows(courtPerformanceRows(filtered, today), courtSort), [filtered, today, courtSort]);
  const upcoming = useMemo(() => upcomingHearings(filtered, today, 30), [filtered, today]);
  const years = useMemo(() => [...new Set(cases.map(filingYear).filter(Boolean))].sort().reverse(), [cases]);
  const advocates = useMemo(() => [...new Set(cases.map(caseAdvocate))].sort(), [cases]);

  const ageBuckets = useMemo(
    () =>
      [
        { label: "Under 6 months", min: 0, max: 182 },
        { label: "6–12 months", min: 183, max: 365 },
        { label: "1–2 years", min: 366, max: 730 },
        { label: "Over 2 years", min: 731, max: Infinity },
      ]
        .map((bucket) => ({
          ...bucket,
          cases: diagnostic.dated.filter((row) => row.days >= bucket.min && row.days <= bucket.max).map((row) => row.item),
        }))
        .concat([{ label: "Filing date unavailable", cases: diagnostic.pending.filter((item) => !item.data?.filing_date) }]),
    [diagnostic],
  );

  const priorityRows = useMemo(() => {
    const threshold = Number(assumptions.reviewDays || 365);
    const query = prioritySearch.trim().toLowerCase();
    return [
      ...diagnostic.dated.filter((row) => row.days > threshold),
      ...diagnostic.pending.filter((item) => !item.data?.filing_date).map((item) => ({ item, days: null })),
    ]
      .filter(({ item }) => !query || JSON.stringify(item.data).toLowerCase().includes(query) || item.cnr.toLowerCase().includes(query))
      .sort((a, b) => (b.days || -1) - (a.days || -1));
  }, [diagnostic, assumptions.reviewDays, prioritySearch]);

  const pageRows = priorityRows.slice(priorityPage * 10, priorityPage * 10 + 10);
  const phaseGroups = [
    ...phases.map(([label, stages]) => [label, stages.filter((stage) => durations.has(stage))]),
    ["Other recorded stages", [...durations.keys()].filter((stage) => !phaseStages.has(stage)).sort()],
  ];
  const caseTypes = model.types.map((row) => ({
    ...row,
    cases: filtered.filter(
      (item) =>
        item.data?.case_type?.trim().toUpperCase().startsWith(row.label) ||
        (!item.data?.case_type && row.label === "TYPE NOT RECORDED"),
    ),
  }));
  const outcomes = model.disposalTypes.map((row) => ({
    ...row,
    cases: model.closedCases
      .map((entry) => entry.item)
      .filter((item) => (item.data?.nature_of_disposal || "Not recorded").trim().toUpperCase() === row.label),
  }));
  const cohortRows = diagnostic.yearRows.map((row) => ({
    label: row.label,
    count: row.pending.length,
    cases: row.pending,
    disposed: row.disposed.length,
    share: percentage(row.pending.length, model.pending),
  }));

  const pendingCases = pendingRows.flatMap((row) => row.cases);
  const closedCases = model.closedCases.map((row) => row.item);
  const metrics = [
    { label: "Cases in view", value: fmt(model.total), note: "All filtered records", cases: filtered },
    { label: "Pending", value: fmt(model.pending), note: "Confirmed pending", cases: pendingCases },
    { label: "Disposed", value: fmt(model.disposed), note: "Confirmed disposed", cases: closedCases },
    { label: "Disposal rate", value: pct(model.disposalRate), note: `${fmt(model.disposed)} of ${fmt(model.known)} known-status`, cases: closedCases },
    {
      label: "Avg filing → disposal",
      value: model.averageTat === null ? "—" : `${fmt(model.averageTat)} days`,
      note: `${fmt(model.tatSamples)} valid samples`,
      cases: [],
    },
  ];

  const oldShare = model.pending ? percentage(diagnostic.old.length, model.pending) : null;
  const exposure = Number(assumptions.exposure) || 0;
  const rate = Number(assumptions.rate) || 0;
  const scenarioYears = Number(assumptions.years) || 0;
  const totalExposure = exposure * model.pending;
  const annualCarry = (totalExposure * rate) / 100;

  const set = (key, value) => {
    setFilters((old) => ({ ...old, [key]: value }));
    setPriorityPage(0);
  };
  const clearOne = (key) => set(key, "");
  const open = (records, extra = {}) =>
    onStageCases?.({ ...filters, ...extra, caseIds: records.map((item) => item.cnr) });
  const sortCourts = (key) =>
    setCourtSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );

  const exportFiltered = () => {
    const headers = ["Case number", "CNR number", "Court", "Case type", "Status", "Stage", "Filing date", "Disposal date", "Decision date", "Advocate"];
    const rows = filtered.map((item) => [
      item.data?.case_reference || item.data?.registration_number || item.cnr,
      item.cnr,
      item.data?.court || "",
      item.data?.case_type || "",
      item.data?.case_status || "",
      item.data?.case_stage || "",
      item.data?.filing_date || "",
      item.data?.disposal_date || "",
      item.data?.decision_date || "",
      caseAdvocate(item),
    ]);
    downloadFile(`Lawcovery-analytics-${today}.csv`, caseCsv(headers, rows), "text/csv;charset=utf-8");
  };

  const exportReport = () => {
    const html = createAnalyticsReport({
      company,
      cases: filtered,
      filters,
      today,
      assumptions: { ...assumptions, proxyAcknowledged },
    });
    downloadFile(`${company.replace(/[^a-z0-9]+/gi, "-")}-legal-portfolio-report.html`, html, "text/html;charset=utf-8");
  };

  const exportPriority = () => {
    const headers = ["Case", "Respondent", "Filing date", "Pending age", "Stage", "Advocate", "Reason"];
    const values = priorityRows.map(({ item, days }) => [
      item.data?.case_reference || item.cnr,
      (item.data?.respondents || []).join("; "),
      item.data?.filing_date || "",
      days == null ? "" : days,
      caseStage(item),
      caseAdvocate(item),
      days == null ? "Filing date unavailable." : days > 730 ? "Pending over 24 months." : "Older than configured review threshold.",
    ]);
    downloadFile(`Lawcovery-priority-cases-${today}.csv`, caseCsv(headers, values), "text/csv;charset=utf-8");
  };

  const activeChips = Object.entries(filters).filter(([, value]) => value);

  return (
    <main className={`lw-analytics analytics-dashboard ${presenting ? "diagnostic-presenting" : ""}`}>
      <header className="lw-hero">
        <div>
          <p className="lw-kicker">LAWCOVERY · PORTFOLIO ANALYTICS</p>
          <h1>{company} — Legal Portfolio Review</h1>
          <p className="muted">
            Report date {formatHearingDate(today)} · {fmt(model.total)} records in scope
          </p>
        </div>
        <div className="lw-actions">
          <button type="button" onClick={() => setPresenting((value) => !value)}>
            {presenting ? "Exit presentation" : "Presentation mode"}
          </button>
          <button type="button" disabled={!filtered.length} onClick={exportReport}>
            Download report
          </button>
        </div>
      </header>

      <nav className="lw-nav" aria-label="Dashboard sections">
        {[
          ["summary", "Summary"],
          ["pendency", "Pending by stage"],
          ["turnaround", "Stage timing"],
          ["trend", "Trend"],
          ["ageing", "Ageing"],
          ["hearings", "Upcoming hearings"],
          ["courts", "Courts"],
          ["advocates", "Advocates"],
          ["priority", "Priority cases"],
          ["financial", "Scenario"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      {!presenting && (
        <section className="lw-filters analytics-filters" aria-label="Analytics filters">
          <div className="lw-filter-head analytics-filter-heading">
            <p role="status">
              <strong>{fmt(model.total)}</strong> of {fmt(cases.length)} loaded cases
            </p>
            <div className="lw-actions">
              <button type="button" disabled={!filtered.length} onClick={exportFiltered}>
                Export CSV
              </button>
              <button type="button" disabled={!activeChips.length} onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear all
              </button>
            </div>
          </div>
          <div className="lw-filter-grid">
            {[
              ["Court", "court", options.courts, "All courts"],
              ["Filing year", "year", years, "All filing years"],
              ["Case type", "type", options.types, "All case types"],
              ["Status", "status", ["Pending", "Disposed", "Status unavailable"], "All statuses"],
              ["Current stage", "stage", options.stages, "All stages"],
              ["Advocate", "advocate", advocates, "All recorded advocates"],
            ].map(([label, key, values, empty]) => (
              <label key={key}>
                {label}
                <select value={filters[key]} onChange={(event) => set(key, event.target.value)}>
                  <option value="">{empty}</option>
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="lw-search">
              Search portfolio
              <span className="search-box">
                <WorkspaceIcon name="search" size={16} />
                <input
                  type="search"
                  value={filters.search}
                  onChange={(event) => set("search", event.target.value)}
                  placeholder="Case, CNR, party or court"
                />
              </span>
            </label>
          </div>
          {activeChips.length > 0 && (
            <div className="lw-chips" aria-label="Active filters">
              {activeChips.map(([key, value]) => (
                <button key={key} type="button" className="lw-chip" onClick={() => clearOne(key)}>
                  {FILTER_NAMES[key] || key}: {value} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section id="summary" className="analytics-metrics lw-kpis" aria-label="Portfolio summary">
        {metrics.map((metric, index) => (
          <article key={metric.label} className={`lw-kpi ${index === 1 ? "is-accent" : ""}`}>
            <CaseButton className="lw-kpi-button" cases={metric.cases} onOpen={open}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.note}</small>
            </CaseButton>
          </article>
        ))}
      </section>

      <section className="lw-secondary" aria-label="Ageing summary">
        <div className="lw-mini">
          <span>Pending over 12 months</span>
          <strong>{fmt(diagnostic.old.length)}</strong>
          <small>{pct(oldShare)} of pending</small>
        </div>
        <div className="lw-mini">
          <span>Unknown status</span>
          <strong>{fmt(model.unknown + model.listed)}</strong>
          <small>Excluded from disposal rate</small>
        </div>
        <div className="lw-mini">
          <span>Average pending age</span>
          <strong>{diagnostic.averageAge == null ? "—" : `${fmt(diagnostic.averageAge)} days`}</strong>
          <small>Filing-date samples only</small>
        </div>
        <div className="lw-mini">
          <span>Median pending age</span>
          <strong>{diagnostic.medianAge == null ? "—" : `${fmt(diagnostic.medianAge)} days`}</strong>
          <small>Filing-date samples only</small>
        </div>
      </section>

      <div className="lw-grid">
        <Panel
          id="pendency"
          title="Pending by stage"
          note={model.pending ? `Share of ${fmt(model.pending)} filtered pending cases. Click a stage to open its cases.` : "No confirmed pending cases match these filters."}
        >
          <div className="lw-stage-cards">
            {pendingRows.map((row) => (
              <CaseButton
                key={row.label}
                className="pending-stage-card"
                cases={row.cases}
                onOpen={(records) => open(records, { status: "Pending", stage: row.label })}
              >
                <span>
                  {row.label}
                  <WorkspaceIcon name="arrow" size={16} />
                </span>
                <strong>
                  {fmt(row.count)} {row.count === 1 ? "case" : "cases"}
                </strong>
                <small>{pct(percentage(row.count, model.pending))} of pending</small>
                <progress max="100" value={percentage(row.count, model.pending) || 0} />
              </CaseButton>
            ))}
          </div>
          {!pendingRows.length && <p className="lw-empty">No pending stages are recorded.</p>}
        </Panel>

        <Panel
          id="turnaround"
          title="Stage timing"
          className="lw-wide"
          note={`Overall filing → disposal: ${model.averageTat == null ? "—" : `${fmt(model.averageTat)} days average`} · ${model.medianTat == null ? "—" : `${fmt(model.medianTat)} days median`} · n=${model.tatSamples}`}
        >
          <p className="lw-note">
            Stage timing is worked out from saved hearing history. It is an estimate, not an exact legal milestone.
          </p>
          {phaseGroups.map(([label, stages]) =>
            stages.length ? (
              <section className="lw-phase" key={label}>
                <h3>{label}</h3>
                <div className="lw-stage-cards">
                  {stages.map((stage) => {
                    const row = durations.get(stage);
                    return (
                      <article className="lw-stage-card stage-turnaround-card" key={stage}>
                        <span>{stage}</span>
                        <strong>{row ? `${fmt(row.days / row.samples)} days` : "—"}</strong>
                        <small>{row ? `Based on ${fmt(row.cases)} ${row.cases === 1 ? "case" : "cases"}` : "No completed transition"}</small>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null,
          )}
        </Panel>

        <Panel
          id="trend"
          title="Filings and disposals"
          className="analytics-primary-trend lw-wide"
          note="Each filing and disposal is counted in the month it happened."
          action={
            <label className="lw-select-inline">
              Trend window
              <select
                value={windowSize}
                onChange={(event) => setWindowSize(event.target.value === "annual" ? "annual" : Number(event.target.value))}
              >
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
                <option value="annual">Yearly</option>
              </select>
            </label>
          }
        >
          {windowSize === "annual" ? (
            <div className="lw-table-wrap">
              <p className="muted">Calendar-year totals. The filing year filter is ignored here so years can be compared.</p>
              <table className="lw-table">
                <caption>Annual filings and disposals</caption>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Filings</th>
                    <th>Disposals</th>
                  </tr>
                </thead>
                <tbody>
                  {annual.map((row) => (
                    <tr key={row.year}>
                      <th>{row.year}</th>
                      <td>{row.filings}</td>
                      <td>{row.disposals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="lw-legend">
              <span><i className="lw-dot filings" />Filings</span>
              <span><i className="lw-dot disposals" />Disposals</span>
            </div>
          )}
          {windowSize !== "annual" && <TrendChart rows={model.trend} />}
        </Panel>

        <Panel id="ageing" title="Ageing of pending cases" note="Total age from filing date to today. This is not time in the current stage.">
          <HBars rows={ageBuckets.map((bucket) => ({ label: bucket.label, count: bucket.cases.length, cases: bucket.cases }))} suffix="pending" onOpen={open} />
          <p className="lw-note">
            {diagnostic.oldest
              ? `Oldest dated pending case: ${fmt(diagnostic.oldest.days)} days, currently at ${caseStage(diagnostic.oldest.item)}.`
              : "No dated pending cases are available."}
          </p>
        </Panel>

        <Panel id="composition" title="Case mix and outcomes" note="Based on recorded case types and nature of disposal.">
          <div className="lw-donut-wrap">
            <Donut rows={caseTypes} />
            <ul className="lw-legend-list">
              {caseTypes.map((row, index) => (
                <li key={row.label}>
                  <CaseButton cases={row.cases} onOpen={open} className="lw-legend-item">
                    <i className={`lw-swatch seg-${index % 6}`} />
                    {row.label} <strong>{fmt(row.count)}</strong>
                  </CaseButton>
                </li>
              ))}
            </ul>
          </div>
          <h3 className="lw-subhead">Nature of disposal</h3>
          <HBars rows={outcomes} onOpen={open} />
        </Panel>

        <Panel id="hearings" title="Upcoming hearings" note="Next 30 days, from the saved next hearing date.">
          <CaseButton className="lw-big-number" cases={upcoming} onOpen={open}>
            <strong>{fmt(upcoming.length)}</strong>
            <span>hearings in the next 30 days</span>
          </CaseButton>
        </Panel>

        <Panel id="cohorts" title="Backlog by filing year" note="Pending cases grouped by filing year. Missing dates are kept separate.">
          <HBars rows={cohortRows} onOpen={open} />
        </Panel>

        <Panel id="courts" title="Court comparison" className="lw-wide" note="Comparative workload only. These measures do not show that one court performs better than another.">
          <div className="lw-table-wrap">
            <table className="lw-table">
              <caption>Filtered court portfolio</caption>
              <thead>
                <tr>
                  {[
                    ["Court", "label"],
                    ["Total", "total"],
                    ["Pending", "pending"],
                    ["Disposed", "disposed"],
                    ["Disposal %", "disposalRate"],
                    ["Avg TAT", "averageTat"],
                    ["Common pending stage", "commonPendingStage"],
                  ].map(([label, key]) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={courtSort.key === key ? (courtSort.direction === "asc" ? "ascending" : "descending") : undefined}
                    >
                      <button type="button" className="lw-sort" onClick={() => sortCourts(key)}>
                        {label}
                        {courtSort.key === key ? (courtSort.direction === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courtRows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">
                      <CaseButton cases={row.cases} onOpen={open} className="lw-link">
                        {row.label}
                      </CaseButton>
                    </th>
                    <td>{row.total}</td>
                    <td>{row.pending}</td>
                    <td>{row.disposed}</td>
                    <td>{pct(row.disposalRate)}</td>
                    <td>{row.averageTat === null ? "—" : `${fmt(row.averageTat)}d · n=${row.tatSamples}`}</td>
                    <td>{row.commonPendingStage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel id="advocates" title="Advocate review" className="lw-wide" note="Derived from saved petitioner advocate text. “Not recorded” does not mean no advocate was assigned.">
          <HBars rows={diagnostic.advocates.map((row) => ({ label: row.label, count: row.old12, cases: row.cases }))} suffix="over 12m" onOpen={open} />
          <div className="lw-table-wrap">
            <table className="lw-table">
              <caption>Advocate workload and age review</caption>
              <thead>
                <tr>
                  <th>Advocate</th>
                  <th>Pending</th>
                  <th>Share</th>
                  <th>Avg age</th>
                  <th>Median age</th>
                  <th>Over 12m</th>
                  <th>Over 24m</th>
                  <th>Main stage</th>
                  <th>Review queue</th>
                </tr>
              </thead>
              <tbody>
                {diagnostic.advocates.map((row) => (
                  <tr key={row.label}>
                    <th>
                      <CaseButton cases={row.cases} onOpen={open} className="lw-link">
                        {row.label}
                      </CaseButton>
                    </th>
                    <td>{row.cases.length}</td>
                    <td>{pct(percentage(row.cases.length, model.pending))}</td>
                    <td>{fmt(row.averageAge)}d</td>
                    <td>{fmt(row.medianAge)}d</td>
                    <td>{row.old12}</td>
                    <td>{row.old24}</td>
                    <td>{row.dominantStage}</td>
                    <td>{row.review} over {assumptions.reviewDays || 365}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel id="priority" title="Priority cases" className="lw-wide" note="Cases flagged by age or missing filing date. Use this as a review list.">
          <div className="lw-toolbar">
            <label>
              Search priority cases
              <input
                type="search"
                value={prioritySearch}
                onChange={(event) => {
                  setPrioritySearch(event.target.value);
                  setPriorityPage(0);
                }}
                placeholder="Case, party, stage or advocate"
              />
            </label>
            <button type="button" disabled={!priorityRows.length} onClick={exportPriority}>
              Export {priorityRows.length} cases
            </button>
          </div>
          <div className="lw-table-wrap">
            <table className="lw-table">
              <caption>{priorityRows.length} priority cases</caption>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Respondent</th>
                  <th>Filing date</th>
                  <th>Pending age</th>
                  <th>Current stage</th>
                  <th>Advocate</th>
                  <th>Reason flagged</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ item, days }) => (
                  <tr key={item.cnr}>
                    <th>
                      <CaseButton cases={[item]} onOpen={open} className="lw-link">
                        {item.data?.case_reference || item.cnr}
                      </CaseButton>
                    </th>
                    <td>{(item.data?.respondents || []).join("; ") || "—"}</td>
                    <td>{item.data?.filing_date || "—"}</td>
                    <td>{days == null ? "—" : `${fmt(days)} days`}</td>
                    <td>{caseStage(item)}</td>
                    <td>{caseAdvocate(item)}</td>
                    <td>{days == null ? "Filing date unavailable." : days > 730 ? "Pending over 24 months." : "Older than review threshold."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lw-pagination">
            <span>
              Showing {priorityRows.length ? priorityPage * 10 + 1 : 0}–{Math.min(priorityRows.length, priorityPage * 10 + 10)} of {priorityRows.length}
            </span>
            <button type="button" disabled={!priorityPage} onClick={() => setPriorityPage((value) => value - 1)}>
              Previous
            </button>
            <button type="button" disabled={(priorityPage + 1) * 10 >= priorityRows.length} onClick={() => setPriorityPage((value) => value + 1)}>
              Next
            </button>
          </div>
        </Panel>

        <Panel id="financial" title="Financial impact scenario" className="lw-wide" note="No verified balances are saved. This is an illustration only, not an actual loss or recovery figure.">
          <div className="lw-scenario">
            <label>
              Assumed exposure per case (₹)
              <input type="number" min="0" value={assumptions.exposure} onChange={(event) => setAssumptions((old) => ({ ...old, exposure: event.target.value }))} placeholder="Only if case count is an accepted proxy" />
            </label>
            <label>
              Annual cost of capital (%)
              <input type="number" min="0" max="100" value={assumptions.rate} onChange={(event) => setAssumptions((old) => ({ ...old, rate: event.target.value }))} />
            </label>
            <label>
              Scenario duration (years)
              <input type="number" min="0" value={assumptions.years} onChange={(event) => setAssumptions((old) => ({ ...old, years: event.target.value }))} />
            </label>
          </div>
          <label className="lw-check">
            <input type="checkbox" checked={proxyAcknowledged} onChange={(event) => setProxyAcknowledged(event.target.checked)} />
            I confirm that, for this illustration only, each pending case may be treated as a unique account.
          </label>
          <p className="lw-result">
            {exposure > 0 && proxyAcknowledged
              ? `Illustrative exposure: ₹${fmt(totalExposure)} · annual carrying cost: ₹${fmt(annualCarry)} · ${scenarioYears}-year illustration: ₹${fmt(annualCarry * scenarioYears)}.`
              : "Enter an exposure amount and confirm the proxy to see an illustration."}
          </p>
        </Panel>

        <Panel id="actions" title="Suggested review actions" note="Rule-based prompts, not predictions.">
          <div className="lw-actions-list">
            <CaseButton cases={model.longPending.map((row) => row.item)} onOpen={open} className="lw-action">
              <strong>Review older pending cases</strong>
              <span>{fmt(diagnostic.old.length)} cases are older than 12 months.</span>
            </CaseButton>
            <CaseButton cases={pendingRows[0]?.cases || []} onOpen={open} className="lw-action">
              <strong>Review the largest stage</strong>
              <span>{pendingRows[0] ? `${pendingRows[0].label} · ${fmt(pendingRows[0].count)} pending` : "No pending cases"}</span>
            </CaseButton>
          </div>
        </Panel>
      </div>
    </main>
  );
}