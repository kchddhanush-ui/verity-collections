import React, { useMemo, useRef, useState } from "react";
import {
  caseNumber,
  filterHearingEvents,
  formatHearingDate,
  hearingEvents,
  indiaToday,
  monthWeeks,
  shiftMonth,
} from "../lib/hearings";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX_IN_CELL = 3;

// "1) M/S NINJACART SERVICES PVT LTD Advocate- SUNIL G ADAGAL" ->
// { name: "M/S NINJACART SERVICES PVT LTD", advocate: "SUNIL G ADAGAL" }
export function splitParty(value) {
  const text = String(value || "").replace(/^\s*\d+\)\s*/, "").trim();
  const [name, advocate] = text.split(/\s*\bAdvocate\s*[-:]\s*/i);
  return { name: (name || "").replace(/[,\s]+$/, ""), advocate: (advocate || "").trim() };
}
const partyNames = (list) =>
  (Array.isArray(list) ? list : []).map((value) => splitParty(value).name).filter(Boolean).join("; ");
const advocates = (list) =>
  [...new Set((Array.isArray(list) ? list : []).map((value) => splitParty(value).advocate).filter(Boolean))].join("; ");

export function HearingCalendar({ cases, onOpenCase, today = indiaToday() }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const agendaHeading = useRef(null);
  const [query, setQuery] = useState("");
  const events = useMemo(() => hearingEvents(cases), [cases]);
  const visible = useMemo(() => filterHearingEvents(events, query), [events, query]);
  const byDay = new Map();
  for (const event of visible) {
    if (!byDay.has(event.day)) byDay.set(event.day, []);
    byDay.get(event.day).push(event);
  }
  const monthEvents = visible.filter((e) => e.day.startsWith(month));
  const monthCases = new Set(monthEvents.map((e) => e.item.cnr)).size;
  const dayEvents = byDay.get(selectedDay) || [];
  const next = visible.find((e) => e.isNext && e.day >= today);
  const datedCases = new Set(events.map((e) => e.item.cnr));
  const withoutDate = cases.filter((c) => !datedCases.has(c.cnr)).length;

  function changeMonth(value) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || +value.slice(0, 4) < 1900 || +value.slice(0, 4) > 9999) return;
    setMonth(value);
    setSelectedDay(`${value}-01`);
  }
  function jump(day) {
    setMonth(day.slice(0, 7));
    setSelectedDay(day);
  }
  function showDay(day) {
    setSelectedDay(day);
    const heading = agendaHeading.current;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "nearest" });
  }
  const title = formatHearingDate(`${month}-01`, { month: "long", year: "numeric" });
  const plural = (n, word) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Court hearings</span>
          <h1>{formatHearingDate(`${month}-01`, { month: "long" })} at a glance.</h1>
          <p>Plan around upcoming hearings across your loaded case portfolio.</p>
        </div>
      </div>

      <section className="console-panel card hc-panel" aria-labelledby="hearing-calendar-title">
        <header className="hc-head">
          <div className="hc-title">
            <p className="console-eyebrow">COURT CALENDAR</p>
            <h2 id="hearing-calendar-title">Hearing schedule</h2>
            <p className="hc-stats" role="status">
              <span><b>{plural(monthEvents.length, "hearing")}</b> in {title}</span>
              <span><b>{plural(monthCases, "case")}</b></span>
              {query && <span className="hc-filtered">Search applied</span>}
            </p>
          </div>
          <label className="hc-search">
            <span className="visually-hidden">Search calendar</span>
            <svg className="hc-search-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search case, CNR, party or court"
            />
          </label>
        </header>

        <div className="hc-toolbar">
          <div className="hearing-month-nav hc-month-nav">
            <button
              type="button"
              className="hc-icon-btn"
              aria-label="Previous month"
              disabled={month === "1900-01"}
              onClick={() => changeMonth(shiftMonth(month, -1))}
            >
              ‹
            </button>
            <h3 aria-live="polite">{title}</h3>
            <button
              type="button"
              className="hc-icon-btn"
              aria-label="Next month"
              disabled={month === "9999-12"}
              onClick={() => changeMonth(shiftMonth(month, 1))}
            >
              ›
            </button>
          </div>
          <div className="hc-actions">
            <label className="hc-month-input">
              <span className="visually-hidden">Go to month</span>
              <input type="month" min="1900-01" max="9999-12" value={month} onChange={(e) => changeMonth(e.target.value)} />
            </label>
            <button type="button" className="hc-btn" onClick={() => jump(today)}>Today</button>
            <button type="button" className="hc-btn hc-btn-primary" disabled={!next} onClick={() => next && jump(next.day)}>
              Next scheduled hearing
            </button>
          </div>
        </div>

        <ul className="hc-legend" aria-label="Legend">
          <li><i className="hc-swatch is-next" />Next hearing</li>
          <li><i className="hc-swatch" />Recorded date</li>
          <li className="hc-legend-note" title="“Next hearing” is the current next date saved for a case. “Recorded date” comes from its first hearing or hearing history and does not confirm a hearing took place. Dates follow the Indian court calendar.">
            Recorded dates are from hearing history, not confirmed sittings.
          </li>
        </ul>

        <div className="hc-layout">
          <div className="hc-grid-wrap" tabIndex="0" role="region" aria-label="Monthly hearing calendar">
            <table className="hc-grid">
              <caption className="visually-hidden">{title} hearing dates</caption>
              <thead>
                <tr>
                  {WEEKDAYS.map((day) => (
                    <th scope="col" key={day}>
                      <abbr title={day}>{day.slice(0, 3)}</abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthWeeks(month).map((week, i) => (
                  <tr key={i}>
                    {week.map((day, j) => {
                      if (!day) return <td className="hc-cell is-blank" key={j} />;
                      const entries = byDay.get(day) || [];
                      const classes = [
                        "hc-cell",
                        day === selectedDay ? "is-selected" : "",
                        day === today ? "is-today" : "",
                        j >= 5 ? "is-weekend" : "",
                        entries.length ? "has-entries" : "",
                      ].join(" ").trim();
                      return (
                        <td key={day} className={classes}>
                          <button
                            type="button"
                            className="hc-day"
                            aria-pressed={day === selectedDay}
                            aria-current={day === today ? "date" : undefined}
                            aria-label={`${formatHearingDate(day)}, ${entries.length} case hearings`}
                            onClick={() => showDay(day)}
                          >
                            <span className="hc-day-number">{Number(day.slice(-2))}</span>
                            {day === today && <span className="hc-today-tag">Today</span>}
                          </button>
                          {entries.length > 0 && (
                            <button
                              type="button"
                              className="hc-mobile-count"
                              aria-label={`Show ${entries.length} cases on ${formatHearingDate(day)}`}
                              onClick={() => showDay(day)}
                            >
                              {entries.length}
                            </button>
                          )}
                          <ul className="hearing-day-cases hc-chips">
                            {entries.slice(0, MAX_IN_CELL).map((event) => (
                              <li key={event.key}>
                                <button
                                  type="button"
                                  className={`hc-chip ${event.isNext ? "is-next" : ""}`}
                                  onClick={() => onOpenCase(event.item)}
                                  title={`${caseNumber(event.item)} · ${event.item.cnr} · ${event.isNext ? "Next hearing" : "Recorded date"}`}
                                >
                                  <span>{caseNumber(event.item)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                          {entries.length > MAX_IN_CELL && (
                            <button type="button" className="hc-more" onClick={() => showDay(day)}>
                              +{entries.length - MAX_IN_CELL} more · show all
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="hearing-agenda hc-agenda" aria-labelledby="hearing-day-title">
            <div className="hc-agenda-head">
              <p className="console-eyebrow">SELECTED DAY</p>
              <h3 id="hearing-day-title" ref={agendaHeading} tabIndex={-1}>
                {formatHearingDate(selectedDay)}
              </h3>
              <p role="status" className="hc-agenda-count">{plural(dayEvents.length, "case")}</p>
            </div>
            {!dayEvents.length && (
              <p className="hc-empty">
                No saved hearing dates for this day{query ? " match your search" : ""}.
              </p>
            )}
            <ul className="hc-agenda-list">
              {dayEvents.map((event) => {
                const purpose =
                  event.purposes.join(" · ") || (event.isNext ? event.item.data.case_stage : "") || "Not recorded";
                const court = event.judge || event.item.data.court_number_judge || event.item.data.court || "Not recorded";
                const advocate = advocates(event.item.data.petitioners);
                return (
                  <li key={event.key} className="hc-agenda-item">
                    <div className="hc-agenda-top">
                      <button type="button" className="case-open hc-case-link" onClick={() => onOpenCase(event.item)}>
                        {caseNumber(event.item)}
                      </button>
                      <span className={`hc-badge ${event.isNext ? "is-next" : ""}`}>
                        {event.isNext ? "Next hearing" : "Recorded date"}
                      </span>
                    </div>
                    <small className="hc-cnr">{event.item.cnr}</small>
                    <p className="hc-parties">
                      <span>{partyNames(event.item.data.petitioners) || "Petitioner not recorded"}</span>
                      <em>vs</em>
                      <span>{partyNames(event.item.data.respondents) || "Respondent not recorded"}</span>
                    </p>
                    <dl className="hc-meta">
                      <div><dt>Purpose</dt><dd>{purpose}</dd></div>
                      <div><dt>Court</dt><dd>{court}</dd></div>
                      {advocate && <div><dt>Advocate</dt><dd>{advocate}</dd></div>}
                    </dl>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {!monthEvents.length && (
          <p className="hc-notice">
            No saved hearings in {title}{query ? " match your search" : ""}. Try another month or use Next scheduled hearing.
          </p>
        )}
        <p className="hc-footnote">
          Uses the same loaded portfolio as Cases. {plural(withoutDate, "case")} {withoutDate === 1 ? "has" : "have"} no
          saved hearing date yet; listed-only cases need a detailed capture first.
        </p>
      </section>
    </>
  );
}
