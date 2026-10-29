import React, { useMemo, useState } from "react";
import {
  caseNumber,
  filterHearingEvents,
  formatHearingDate,
  hearingEvents,
  indiaToday,
  monthWeeks,
  shiftMonth,
} from "../lib/hearings";

export function HearingCalendar({ cases, onOpenCase, today = indiaToday() }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [query, setQuery] = useState("");
  const events = useMemo(() => hearingEvents(cases), [cases]);
  const visible = useMemo(
    () => filterHearingEvents(events, query),
    [events, query],
  );
  const byDay = new Map();
  for (const event of visible) {
    if (!byDay.has(event.day)) byDay.set(event.day, []);
    byDay.get(event.day).push(event);
  }
  const monthEvents = visible.filter((e) => e.day.startsWith(month));
  const dayEvents = byDay.get(selectedDay) || [];
  const next = visible.find((e) => e.isNext && e.day >= today);
  const datedCases = new Set(events.map((e) => e.item.cnr));
  const withoutDate = cases.filter((c) => !datedCases.has(c.cnr)).length;
  function changeMonth(value) {
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
      +value.slice(0, 4) < 1900 ||
      +value.slice(0, 4) > 9999
    )
      return;
    setMonth(value);
    setSelectedDay(`${value}-01`);
  }
  function jump(day) {
    setMonth(day.slice(0, 7));
    setSelectedDay(day);
  }
  const title = formatHearingDate(`${month}-01`, {
    month: "long",
    year: "numeric",
  });
  return (
    <section
      className="console-panel hearing-calendar"
      aria-labelledby="hearing-calendar-title"
    >
      <div className="section-heading">
        <div>
          <p className="console-eyebrow">COURT DIARY</p>
          <h2 id="hearing-calendar-title">Hearing calendar</h2>
          <p>
            Case numbers on their recorded hearing dates. Select a day to see
            all its cases.
          </p>
        </div>
        <label>
          Search calendar
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Case, CNR, party or court"
          />
        </label>
      </div>
      <div className="hearing-toolbar">
        <div className="hearing-month-nav">
          <button
            aria-label="Previous month"
            disabled={month === "1900-01"}
            onClick={() => changeMonth(shiftMonth(month, -1))}
          >
            ←
          </button>
          <h3 aria-live="polite">{title}</h3>
          <button
            aria-label="Next month"
            disabled={month === "9999-12"}
            onClick={() => changeMonth(shiftMonth(month, 1))}
          >
            →
          </button>
        </div>
        <label>
          Go to month
          <input
            type="month"
            min="1900-01"
            max="9999-12"
            value={month}
            onChange={(e) => changeMonth(e.target.value)}
          />
        </label>
        <button onClick={() => jump(today)}>Today</button>
        <button disabled={!next} onClick={() => next && jump(next.day)}>
          Next scheduled hearing
        </button>
      </div>
      <p className="hearing-summary" role="status">
        {monthEvents.length} case hearings ·{" "}
        {new Set(monthEvents.map((e) => e.item.cnr)).size} cases in {title}
        {query ? " · search applied" : ""}
      </p>
      <p className="muted">
        “Next hearing” marks the current next date saved for a case. “Recorded
        date” comes from its first hearing or hearing history and does not
        confirm that a hearing took place. Dates follow the Indian court
        calendar.
      </p>
      <div className="hearing-layout">
        <div
          className="hearing-month-scroll"
          tabIndex="0"
          role="region"
          aria-label="Monthly hearing calendar"
        >
          <table className="hearing-month">
            <caption className="visually-hidden">{title} hearing dates</caption>
            <thead>
              <tr>
                {[
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ].map((day) => (
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
                    if (!day) return <td className="hearing-blank" key={j} />;
                    const entries = byDay.get(day) || [];
                    return (
                      <td
                        key={day}
                        className={`${day === selectedDay ? "hearing-selected" : ""} ${day === today ? "hearing-today" : ""}`}
                      >
                        <button
                          className="hearing-day"
                          aria-pressed={day === selectedDay}
                          aria-current={day === today ? "date" : undefined}
                          aria-label={`${formatHearingDate(day)}, ${entries.length} case hearings`}
                          onClick={() => setSelectedDay(day)}
                        >
                          {Number(day.slice(-2))}
                          {day === today && <span>Today</span>}
                        </button>
                        {entries.length > 0 && (
                          <button
                            className="hearing-mobile-count"
                            aria-label={`Show ${entries.length} cases on ${formatHearingDate(day)}`}
                            onClick={() => setSelectedDay(day)}
                          >
                            {entries.length} case
                            {entries.length === 1 ? "" : "s"}
                          </button>
                        )}
                        <ul className="hearing-day-cases">
                          {entries.slice(0, 3).map((event) => (
                            <li key={event.key}>
                              <button
                                className={`hearing-case ${event.isNext ? "hearing-next" : ""}`}
                                onClick={() => onOpenCase(event.item)}
                                title={`${caseNumber(event.item)} · ${event.item.cnr} · ${event.isNext ? "Next hearing" : "Recorded date"}`}
                              >
                                <strong>{caseNumber(event.item)}</strong>
                                <span>
                                  {event.isNext
                                    ? "Next hearing"
                                    : "Recorded date"}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {entries.length > 3 && (
                          <button
                            className="hearing-more"
                            onClick={() => setSelectedDay(day)}
                          >
                            +{entries.length - 3} more · show all
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
        <section className="hearing-agenda" aria-labelledby="hearing-day-title">
          <p className="console-eyebrow">SELECTED DAY</p>
          <h3 id="hearing-day-title">{formatHearingDate(selectedDay)}</h3>
          <p role="status">
            {dayEvents.length} case{dayEvents.length === 1 ? "" : "s"}
          </p>
          {!dayEvents.length && (
            <p className="muted">
              No saved hearing dates for this day
              {query ? " match your search" : ""}.
            </p>
          )}
          <ul>
            {dayEvents.map((event) => (
              <li key={event.key}>
                <span
                  className={`hearing-badge ${event.isNext ? "hearing-next" : ""}`}
                >
                  {event.isNext ? "Next hearing" : "Recorded date"}
                </span>
                <button
                  className="case-open"
                  onClick={() => onOpenCase(event.item)}
                >
                  {caseNumber(event.item)}
                  <small>{event.item.cnr}</small>
                </button>
                <p>
                  {(event.item.data.petitioners || []).join("; ") ||
                    "Petitioner not recorded"}
                  <br />
                  versus{" "}
                  {(event.item.data.respondents || []).join("; ") ||
                    "Respondent not recorded"}
                </p>
                <p>
                  <strong>Purpose:</strong>{" "}
                  {event.purposes.join(" · ") ||
                    (event.isNext ? event.item.data.case_stage : "") ||
                    "Not recorded"}
                </p>
                <p className="muted">
                  {event.judge ||
                    event.item.data.court_number_judge ||
                    event.item.data.court}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {!monthEvents.length && (
        <p className="listing-notice">
          No saved hearings in this month{query ? " match your search" : ""}.
          Try another month or use Next scheduled hearing.
        </p>
      )}
      <p className="muted">
        Uses the same loaded workspace portfolio as Cases. {withoutDate} case
        {withoutDate === 1 ? " has" : "s have"} no recognised saved hearing
        date. The calendar updates when details are saved; listed-only cases
        need detailed capture first.
      </p>
    </section>
  );
}
