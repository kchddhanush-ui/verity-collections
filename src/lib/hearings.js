// Court hearing dates are calendar dates, not timestamps. Keep ISO day keys and
// use UTC only for arithmetic/formatting so the browser timezone cannot shift them.
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const pad = (n) => String(n).padStart(2, "0");
function checkedDay(year, month, day) {
  if (
    year < 1900 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  if (globalThis.Temporal?.PlainDate) {
    try {
      return Temporal.PlainDate.from(
        { year, month, day },
        { overflow: "reject" },
      ).toString();
    } catch {
      return null;
    }
  }
  // UTC numeric fields are the fallback for browsers without Temporal. Never parse
  // court strings with Date.parse or read them using the viewer's local timezone.
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
    ? `${year}-${pad(month)}-${pad(day)}`
    : null;
}
export function parseCourtDate(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return checkedDay(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return checkedDay(+m[3], +m[2], +m[1]);
  m = text.match(/^(\d{1,2})(?:st|nd|rd|th)?[ -]([a-z]+)[ ,\-]+(\d{4})$/i);
  if (!m) return null;
  const month = months.findIndex(
    (name) =>
      name === m[2].toLowerCase() || name.slice(0, 3) === m[2].toLowerCase(),
  );
  return month < 0 ? null : checkedDay(+m[3], month + 1, +m[1]);
}
export function indiaToday(now = new Date()) {
  if (globalThis.Temporal?.Instant)
    return Temporal.Instant.fromEpochMilliseconds(now.getTime())
      .toZonedDateTimeISO("Asia/Kolkata")
      .toPlainDate()
      .toString();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function utcDate(day) {
  const [year, month, number] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, number || 1));
}
export function formatHearingDate(
  day,
  options = { day: "numeric", month: "long", year: "numeric" },
) {
  return new Intl.DateTimeFormat("en-IN", {
    ...options,
    timeZone: "UTC",
  }).format(utcDate(day));
}
export function shiftMonth(month, delta) {
  if (globalThis.Temporal?.PlainYearMonth)
    return Temporal.PlainYearMonth.from(month)
      .add({ months: delta })
      .toString();
  const [year, number] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, number - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function monthWeeks(month) {
  const first = utcDate(month);
  const offset = (first.getUTCDay() + 6) % 7; // Monday first.
  const count = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells = Array.from(
    { length: Math.ceil((offset + count) / 7) * 7 },
    (_, i) => {
      const day = i - offset + 1;
      return day < 1 || day > count ? null : `${month}-${pad(day)}`;
    },
  );
  return Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
}
export function hearingEvents(cases) {
  const events = new Map();
  for (const item of cases) {
    if (!item.hasDetails) continue;
    const data = item.data || {};
    const next =
      String(data.case_status).toLowerCase() === "disposed"
        ? null
        : parseCourtDate(data.next_hearing_date);
    function add(day, source, purpose = "", judge = "") {
      if (!day) return;
      const key = `${item.cnr}:${day}`;
      const existing = events.get(key);
      if (existing) {
        existing.isNext ||= source === "next";
        if (purpose && !existing.purposes.includes(purpose))
          existing.purposes.push(purpose);
        if (!existing.judge && judge) existing.judge = judge;
      } else
        events.set(key, {
          key,
          day,
          item,
          isNext: source === "next",
          purposes: purpose ? [purpose] : [],
          judge,
        });
    }
    // Read Hearing Date (column 3), never Business on Date (column 2).
    for (const row of Array.isArray(data.history) ? data.history : []) {
      if (Array.isArray(row))
        add(
          parseCourtDate(row[2]),
          "history",
          typeof row[3] === "string" ? row[3].trim() : "",
          row[0],
        );
    }
    add(parseCourtDate(data.first_hearing_date), "first");
    add(next, "next");
  }
  return [...events.values()].sort(
    (a, b) =>
      a.day.localeCompare(b.day) || a.item.cnr.localeCompare(b.item.cnr),
  );
}
export function caseNumber(item) {
  if (item.data.case_reference) return item.data.case_reference;
  const number = item.data.registration_number;
  const type = item.data.case_type?.split(/\s+-\s+/)[0];
  return number ? `${type ? `${type}/` : ""}${number}` : item.cnr;
}

export function filterHearingEvents(events, query) {
  const term = query.trim().toLowerCase();
  if (!term) return events;
  return events.filter((e) =>
    JSON.stringify([
      e.item.cnr,
      caseNumber(e.item),
      e.item.data.court,
      e.item.data.petitioners,
      e.item.data.respondents,
      e.purposes,
    ])
      .toLowerCase()
      .includes(term),
  );
}
