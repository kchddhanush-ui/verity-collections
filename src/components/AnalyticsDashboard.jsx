import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  analyticsOptions, annualActivity, buildAnalytics, caseAdvocate, caseStage,
  caseStatus, caseType, courtPerformanceRows, filterCases, filingYear,
  observedStageDurations, pendingStageRows, portfolioDiagnostic, tidy,
} from "../lib/analytics";
import { caseCsv } from "../lib/csv";
import { formatHearingDate, indiaToday } from "../lib/hearings";
import { AnalyticsReportContent, formatNumber } from "./AnalyticsReportContent";
import { WorkspaceIcon } from "./WorkspaceIcon";

const filterLabels = {
  court: "Court", year: "Filing year", type: "Case type", status: "Status",
  stage: "Current stage", advocate: "Advocate", search: "Search",
};
const emptyFilters = Object.fromEntries(Object.keys(filterLabels).map((key) => [key, ""]));
const priorityPageSize = 10;
const sections = [
  ["summary", "Summary"], ["backlog", "Backlog"], ["stages", "Stages"],
  ["age", "Age"], ["turnaround", "Turnaround"], ["activity", "Activity"],
  ["advocates", "Advocates"], ["courts", "Courts"], ["financial", "Financial impact"],
  ["priority", "Priority cases"], ["takeaways", "Takeaways"],
];

function downloadFile(content, name, type) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([content], { type }));
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sortCourts(rows, { key, direction }) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => {
    const left = a[key], right = b[key];
    if (left == null && right != null) return 1;
    if (right == null && left != null) return -1;
    const delta = typeof left === "number" && typeof right === "number"
      ? left - right : collator.compare(left ?? "", right ?? "");
    return delta * (direction === "asc" ? 1 : -1) || collator.compare(a.label, b.label);
  });
}

function buildReport(cases, today, months, reviewDays) {
  const totals = buildAnalytics(cases, { today, months });
  const diagnostic = portfolioDiagnostic(cases, today, reviewDays);
  const pendingStages = pendingStageRows(cases);
  const datedCases = new Set(diagnostic.dated.map(({ item }) => item));
  const undated = diagnostic.pending.filter((item) => !datedCases.has(item));
  const ageBuckets = [
    { label: "Under 6 months", max: 182 }, { label: "6–12 months", max: 365 },
    { label: "1–2 years", max: 730, tone: "pending" },
    { label: "Over 2 years", max: Infinity, tone: "pending" },
  ].map((bucket, i, all) => ({
    ...bucket,
    cases: diagnostic.dated
      .filter(({ days }) => days > (all[i - 1]?.max ?? -1) && days <= bucket.max)
      .map(({ item }) => item),
  }));
  if (undated.length) ageBuckets.push({ label: "Filing date unavailable", cases: undated, tone: "muted" });

  const priorities = diagnostic.dated
    .filter(({ days }) => days > reviewDays)
    .sort((a, b) => b.days - a.days)
    .map(({ item, days }) => ({
      item, days,
      reason: days > 730 ? "Pending over 24 months" : `Pending over ${formatNumber(reviewDays)} days`,
    }));
  priorities.push(...undated.map((item) => ({ item, days: null, reason: "Filing date unavailable" })));
  const disposed = totals.closedCases.map(({ item }) => item);
  return {
    cases, totals, diagnostic, pendingStages, ageBuckets, undated, priorities,
    disposed,
    unavailable: cases.filter((item) => ["Status unknown", "Listed only"].includes(caseStatus(item))),
    durations: observedStageDurations(cases, today),
    courts: courtPerformanceRows(cases, today),
    caseTypes: totals.types.map((row) => ({
      label: row.label, cases: cases.filter((item) => caseType(item) === row.label),
    })),
    outcomes: totals.disposalTypes.map((row) => ({
      label: row.label,
      cases: disposed.filter((item) => (tidy(item.data?.nature_of_disposal).toUpperCase() || "Not recorded") === row.label),
    })),
  };
}

function ReportHeader({ company, today, shown, loaded, activeFilters, actions, showScope = true }) {
  return <header className="analytics-header">
    <div>
      <p className="analytics-eyebrow">Portfolio analytics</p>
      <h1>{company} — Legal Portfolio Review</h1>
      <p className="analytics-scope">
        <span>As of {formatHearingDate(today)}</span>
        {showScope && <span>{formatNumber(shown)} of {formatNumber(loaded)} loaded cases</span>}
      </p>
      {showScope && activeFilters.length > 0 && <ul className="analytics-scope-filters" aria-label="Applied filters">
        {activeFilters.map(([key, value]) => <li key={key}>{filterLabels[key]} <strong>{value}</strong></li>)}
      </ul>}
    </div>
    {actions}
  </header>;
}

function SectionLinks({ active, onSelect }) {
  return <nav className="analytics-nav" aria-label="Analytics sections">
    {sections.map(([id, label]) => <a
      key={id}
      href={`#analytics-${id}`}
      aria-current={active === id ? "location" : undefined}
      onClick={() => onSelect?.(id)}
    >{label}</a>)}
  </nav>;
}

function Filters({ choices, filters, onChange, count, loaded, onClear, onExport }) {
  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  return <section className="analytics-surface analytics-filters" aria-labelledby="analytics-filter-title">
    <div className="analytics-toolbar">
      <div className="analytics-filter-heading">
        <h2 id="analytics-filter-title">Filters</h2>
        <p role="status">{formatNumber(count)} of {formatNumber(loaded)} loaded cases</p>
      </div>
      <div className="analytics-actions">
        {activeFilters.length > 0 && <button type="button" className="analytics-button analytics-quiet" onClick={onClear}>Clear filters</button>}
        <button type="button" className="analytics-button" disabled={!count} onClick={onExport}>Export CSV</button>
      </div>
    </div>
    <div className="analytics-fields">
      {choices.map(([key, values, placeholder]) => <label key={key}>
        {filterLabels[key]}
        <select id={`analytics-filter-${key}`} value={filters[key]} onChange={(event) => onChange(key, event.target.value)}>
          <option value="">{placeholder}</option>
          {values.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>)}
      <label className="analytics-search-field">
        Search portfolio
        <span className="analytics-search-input">
          <WorkspaceIcon name="search" size={16} />
          <input id="analytics-filter-search" type="search" value={filters.search} placeholder="Case number, CNR or party"
            onChange={(event) => onChange("search", event.target.value)} />
        </span>
      </label>
    </div>
    {activeFilters.length > 0 && <ul className="analytics-scope-filters" aria-label="Applied filters">
      {activeFilters.map(([key, value]) => <li key={key} className="analytics-filter-chip-item">
        <button type="button" className="analytics-button analytics-filter-chip"
          aria-label={`Remove ${filterLabels[key]} filter ${value}`}
          onClick={() => {
            onChange(key, "");
            document.getElementById(`analytics-filter-${key}`)?.focus();
          }}>
          <span>{filterLabels[key]} <strong>{value}</strong></span> <span aria-hidden="true">×</span>
        </button>
      </li>)}
    </ul>}
  </section>;
}

export function AnalyticsDashboard({ cases, onStageCases, company = "Company", today = indiaToday() }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [presenting, setPresenting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [scenario, setScenario] = useState({ exposure: "", rate: "10", years: "1", useCaseCount: false });
  const [priorityPage, setPriorityPage] = useState(0);
  const [prioritySearch, setPrioritySearch] = useState("");
  const [windowSize, setWindowSize] = useState(12);
  const [courtSort, setCourtSort] = useState({ key: "total", direction: "desc" });
  const [activeSection, setActiveSection] = useState("summary");
  const dashboard = useRef(null);

  const choices = useMemo(() => {
    const options = analyticsOptions(cases);
    return [
      ["court", options.courts, "All courts"],
      ["year", [...new Set(cases.map(filingYear).filter(Boolean))].sort().reverse(), "All filing years"],
      ["type", options.types, "All case types"],
      ["status", ["Pending", "Disposed", "Status unavailable"], "All statuses"],
      ["stage", options.stages, "All stages"],
      ["advocate", [...new Set(cases.map(caseAdvocate))].sort(), "All advocates"],
    ];
  }, [cases]);
  const filtered = useMemo(() => filterCases(cases, filters), [cases, filters]);
  const report = useMemo(() => buildReport(filtered, today, windowSize, 365), [filtered, today, windowSize]);
  const courtRows = useMemo(() => sortCourts(report.courts, courtSort), [report.courts, courtSort]);
  const annual = useMemo(() => annualActivity(filterCases(cases, { ...filters, year: "" }), today), [cases, filters, today]);
  const priorityRows = useMemo(() => {
    if (!tidy(prioritySearch)) return report.priorities;
    const matching = new Set(filterCases(report.priorities.map(({ item }) => item), { search: prioritySearch }));
    return report.priorities.filter(({ item }) => matching.has(item));
  }, [report.priorities, prioritySearch]);
  const page = Math.min(priorityPage, Math.max(0, Math.ceil(priorityRows.length / priorityPageSize) - 1));
  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  const header = { company, today, shown: filtered.length, loaded: cases.length, activeFilters };

  useEffect(() => {
    if (!presenting) return;
    document.body.classList.add("lawcovery-presentation");
    const exit = (event) => { if (event.key === "Escape") setPresenting(false); };
    document.addEventListener("keydown", exit);
    return () => {
      document.body.classList.remove("lawcovery-presentation");
      document.removeEventListener("keydown", exit);
    };
  }, [presenting]);

  useEffect(() => {
    if (!globalThis.IntersectionObserver) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (visible) setActiveSection(visible.target.id.replace("analytics-", ""));
    }, { rootMargin: "-28% 0px -62% 0px" });
    for (const [id] of sections) {
      const section = dashboard.current.querySelector(`#analytics-${id}`);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);

  function changeFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPriorityPage(0);
  }
  function openCases(records, extra = {}) {
    onStageCases?.({ ...filters, ...extra, caseIds: records.map((item) => item.cnr) });
  }
  function exportFiltered() {
    const headers = ["Case number", "CNR number", "Court", "Case type", "Status", "Stage", "Filing date", "Disposal date", "Decision date", "Advocate"];
    const rows = filtered.map((item) => {
      const data = item.data || {};
      return [data.case_reference || data.registration_number || item.cnr, item.cnr,
        data.court, data.case_type, data.case_status, data.case_stage, data.filing_date,
        data.disposal_date, data.decision_date, caseAdvocate(item)];
    });
    downloadFile(caseCsv(headers, rows), `Lawcovery-analytics-${today}.csv`, "text/csv;charset=utf-8");
  }
  function exportPriority() {
    const headers = ["Case", "Respondent", "Filing date", "Pending age (days)", "Stage", "Advocate", "Reason"];
    const rows = priorityRows.map(({ item, days, reason }) => [
      item.data?.case_reference || item.cnr, (item.data?.respondents || []).join("; "),
      item.data?.filing_date, days, caseStage(item), caseAdvocate(item), reason,
    ]);
    downloadFile(caseCsv(headers, rows), `Lawcovery-priority-cases-${today}.csv`, "text/csv;charset=utf-8");
  }

  const content = { report, courtRows, annual, windowSize, priorityRows, prioritySearch, scenario };
  async function exportReport() {
    setExporting(true);
    setExportError("");
    try {
      const { createAnalyticsReport } = await import("../lib/analyticsReport");
      const html = createAnalyticsReport({
        company,
        content: <>
          <ReportHeader {...header} />
          <SectionLinks />
          <AnalyticsReportContent {...content} />
        </>,
      });
      downloadFile(html, `${company.replace(/[^a-z0-9]+/gi, "-")}-legal-portfolio-report.html`, "text/html;charset=utf-8");
    } catch {
      setExportError("The HTML report could not be created. Try downloading it again.");
    } finally {
      setExporting(false);
    }
  }

  return <div ref={dashboard} className="analytics-dashboard">
    <ReportHeader {...header} showScope={presenting} actions={<div className="analytics-actions">
      <button type="button" className="analytics-button" aria-pressed={presenting} onClick={() => setPresenting(!presenting)}>
        {presenting ? "Exit presentation" : "Presentation mode"}
      </button>
      <button type="button" className="analytics-button analytics-button-primary" disabled={!filtered.length || exporting} onClick={exportReport}>
        {exporting ? "Preparing report…" : "Download report"}
      </button>
    </div>} />
    {exportError && <p className="analytics-error" role="alert">{exportError}</p>}
    {!presenting && <Filters choices={choices} filters={filters} onChange={changeFilter}
      count={filtered.length} loaded={cases.length} onExport={exportFiltered}
      onClear={() => { setFilters(emptyFilters); setPriorityPage(0); }} />}
    <SectionLinks active={activeSection} onSelect={setActiveSection} />
    <AnalyticsReportContent {...content}
      onOpen={onStageCases ? openCases : undefined}
      onWindowSize={setWindowSize}
      courtSort={courtSort}
      onCourtSort={(key) => setCourtSort((current) => ({
        key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
      }))}
      onScenarioChange={(key, value) => setScenario((current) => ({ ...current, [key]: value }))}
      priorityControls={{
        page, pageSize: priorityPageSize, onPage: setPriorityPage, onExport: exportPriority,
        onSearch: (value) => { setPrioritySearch(value); setPriorityPage(0); },
      }}
    />
  </div>;
}
