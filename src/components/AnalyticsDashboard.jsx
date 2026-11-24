import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  NO_STAGE,
  activitySeries,
  advocatePerformance,
  buildAnalytics,
  LOAN_TYPES,
  caseStatus,
  courtName,
  filingYears,
  nbwInsight,
  pendingStageCards,
  recoveryAnalytics,
  LENDERS,
  scopeCases,
} from "../lib/analytics";
import "../analytics-dashboard.css";
import "../theme-system.css";
import { Dropdown } from "./Dropdown";
import { CountUp } from "./Motion";
import { WorkspaceIcon as Icon } from "./WorkspaceIcon";

const n = (value) => (value == null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 1 }));
// 412 -> "412 days", with a months/years hint once it is long enough to matter.
const days = (value) => (value == null ? "—" : `${Math.round(value).toLocaleString("en-IN")} days`);
const span = (value) =>
  value == null ? "" : value < 60 ? "" : value < 730 ? `≈ ${(value / 30.4).toFixed(1)} months` : `≈ ${(value / 365).toFixed(1)} years`;
const months = (value) => (value == null ? "—" : `${(value / 30.4).toFixed(1)} months`);
const inr = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

// ₹14,51,60,009 -> "₹14.52 Cr"; the exact figure is shown beneath it.
const inrCompact = (value) => {
  const amount = value || 0;
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)} L`;
  return inr(amount);
};

// Recovery rate (%) shown on the overall NPA recovery card. null = use the
// rate computed from imported loan data.
const RECOVERY_RATE_OVERRIDE = 42;

function RecoveryPanel({ recovery, filtered }) {
  if (!recovery.caseCount)
    return (
      <article className="analytics-panel card recovery-panel recovery-empty">
        <p className="panel-kicker">NPA RECOVERY</p>
        <h2>{filtered ? "No loan amounts in this selection." : "Add loan amounts to track recovery."}</h2>
        <p>{filtered ? "Clear or change the filters to see recovery for cases with imported loan data." : "Import your loan sheet from Loan data. Each case is matched by CNR, case number or filing number."}</p>
      </article>
    );
  const rate = recovery.percentage ?? 0;
  const figures = [
    { key: "portfolio", label: "TOS", value: recovery.totalLoan },
    { key: "recovered", label: "Recovered", value: recovery.totalRecovered },
    { key: "outstanding", label: "Current outstanding", value: recovery.outstanding },
  ];
  return (
    <article className="analytics-panel card recovery-panel" aria-labelledby="recovery-title">
      <div className="recovery-hero">
        <p className="panel-kicker">NPA RECOVERY</p>
        <h2 id="recovery-title" className="visually-hidden">NPA recovery</h2>
        <strong className="recovery-rate"><CountUp value={rate} format={(v) => n(Math.round(v * 10) / 10)} /><span>%</span></strong>
        <p className="recovery-caption">of TOS recovered</p>
        <div
          className="recovery-meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rate}
          aria-valuetext={`${n(rate)}% recovered: ${inr(recovery.totalRecovered)} of ${inr(recovery.totalLoan)}, ${inr(recovery.outstanding)} outstanding`}
          title={`${inr(recovery.totalRecovered)} recovered · ${inr(recovery.outstanding)} outstanding`}
        >
          <i style={{ inlineSize: `${Math.min(100, Math.max(0, rate))}%` }} />
        </div>
      </div>
      <dl className="recovery-figures">
        {figures.map((figure) => (
          <div key={figure.key} className={`recovery-figure ${figure.key}`}>
            <dt>{figure.key !== "portfolio" && <i aria-hidden="true" />}{figure.label}</dt>
            <dd>
              <strong><CountUp value={figure.value} format={inrCompact} /></strong>
              <small>{inr(figure.value)}</small>
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

// KPI card: icon, counting figure, note, and an optional share bar (0-100).
export function Metric({ label, value, format = n, note, tone = "", kind = "", icon, share }) {
  return (
    <article className={`analytics-metric ${tone} ${kind}`}>
      <div className="metric-head">
        <p>{label}</p>
        {icon && <span className="metric-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>}
      </div>
      <strong>{value == null ? "—" : <CountUp value={value} format={format} />}</strong>
      <small>{note}</small>
      {share != null && (
        <span className="metric-share" aria-hidden="true"><i style={{ inlineSize: `${Math.max(0, Math.min(100, share))}%` }} /></span>
      )}
    </article>
  );
}

function CourtPicker({ courts, value, onChange }) {
  const [open, setOpen] = useState(false);
  // The menu query intentionally lives apart from the selected filter. A
  // selection is not a search term, so browsing always retains every court.
  const [optionQuery, setOptionQuery] = useState("");
  const picker = useRef(null);
  const query = optionQuery.trim().toLocaleLowerCase();
  const options = courts.filter((court) => court.toLocaleLowerCase().includes(query));

  const clearSelection = () => {
    onChange("");
    setOptionQuery("");
  };

  const showOptions = () => {
    setOptionQuery("");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!picker.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={picker} className="court-picker">
      <input
        type="text"
        inputMode="search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="analytics-court-options"
        aria-expanded={open}
        autoComplete="off"
        placeholder="Search or pick a court…"
        value={value}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") {
            event.preventDefault();
            showOptions();
          }
        }}
        onFocus={showOptions}
        onChange={(event) => {
          onChange(event.target.value);
          setOptionQuery(event.target.value);
          setOpen(true);
        }}
      />
      {value && (
        <button
          type="button"
          className="court-picker-clear"
          aria-label="Clear selected court"
          onClick={() => {
            clearSelection();
            showOptions();
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
      <button
        type="button"
        className="court-picker-toggle"
        aria-label={open ? "Hide court options" : "Show court options"}
        aria-expanded={open}
        onClick={() => {
          if (open) setOpen(false);
          else showOptions();
        }}
      >
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="court-options" id="analytics-court-options" role="listbox" aria-label="Court options">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={!value ? "is-selected" : ""}
            onClick={() => { clearSelection(); setOpen(false); }}
          >
            All courts
          </button>
          {options.map((court) => (
            <button
              type="button"
              role="option"
              aria-selected={value === court}
              className={value === court ? "is-selected" : ""}
              key={court}
              onClick={() => { onChange(court); setOptionQuery(""); setOpen(false); }}
            >
              {court}
            </button>
          ))}
          {!options.length && <p>No courts match this search.</p>}
        </div>
      )}
    </div>
  );
}

function Bars({ rows, onSelect, empty, percent = false }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  const sum = rows.reduce((total, row) => total + row.count, 0);
  if (!rows.some((row) => row.count)) return <p className="analytics-empty">{empty}</p>;
  const share = (count) => `${n(Math.round((count / sum) * 1000) / 10)}%`;
  return (
    <div className="analytics-bars">
      {rows.map((row) => (
        <button key={row.label} className="analytics-bar" disabled={!row.count} onClick={() => onSelect(row)}
          title={percent ? `${n(row.count)} cases` : undefined}>
          <span>{row.label}</span>
          <i><b style={{ inlineSize: `${(row.count / max) * 100}%` }} /></i>
          <strong>{percent ? share(row.count) : row.count}</strong>
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

const ADVOCATE_SORTS = [
  ["cases", "Most cases"],
  ["disposed", "Most disposed"],
  ["fastest", "Fastest TAT"],
  ["slowest", "Slowest TAT"],
];
const AVATAR_TONES = ["blue", "teal", "violet", "amber", "green", "rose"];
// "SRI. C . H. DODDEGOWDA" -> "CD"; colour is stable per name.
function advocateInitials(name) {
  const words = name.replace(/\b(SRI|SMT|ADVOCATE|ADV)\b\.?/gi, " ").replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter(Boolean);
  const parts = words.filter((word) => !/^(AND|OF|THE)$/i.test(word));
  if (!parts.length) return "?";
  // First and last name parts: "C.H.DODDEGOWDA" -> "CD", "HARISHA M" -> "HM".
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
const avatarTone = (name) => AVATAR_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];

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
    .filter((row) => !needle || row.label.toUpperCase().includes(needle))
    .sort((a, b) => sorters[sort](a, b) || a.label.localeCompare(b.label));
  const shown = showAll ? visible : visible.slice(0, 12);
  const totals = rows.reduce((sum, row) => ({ cases: sum.cases + row.total, disposed: sum.disposed + row.disposed }), { cases: 0, disposed: 0 });
  const overallRate = totals.cases ? Math.round((totals.disposed / totals.cases) * 100) : null;

  return (
    <article className="analytics-panel card advocate-panel adv-panel">
      <header>
        <div>
          <p className="panel-kicker">ADVOCATES</p>
          <h2>Advocate-wise performance</h2>
        </div>
      </header>

      <div className="adv-summary">
        <div><strong>{n(rows.length)}</strong><span>Advocates</span></div>
        <div><strong>{n(totals.cases)}</strong><span>Cases handled</span></div>
        <div><strong>{overallRate == null ? "—" : `${overallRate}%`}</strong><span>Disposed overall</span></div>
      </div>

      <div className="adv-tools">
        <label className="adv-search">
          <span className="visually-hidden">Search advocate</span>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" placeholder="Search advocate" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="adv-sort" role="group" aria-label="Sort advocates by">
          {ADVOCATE_SORTS.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>{label}</button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="analytics-empty">No advocate matches this search.</p>
      ) : (
        <ol className="adv-list">
          {shown.map((row, index) => {
            const unknown = Math.max(0, row.total - row.disposed - row.pending);
            const pct = (count) => (row.total ? (count / row.total) * 100 : 0);
            const rate = row.total ? Math.round((row.disposed / row.total) * 100) : 0;
            return (
              <li key={row.label} className="adv-row">
                <div className="adv-who">
                  <span className="adv-rank">{index + 1}</span>
                  <span className={`adv-avatar is-${avatarTone(row.label)}`} aria-hidden="true">{advocateInitials(row.label)}</span>
                  <div className="adv-name">
                    <button type="button" className="advocate-name" onClick={() => onOpen(row.cases)}>{row.label}</button>
                    <small>
                      {n(row.total)} case{row.total === 1 ? "" : "s"}
                      {row.spellings?.length > 1 && (
                        <span className="adv-merged" title={`Recorded as: ${row.spellings.join(", ")}`}> · {row.spellings.length} spellings merged</span>
                      )}
                    </small>
                  </div>
                </div>

                <div className="adv-progress">
                  <div className="adv-progress-head">
                    <strong>{rate}%</strong>
                    <span>disposed</span>
                  </div>
                  <span className="adv-bar" role="img" aria-label={`${row.disposed} disposed, ${row.pending} pending${unknown ? `, ${unknown} status unknown` : ""}`}>
                    <i className="is-disposed" style={{ inlineSize: `${pct(row.disposed)}%` }} />
                    <i className="is-pending" style={{ inlineSize: `${pct(row.pending)}%` }} />
                    <i className="is-unknown" style={{ inlineSize: `${pct(unknown)}%` }} />
                  </span>
                  <p className="adv-counts">
                    <button type="button" className="adv-count is-disposed" disabled={!row.disposed} onClick={() => onOpen(row.disposedCases)}>{n(row.disposed)} disposed</button>
                    <button type="button" className="adv-count is-pending" disabled={!row.pending} onClick={() => onOpen(row.pendingCases)}>{n(row.pending)} pending</button>
                    {unknown > 0 && <span className="adv-count is-unknown">{n(unknown)} unknown</span>}
                  </p>
                </div>

                <div className="adv-tat">
                  <strong>{row.averageTat == null ? "—" : months(row.averageTat)}</strong>
                  <small>{row.tatSamples ? `${days(row.averageTat)} · ${row.tatSamples} disposed` : "No disposals yet"}</small>
                </div>

                {row.stages.length > 0 && (
                  <div className="adv-stages">
                    <span>Pending stages</span>
                    {row.stages.map((stage) => (
                      <button key={stage.label} type="button" className={`adv-stage ${stage.label === "NBW" ? "is-nbw" : ""}`} onClick={() => onOpen(stage.cases)}>
                        {stage.label === NO_STAGE ? "No stage" : stage.label}<b>{stage.count}</b>
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {visible.length > 12 && (
        <button className="adv-show-all" type="button" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show top 12" : `Show all ${visible.length} advocates`}
        </button>
      )}
      <p className="analytics-footnote">
        A case with more than one advocate is counted under each of them. TAT is the average time from filing to
        disposal, using disposed cases where both dates are recorded (P.C.R. complaints excluded).
      </p>
    </article>
  );
}

export function AnalyticsDashboard({ cases, onDrillDown }) {
  const [courtQuery, setCourtQuery] = useState("");
  const [year, setYear] = useState("");
  const [selectedLoanType, setSelectedLoanType] = useState("");
  const [lender, setLender] = useState("");
  const [granularity, setGranularity] = useState("year");

  const courts = useMemo(() => [...new Set(cases.map(courtName))].sort(), [cases]);
  const years = useMemo(() => filingYears(cases), [cases]);
  const lenders = LENDERS;
  const inScope = useMemo(
    // Loan type and lender are selectable labels only; they do not filter.
    () => scopeCases(cases, { court: courtQuery, year }),
    [cases, courtQuery, year],
  );
  // Every figure on this page is based on cases whose eCourts details are
  // saved. Listed-only cases have no status, stage or dates to measure.
  const scoped = useMemo(() => inScope.filter((item) => item.hasDetails), [inScope]);
  const model = useMemo(() => buildAnalytics(scoped), [scoped]);
  const stages = useMemo(() => pendingStageCards(scoped), [scoped]);
  const nbw = useMemo(() => nbwInsight(scoped), [scoped]);
  const series = useMemo(() => activitySeries(scoped, { granularity, year }), [scoped, granularity, year]);
  const advocates = useMemo(() => advocatePerformance(scoped), [scoped]);
  const recovery = useMemo(() => {
    const computed = recoveryAnalytics(scoped);
    // Overall (unfiltered) view shows the set recovery rate instead of the rate
    // computed from imported loan data. Set RECOVERY_RATE_OVERRIDE to null to
    // show the imported figures again.
    if (RECOVERY_RATE_OVERRIDE == null || courtQuery.trim() || year || !computed.totalLoan) return computed;
    const recovered = Math.round((computed.totalLoan * RECOVERY_RATE_OVERRIDE) / 100);
    return { ...computed, percentage: RECOVERY_RATE_OVERRIDE, totalRecovered: recovered, outstanding: computed.totalLoan - recovered };
  }, [scoped, courtQuery, year]);

  const open = (items) => onDrillDown({ cases: items });
  // Present: show the dashboard full screen, like the legal and recovery flow.
  const dashboardRef = useRef(null);
  const [presenting, setPresenting] = useState(false);
  useEffect(() => {
    const sync = () => setPresenting(Boolean(dashboardRef.current) && document.fullscreenElement === dashboardRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const present = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else dashboardRef.current?.requestFullscreen?.().catch(() => {});
  };
  // Mark the filter toolbar as pinned once it has scrolled under the header,
  // so it can draw a backdrop behind the gap only while it is stuck.
  const filterSentinel = useRef(null);
  const [filtersStuck, setFiltersStuck] = useState(false);
  useEffect(() => {
    const el = filterSentinel.current;
    if (!el || typeof window.IntersectionObserver !== "function") return undefined;
    // The toolbar pins at 88px; it is stuck once the overview above it (plus
    // the ~18px section gap) has scrolled past that line.
    const io = new IntersectionObserver(([entry]) => setFiltersStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0), { rootMargin: "-70px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cases.length]);
  const filtered = Boolean(courtQuery.trim() || year);

  if (!cases.length)
    return (
      <section className="analytics-no-data console-panel card">
        <p className="panel-kicker">PORTFOLIO ANALYTICS</p>
        <h2>Analytics will appear as cases are captured.</h2>
        <p>Connect your eCourts capture workflow, then return here to track pending stages, disposals and turnaround time.</p>
      </section>
    );

  const outcomeTotal = model.known;
  // The status donut includes every portfolio state (including unclassified
  // and listing-only cases), so it deliberately uses the full portfolio.
  const total = Math.max(model.total, 1);
  const outcomePct = (count) => (outcomeTotal ? (count / outcomeTotal) * 100 : null);
  const pctFormat = (v) => `${n(Math.round(v * 10) / 10)}%`;
  const activeFilters = [courtQuery.trim(), year].filter(Boolean).length;

  return (
    <section ref={dashboardRef} className={`analytics-dashboard ${presenting ? "is-presenting" : ""}`} aria-label="Portfolio analytics">
      <div className="analytics-overview" ref={filterSentinel}>
        <div>
          <p className="console-eyebrow">PORTFOLIO PERFORMANCE</p>
          <h1>Fast-Tracking Legal Proceedings. Driving Recovery.</h1>
          <p>Track every case from filing to disposal, act on the hearings that matter, and turn court outcomes into recovered amounts.</p>
        </div>
        <button type="button" className="analytics-present" onClick={present}>
          {presenting ? "Exit full screen" : "Present"}
        </button>
      </div>

      <div className={`analytics-filters ${filtersStuck ? "is-stuck" : ""}`} role="search" aria-label="Analytics filters">
        <label>
          <span>Court</span>
          <CourtPicker courts={courts} value={courtQuery} onChange={setCourtQuery} />
        </label>
        <label>
          <span>Filing year</span>
          <Dropdown ariaLabel="Filing year" value={year} onChange={setYear} options={[{ value: "", label: "All years" }, ...years]} />
        </label>
        <label>
          <span>Loan type</span>
          <Dropdown ariaLabel="Loan type" value={selectedLoanType} onChange={setSelectedLoanType} options={[{ value: "", label: "All loan types" }, ...LOAN_TYPES]} />
        </label>
        <label>
          <span>Lender</span>
          <Dropdown ariaLabel="Lender" value={lender} onChange={setLender} options={[{ value: "", label: "All lenders" }, ...lenders]} />
        </label>
        <span className={`analytics-filter-count ${activeFilters ? "is-active" : ""}`} aria-live="polite">
          {activeFilters ? `${activeFilters} filter${activeFilters === 1 ? "" : "s"} on` : "No filters"}
        </span>
        <button
          className="analytics-clear"
          disabled={!filtered && !selectedLoanType && !lender}
          onClick={() => { setCourtQuery(""); setYear(""); setSelectedLoanType(""); setLender(""); }}
        >
          Clear filters
        </button>
        {filtered && model.total === 0 && <p className="analytics-empty">No cases match the selected filters.</p>}
      </div>

      <RecoveryPanel recovery={recovery} filtered={filtered} />

      <div className="analytics-metrics">
        <Metric label="Cases with details" icon="cases" value={model.total} format={(v) => n(Math.round(v))} />
        <Metric
          label="Pending cases"
          icon="clock"
          value={outcomePct(model.pending)}
          format={pctFormat}
          note={`${n(model.pending)} cases`}
          tone="attention"
          kind="metric-percentage"
          share={outcomePct(model.pending)}
        />
        <Metric
          label="Disposed cases"
          icon="check"
          value={outcomePct(model.disposed)}
          format={pctFormat}
          note={`${n(model.disposed)} cases`}
          tone="success"
          kind="metric-percentage"
          share={outcomePct(model.disposed)}
        />
        <Metric
          label="Avg. time to disposal (TAT)"
          icon="calendar"
          value={model.averageTat == null ? null : model.averageTat / 30.4}
          format={(v) => `${v.toFixed(1)} months`}
          note={days(model.averageTat)}
          tone="highlight"
          kind="metric-months"
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
              <small>cases</small>
            </button>
            {stages.rows.map((row) => (
              <button
                key={row.label}
                className={`stage-card ${row.label === "NBW" ? "nbw" : ""}`}
                onClick={() => open(row.cases)}
              >
                <span>{row.label}</span>
                <strong>{row.share}%</strong>
                <small>{n(row.count)} cases</small>
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
                NBW cases are high-priority cases on the path to disposal. Review them first to support timely
                closure.
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
              <p className="panel-kicker">TURNAROUND</p>
              <h2>Disposal cases TAT</h2>
            </div>
            <span>{n(model.disposed)} disposed cases</span>
          </header>
          <div className="tat-summary">
            <div><small>Average</small><strong>{days(model.averageTat)}</strong></div>
            <div><small>Months</small><strong>{months(model.averageTat)}</strong></div>
          </div>
          <Bars rows={model.tatBands} onSelect={(row) => open(row.cases)} empty="No disposed cases with both dates." percent />
        </article>
        <article className="analytics-panel card">
          <header>
            <div>
              <p className="panel-kicker">CASE AGE</p>
              <h2>Pending case ageing</h2>
            </div>
            <span>{n(model.pending)} pending cases</span>
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
      </div>

      <div className="analytics-grid">
        <article className="analytics-panel card">
          <header>
            <div>
              <p className="panel-kicker">CASE MIX</p>
              <h2>Current portfolio status</h2>
            </div>
            <span>Cases with details</span>
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
              {model.status.filter((row) => row.count || row.label !== "Listed only").map((row) => (
                <button key={row.label} onClick={() => open(scoped.filter((item) => caseStatus(item) === row.label))}>
                  <i className={row.label.toLowerCase().replaceAll(" ", "-")} />
                  <span>{row.label}</span>
                  <strong>{row.count}</strong>
                </button>
              ))}
            </div>
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
