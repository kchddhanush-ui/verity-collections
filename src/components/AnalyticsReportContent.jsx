import React from "react";
import { caseAdvocate, caseStage, percentage } from "../lib/analytics";
import { formatHearingDate } from "../lib/hearings";

const phases = [
  ["Pre-Summoning & Issue of Process", ["SWORN STATEMENT", "SUMMONS", "NOTICE", "FOR STEPS", "AWAIT", "NBW"]],
  ["Appearance & Bail", ["APPEARANCE OF ACCUSED", "APPEARANCE OF ACCUSSED", "BAIL"]],
  ["Settlement / Pre-Trial Steps", ["A.D.R.", "ADR", "LOK ADALATH", "LOK ADALAT", "OBJECTION"]],
  ["Charge / Plea", ["FRAMING OF CHARGE OR PLEA"]],
  ["Trial & Evidence", ["EVIDENCES", "HEARING", "ACCUSED STATEMENT U/S 313 CRPC", "DEFENCE EVIDENCE"]],
  ["Final Arguments & Decision", ["ARGUMENTS", "ARGUMENT", "TO HEAR ON", "CALL ON", "ORDERS", "JUDGEMENT", "JUDGEMENTS"]],
];
const knownStages = new Set(phases.flatMap(([, stages]) => stages));
const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
export const formatNumber = (value) => value == null ? "—" : numberFormat.format(value);
const percent = (value) => value == null ? "—" : `${formatNumber(value)}%`;
const daysLabel = (value) => value == null ? "—" : `${formatNumber(value)} days`;

function Panel({ id, title, note, action, children }) {
  return <section className="analytics-surface analytics-panel" id={`analytics-${id}`} aria-labelledby={`analytics-title-${id}`} tabIndex={-1}>
    <header className="analytics-toolbar analytics-panel-header">
      <div><h2 id={`analytics-title-${id}`}>{title}</h2>{note && <p>{note}</p>}</div>
      {action}
    </header>
    {children}
  </section>;
}

function CaseAction({ cases, onOpen, as: Text = "div", className, children, ...props }) {
  if (!onOpen || !cases?.length) return <Text className={className} {...props}>{children}</Text>;
  return <button type="button" className={`analytics-action ${className || ""}`}
    onClick={() => onOpen(cases)} {...props}>{children}</button>;
}

function Table({ label, headers, children, wide = false, bounded = false, className = "" }) {
  return <div className={`analytics-table-scroll${bounded ? " analytics-table-bounded" : ""}`}
    tabIndex={0} role="region" aria-label={label}>
    <table className={`analytics-table${wide ? " analytics-table-wide" : ""} ${className}`}>
      <caption className="analytics-sr-only">{label}</caption>
      <thead><tr>{headers.map((head) => typeof head === "string"
        ? <th scope="col" key={head}>{head}</th>
        : <th scope="col" key={head.key} aria-sort={head.sort}>{head.content}</th>)}</tr></thead>
      {children}
    </table>
  </div>;
}

function Metric({ label, value, unit, note, tone, cases, onOpen }) {
  return <article className="analytics-metric" data-tone={tone}>
    <CaseAction className="analytics-metric-body" cases={cases} onOpen={onOpen}>
      <span className="analytics-metric-label">{label}</span>
      <strong className="analytics-metric-value">{value}{unit && <> <span>{unit}</span></>}</strong>
      <span className="analytics-metric-note">{note}</span>
    </CaseAction>
  </article>;
}

function Summary({ report, onOpen }) {
  const { totals, diagnostic, pendingStages, disposed, unavailable } = report;
  const oldShare = percentage(diagnostic.old.length, diagnostic.dated.length);
  const leadingStage = pendingStages[0];
  return <section id="analytics-summary" tabIndex={-1} aria-labelledby="analytics-summary-title">
    <h2 id="analytics-summary-title" className="analytics-sr-only">Portfolio summary</h2>
    <div className="analytics-metrics">
      <Metric label="Cases in view" value={formatNumber(totals.total)} tone="primary" cases={report.cases} onOpen={onOpen} note="Within the selected scope" />
      <Metric label="Pending" value={formatNumber(totals.pending)} tone="pending" cases={diagnostic.pending} onOpen={onOpen} note="Confirmed pending cases" />
      <Metric label="Disposed" value={formatNumber(totals.disposed)} tone="disposed" cases={disposed} onOpen={onOpen} note="Confirmed disposed cases" />
      <Metric label="Disposal share" value={percent(totals.disposalRate)} cases={disposed} onOpen={onOpen}
        note={`${formatNumber(totals.disposed)} of ${formatNumber(totals.known)} known statuses`} />
      <Metric label="Pending over 12 months" value={formatNumber(diagnostic.old.length)} tone="pending"
        cases={diagnostic.old.map(({ item }) => item)} onOpen={onOpen}
        note={oldShare == null ? "No usable filing dates" : `${percent(oldShare)} of dated pending cases`} />
      <Metric label="Avg. filing to disposal" value={formatNumber(totals.averageTat)} unit={totals.averageTat == null ? undefined : "days"}
        note={`${formatNumber(totals.tatSamples)} cases with valid dates`} />
    </div>
    <p className="analytics-coverage"><CaseAction as="span" cases={unavailable} onOpen={onOpen} className="analytics-table-link">
      {formatNumber(unavailable.length)} with status unavailable
    </CaseAction><span> · Disposal share uses confirmed pending and disposed cases.</span></p>
    <div className="analytics-findings" aria-label="Key findings">
      <div data-tone="pending">
        <span>Backlog age</span>
        <strong>{oldShare == null ? "No pending age available" : `${percent(oldShare)} older than 12 months`}</strong>
        <p>{formatNumber(diagnostic.old.length)} of {formatNumber(diagnostic.dated.length)} pending cases with usable filing dates</p>
      </div>
      <div>
        <span>Largest pending stage</span>
        <strong>{leadingStage?.label || "No pending cases"}</strong>
        <p>{leadingStage ? `${formatNumber(leadingStage.count)} cases · ${percent(percentage(leadingStage.count, totals.pending))} of pending` : "Change the filters to review a wider scope."}</p>
      </div>
      <div>
        <span>Oldest dated pending case</span>
        <strong>{daysLabel(diagnostic.oldest?.days)}</strong>
        <p>{diagnostic.oldest ? `Current stage ${caseStage(diagnostic.oldest.item)}` : "No usable filing dates"}</p>
      </div>
    </div>
  </section>;
}

function Bars({ rows, onOpen, unit = "cases", empty = "No cases match this view." }) {
  if (!rows.length) return <p className="analytics-empty">{empty}</p>;
  const peak = Math.max(1, ...rows.map((row) => row.value ?? row.cases?.length ?? 0));
  return <div className="analytics-bars">
    {rows.map(({ label, value, cases, tone }) => {
      const count = value ?? cases?.length ?? 0;
      return <CaseAction key={label} className="analytics-bar-row" data-tone={tone} cases={cases} onOpen={onOpen}>
        <span>{label}</span>
        <span className="analytics-bar-track" aria-hidden="true"><i style={{ inlineSize: `${count / peak * 100}%` }} /></span>
        <strong>{formatNumber(count)} <small>{unit}</small></strong>
      </CaseAction>;
    })}
  </div>;
}

function Backlog({ report, onOpen }) {
  const { diagnostic, totals } = report;
  const cohorts = diagnostic.yearRows;
  const types = [...new Set(cohorts.flatMap((row) => [...row.types.keys()]))].sort();
  const peak = Math.max(1, ...cohorts.map((row) => row.pending.length));
  const largest = cohorts.reduce((best, row) => row.pending.length > (best?.pending.length || 0) ? row : best, null);
  return <Panel id="backlog" title="Year-wise backlog" note="Cases grouped by their recorded filing year.">
    {largest && <>
      <div className="analytics-legend" aria-label="Case types">
        {types.map((type, index) => <span key={type}><i data-series={index % 5} />{type}</span>)}
      </div>
      <div className="analytics-bars">
        {cohorts.map((row) => <CaseAction key={row.label} cases={row.pending} onOpen={onOpen} className="analytics-bar-row">
          <span>{row.label}</span>
          <span className="analytics-bar-track analytics-stacked-track" aria-hidden="true">
            {types.map((type, index) => {
              const count = row.types.get(type) || 0;
              return count > 0 && <i key={type} data-series={index % 5} title={`${type} · ${formatNumber(count)} cases`}
                style={{ inlineSize: `${count / peak * 100}%` }} />;
            })}
          </span>
          <strong>{formatNumber(row.pending.length)} <small>pending</small></strong>
        </CaseAction>)}
      </div>
      <p className="analytics-finding">{largest.label} accounts for {percent(percentage(largest.pending.length, totals.pending))} of the pending backlog.</p>
    </>}
    {cohorts.length ? <Table label="Filing year cohorts" headers={["Filing year", "Pending by type", "Pending", "Backlog share", "Disposed", "Disposal share"]}>
      <tbody>{cohorts.map((row) => <tr key={row.label}>
        <th scope="row"><CaseAction as="span" className="analytics-table-link" cases={row.cases} onOpen={onOpen}>{row.label}</CaseAction></th>
        <td>{[...row.types].map(([type, count]) => `${type} ${formatNumber(count)}`).join(" · ") || "—"}</td>
        <td>{formatNumber(row.pending.length)}</td><td>{percent(percentage(row.pending.length, totals.pending))}</td>
        <td>{formatNumber(row.disposed.length)}</td><td>{percent(percentage(row.disposed.length, row.pending.length + row.disposed.length))}</td>
      </tr>)}</tbody>
    </Table> : <p className="analytics-empty">No filing cohorts match the selected scope.</p>}
  </Panel>;
}

function Heatmap({ label, stages, columns, onOpen }) {
  if (!stages.length) return null;
  const groups = columns.map((column) => ({ ...column, ids: new Set(column.cases.map(({ cnr }) => cnr)) }));
  const rows = stages.map((row) => ({
    ...row, cells: groups.map((column) => row.cases.filter(({ cnr }) => column.ids.has(cnr))),
  }));
  const peak = Math.max(1, ...rows.flatMap((row) => row.cells.map((cases) => cases.length)));
  return <div className="analytics-heatmap">
    <div className="analytics-toolbar"><h3>{label}</h3><span className="analytics-muted">Darker cells contain more cases</span></div>
    <Table label={label} headers={["Stage", ...groups.map(({ label }) => label), "Total"]} className="analytics-heatmap-table">
      <tbody>{rows.map((row) => <tr key={row.label}>
        <th scope="row">{row.label}</th>
        {row.cells.map((records, index) => <td key={groups[index].label}>
          <CaseAction as="span" className="analytics-heat-cell" data-level={Math.ceil(records.length / peak * 4)}
            cases={records} onOpen={onOpen} aria-label={`${row.label}, ${groups[index].label}: ${records.length} pending cases`}>
            {records.length ? formatNumber(records.length) : "—"}
          </CaseAction>
        </td>)}
        <td><strong>{formatNumber(row.count)}</strong></td>
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Total pending</th>
        {groups.map((group) => <td key={group.label}>{formatNumber(group.cases.length)}</td>)}
        <td>{formatNumber(stages.reduce((total, row) => total + row.count, 0))}</td>
      </tr></tfoot>
    </Table>
  </div>;
}

function Stages({ report, onOpen }) {
  const { pendingStages, totals, diagnostic } = report;
  return <Panel id="stages" title="Pending cases by stage" note={`Share of ${formatNumber(totals.pending)} confirmed pending cases.`}>
    {pendingStages.length ? <div className="analytics-stage-grid">
      {pendingStages.map((row) => <CaseAction key={row.label} className="pending-stage-card analytics-stage-card" cases={row.cases}
        onOpen={onOpen && ((records) => onOpen(records, { status: "Pending", stage: row.label }))}>
        <span>{row.label}</span>
        <strong>{formatNumber(row.count)} <small>cases</small></strong>
        <span className="analytics-stage-share">{percent(percentage(row.count, totals.pending))} of pending</span>
      </CaseAction>)}
    </div> : <p className="analytics-empty">No pending cases match the selected scope.</p>}
    <Heatmap label="Stage by filing year" stages={pendingStages}
      columns={diagnostic.yearRows.filter((row) => row.pending.length).map((row) => ({ label: row.label, cases: row.pending }))}
      onOpen={onOpen} />
  </Panel>;
}

function QuickStats({ items }) {
  return <dl className="analytics-quick-stats">{items.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd>{value}</dd>
  </div>)}</dl>;
}

function Age({ report, onOpen }) {
  const { diagnostic, pendingStages, ageBuckets } = report;
  return <Panel id="age" title="Backlog age" note="Days since filing for confirmed pending cases with a usable filing date.">
    <QuickStats items={[
      ["Average age", daysLabel(diagnostic.averageAge)], ["Median age", daysLabel(diagnostic.medianAge)],
      ["Dated pending cases", formatNumber(diagnostic.dated.length)],
    ]} />
    {diagnostic.pending.length ? <Bars rows={ageBuckets} onOpen={onOpen} unit="pending" /> : <p className="analytics-empty">No pending cases to compare.</p>}
    <Heatmap label="Stage by case age" stages={pendingStages} columns={ageBuckets} onOpen={onOpen} />
  </Panel>;
}

function Turnaround({ report }) {
  const { totals, durations } = report;
  const ranked = [...durations].map(([label, row]) => ({ label, value: row.days / row.samples }))
    .sort((a, b) => b.value - a.value);
  const groups = [...phases, ["Other recorded stages", [...durations.keys()].filter((stage) => !knownStages.has(stage)).sort()]];
  return <Panel id="turnaround" title="Turnaround and bottlenecks" note="Filing to disposal measures case closure. Stage turnaround uses completed periods in saved stage history.">
    <QuickStats items={[
      ["Average filing to disposal", daysLabel(totals.averageTat)], ["Median filing to disposal", daysLabel(totals.medianTat)],
      ["Cases with valid dates", formatNumber(totals.tatSamples)],
    ]} />
    {ranked.length > 0 && <h3 className="analytics-subheading">Longest average stage periods</h3>}
    <Bars rows={ranked.slice(0, 6)} unit="days" empty="No completed stage periods are recorded in this scope." />
    {ranked.length > 0 && <div className="analytics-phases">
      {groups.map(([label, stages]) => {
        const rows = stages.filter((stage) => durations.has(stage));
        return rows.length > 0 && <section className="analytics-phase" key={label}>
          <h3>{label}</h3>
          <ul>{rows.map((stage) => {
            const row = durations.get(stage);
            return <li className="stage-turnaround-card" key={stage}>
              <span>{stage}</span><strong>{daysLabel(row.days / row.samples)}</strong>
              <small>Based on {formatNumber(row.cases)} {row.cases === 1 ? "case" : "cases"}</small>
            </li>;
          })}</ul>
        </section>;
      })}
    </div>}
    <details className="analytics-method"><summary>How turnaround is calculated</summary>
      <p>Filing to disposal uses the recorded disposal date, with decision date as a fallback. A stage period starts at the first recorded entry for that stage and ends at the next different stage. Repeated entries stay in the same period. The average uses completed periods, and the case count shows distinct contributing cases.</p>
    </details>
  </Panel>;
}

function Trend({ rows }) {
  const peak = Math.max(0, ...rows.flatMap((row) => [row.filings, row.disposals]));
  if (!peak) return <p className="analytics-empty">No filings or disposals are recorded for this period.</p>;
  return <>
    <div className="analytics-legend"><span><i className="analytics-filings" />Filings</span><span><i className="analytics-disposals" />Disposals</span></div>
    <div className="analytics-trend-scroll" role="region" tabIndex={0} aria-label="Filings and disposals chart">
      <ol className="analytics-trend">{rows.map((row) => <li key={row.label}>
        <span className="analytics-sr-only">{row.label}, {row.filings} filings, {row.disposals} disposals.</span>
        <div className="analytics-trend-bars" aria-hidden="true">
          {[["filings", row.filings], ["disposals", row.disposals]].map(([series, count]) => <div key={series}>
            <span>{formatNumber(count)}</span>
            <i className={`analytics-${series}`} style={{ blockSize: `${count / peak * 112}px` }} />
          </div>)}
        </div>
        <strong aria-hidden="true">{row.label}</strong>
      </li>)}</ol>
    </div>
  </>;
}

function Activity({ report, annual, windowSize, onWindowSize, onOpen }) {
  const yearly = windowSize === "annual";
  const rows = yearly ? [...annual].reverse().map((row) => ({ ...row, label: row.year })) : report.totals.trend.map((row) => ({
    ...row, label: formatHearingDate(`${row.month}-01`, { month: "short", year: "2-digit" }),
  }));
  return <Panel id="activity" title="Filings & disposals over time" note={yearly
    ? "Calendar-year activity across filing years. Other filters still apply."
    : "Monthly activity within the selected case portfolio."}
    action={onWindowSize && <label className="analytics-inline-field">Trend window
      <select value={windowSize} onChange={(event) => onWindowSize(event.target.value === "annual" ? "annual" : Number(event.target.value))}>
        <option value={6}>6 months</option><option value={12}>12 months</option><option value="annual">Yearly</option>
      </select>
    </label>}>
    <Trend rows={rows} />
    {yearly && annual.length > 0 && <div className="analytics-primary-trend">
      <Table label="Annual filings and disposals" headers={["Year", "Filings", "Disposals"]}>
        <tbody>{annual.map((row) => <tr key={row.year}><th scope="row">{row.year}</th><td>{row.filings}</td><td>{row.disposals}</td></tr>)}</tbody>
      </Table>
    </div>}
    <div className="analytics-split analytics-activity-breakdowns">
      <div><h3>Case types</h3><Bars rows={report.caseTypes} onOpen={onOpen} /></div>
      <div><h3>Nature of disposal</h3><Bars rows={report.outcomes} onOpen={onOpen} empty="No disposed cases in this scope." /></div>
    </div>
  </Panel>;
}

function Advocates({ report, onOpen }) {
  const { diagnostic } = report;
  const old = new Set(diagnostic.old.map(({ item }) => item));
  const leading = [...diagnostic.advocates].filter((row) => row.old12)
    .sort((a, b) => b.old12 - a.old12).slice(0, 5)
    .map((row) => ({ label: row.label, cases: row.cases.filter((item) => old.has(item)), tone: "pending" }));
  return <Panel id="advocates" title="Advocate portfolios" note="Pending cases with usable filing dates, grouped by recorded petitioner advocate.">
    {leading.length > 0 && <><h3 className="analytics-subheading">Largest backlogs over 12 months</h3><Bars rows={leading} onOpen={onOpen} /></>}
    {diagnostic.advocates.length ? <Table label="Advocate portfolios" wide bounded
      headers={["Advocate", "Dated pending", "Share", "Avg. age", "Median age", "Over 12m", "Over 24m", "Most common stage"]}>
      <tbody>{diagnostic.advocates.map((row) => <tr key={row.label}>
        <th scope="row"><CaseAction as="span" className="analytics-table-link" cases={row.cases} onOpen={onOpen}>{row.label}</CaseAction></th>
        <td>{formatNumber(row.cases.length)}</td><td>{percent(percentage(row.cases.length, diagnostic.dated.length))}</td>
        <td>{daysLabel(row.averageAge)}</td><td>{daysLabel(row.medianAge)}</td>
        <td>{formatNumber(row.old12)}</td><td>{formatNumber(row.old24)}</td><td>{row.dominantStage}</td>
      </tr>)}</tbody>
    </Table> : <p className="analytics-empty">No dated pending cases are available for advocate comparison.</p>}
  </Panel>;
}

function Courts({ rows, sort, onSort, onOpen }) {
  const columns = [
    ["Court", "label"], ["Total", "total"], ["Pending", "pending"], ["Disposed", "disposed"],
    ["Disposal share", "disposalRate"], ["Avg. disposal time", "averageTat"], ["Most common pending stage", "commonPendingStage"],
  ];
  const headers = columns.map(([label, key]) => {
    const direction = sort?.key === key ? sort.direction : null;
    return { key, sort: direction ? direction === "asc" ? "ascending" : "descending" : undefined,
      content: onSort ? <button className="analytics-action analytics-sort" type="button" onClick={() => onSort(key)}>
        {label}{direction && <span aria-hidden="true"> {direction === "asc" ? "↑" : "↓"}</span>}
      </button> : label };
  });
  return <Panel id="courts" title="Court comparison" note="Case volume, disposal share and average filing to disposal by court.">
    {rows.length ? <Table label="Court portfolio comparison" wide headers={headers}>
      <tbody>{rows.map((row) => <tr key={row.label}>
        <th scope="row"><CaseAction as="span" className="analytics-table-link" cases={row.cases} onOpen={onOpen}>{row.label}</CaseAction></th>
        <td>{formatNumber(row.total)}</td><td>{formatNumber(row.pending)}</td><td>{formatNumber(row.disposed)}</td><td>{percent(row.disposalRate)}</td>
        <td>{daysLabel(row.averageTat)}{row.tatSamples > 0 && <small className="analytics-cell-note">{formatNumber(row.tatSamples)} cases</small>}</td>
        <td>{row.commonPendingStage}</td>
      </tr>)}</tbody>
    </Table> : <p className="analytics-empty">No courts in this scope.</p>}
  </Panel>;
}

function Financial({ pending, scenario, onChange }) {
  const { exposure, rate, years, useCaseCount } = scenario;
  const valid = useCaseCount && pending > 0 && [exposure, rate, years].every((value) => value !== "" && Number.isFinite(Number(value)))
    && Number(exposure) > 0 && Number(rate) >= 0 && Number(rate) <= 100 && Number(years) > 0;
  const principal = Number(exposure) * pending;
  const annualCost = principal * Number(rate) / 100;
  return <Panel id="financial" title="Financial impact scenario" note="Illustrative carrying cost based on the assumptions you enter.">
    {onChange && <>
      <div className="analytics-scenario-fields">
        <label>Assumed exposure per case (₹)<input type="number" min="0" value={exposure} placeholder="Enter an amount" onChange={(event) => onChange("exposure", event.target.value)} /></label>
        <label>Annual cost of capital (%)<input type="number" min="0" max="100" step="any" value={rate} onChange={(event) => onChange("rate", event.target.value)} /></label>
        <label>Duration (years)<input type="number" min="0" step="any" value={years} onChange={(event) => onChange("years", event.target.value)} /></label>
      </div>
      <label className="analytics-checkbox"><input type="checkbox" checked={useCaseCount} onChange={(event) => onChange("useCaseCount", event.target.checked)} />Use one account per pending case for this illustration</label>
    </>}
    {valid ? <>
      <QuickStats items={[["Illustrative exposure", `₹${formatNumber(principal)}`], ["Annual carrying cost", `₹${formatNumber(annualCost)}`], [`Cost over ${formatNumber(Number(years))} ${Number(years) === 1 ? "year" : "years"}`, `₹${formatNumber(annualCost * Number(years))}`]]} />
      <p className="analytics-muted">Assumptions: {formatNumber(pending)} cases at ₹{formatNumber(Number(exposure))} each, {formatNumber(Number(rate))}% annual cost of capital, {formatNumber(Number(years))} years.</p>
    </> : <p className="analytics-empty">{onChange ? "Enter your assumptions and confirm the case count proxy to calculate the scenario." : "No financial scenario was configured for this report."}</p>}
  </Panel>;
}

function Priority({ rows, search, controls, onOpen }) {
  const start = controls ? controls.page * controls.pageSize : 0;
  const visible = controls ? rows.slice(start, start + controls.pageSize) : rows;
  return <Panel id="priority" title="Priority cases" note="Pending cases over 365 days old or missing a usable filing date.">
    {controls && <div className="analytics-toolbar analytics-priority-tools">
      <label>Search priority cases<input type="search" value={search} placeholder="Case, party, stage or advocate" onChange={(event) => controls.onSearch(event.target.value)} /></label>
      <button type="button" className="analytics-button" disabled={!rows.length} onClick={controls.onExport}>Export {formatNumber(rows.length)} cases</button>
    </div>}
    {!controls && search && <p className="analytics-muted">Priority search: {search}</p>}
    {rows.length ? <Table label="Priority cases" wide headers={["Case number", "Respondent", "Filing date", "Pending age", "Current stage", "Advocate", "Reason flagged"]}>
      <tbody>{visible.map(({ item, days, reason }) => <tr key={item.cnr}>
        <th scope="row"><CaseAction as="span" className="analytics-table-link" cases={[item]} onOpen={onOpen}>{item.data?.case_reference || item.cnr}</CaseAction></th>
        <td>{(item.data?.respondents || []).join("; ") || "—"}</td>
        <td>{days == null ? "—" : item.data?.filing_date || "—"}</td><td>{daysLabel(days)}</td>
        <td>{caseStage(item)}</td><td>{caseAdvocate(item)}</td><td>{reason}</td>
      </tr>)}</tbody>
    </Table> : <p className="analytics-empty">No priority cases match this scope.</p>}
    {controls && rows.length > 0 && <div className="analytics-toolbar analytics-pagination">
      <span role="status">Showing {formatNumber(start + 1)}–{formatNumber(start + visible.length)} of {formatNumber(rows.length)}</span>
      {rows.length > controls.pageSize && <div className="analytics-actions">
        <button type="button" className="analytics-button" disabled={!start} onClick={() => controls.onPage(controls.page - 1)}>Previous</button>
        <button type="button" className="analytics-button" disabled={start + visible.length >= rows.length} onClick={() => controls.onPage(controls.page + 1)}>Next</button>
      </div>}
    </div>}
  </Panel>;
}

function Takeaways({ report, onOpen }) {
  const { diagnostic, pendingStages, undated } = report;
  const largest = pendingStages[0];
  const items = [
    ["Review cases over 12 months old", diagnostic.old.map(({ item }) => item), "Check the oldest files and agree the next review action."],
    [largest ? `Review the ${largest.label} backlog` : "Review stage concentration", largest?.cases || [], "Inspect the stage with the largest pending caseload."],
    ["Verify missing filing dates", undated, "Confirm the original filing dates so these cases can be included in age comparisons."],
  ].filter(([, cases]) => cases.length);
  return <Panel id="takeaways" title="Management takeaways">
    {items.length ? <div className="analytics-takeaways">{items.map(([title, cases, note]) => <CaseAction key={title}
      className="analytics-takeaway" cases={cases} onOpen={onOpen}>
      <strong>{title}</strong><span>{formatNumber(cases.length)} cases · {note}</span>
    </CaseAction>)}</div> : <p className="analytics-empty">No priority findings in the selected scope.</p>}
  </Panel>;
}

export function AnalyticsReportContent({ report, courtRows, annual, windowSize, priorityRows, prioritySearch,
  scenario, onOpen, onWindowSize, courtSort, onCourtSort, onScenarioChange, priorityControls }) {
  return <div className="analytics-content">
    <Summary report={report} onOpen={onOpen} />
    <Backlog report={report} onOpen={onOpen} />
    <Stages report={report} onOpen={onOpen} />
    <Age report={report} onOpen={onOpen} />
    <Turnaround report={report} />
    <Activity report={report} annual={annual} windowSize={windowSize} onWindowSize={onWindowSize} onOpen={onOpen} />
    <Advocates report={report} onOpen={onOpen} />
    <Courts rows={courtRows} sort={courtSort} onSort={onCourtSort} onOpen={onOpen} />
    <Financial pending={report.totals.pending} scenario={scenario} onChange={onScenarioChange} />
    <Priority rows={priorityRows} search={prioritySearch} controls={priorityControls} onOpen={onOpen} />
    <Takeaways report={report} onOpen={onOpen} />
  </div>;
}
