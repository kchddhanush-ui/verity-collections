import { indiaToday, parseCourtDate, shiftMonth } from "./hearings.js";

export const tidy = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
export const courtName = (item) =>
  tidy(item.data?.court).toUpperCase() || "Court not recorded";
export function caseType(item) {
  const type = tidy(item.data?.case_type).split(/\s+-\s+/)[0];
  const reference = tidy(item.data?.case_reference).match(
    /^(.+?)\/\d+\/\d{4}$/,
  )?.[1];
  return (type || reference || "Type not recorded").toUpperCase();
}
export function caseStatus(item) {
  if (!item.hasDetails) return "Listed only";
  const value = tidy(item.data?.case_status).toLowerCase();
  return value === "pending"
    ? "Pending"
    : value === "disposed"
      ? "Disposed"
      : "Status unknown";
}
export const caseStage = (item) => {
  const stage = tidy(item.data?.case_stage);
  // "-", "--", "---", "—" and similar placeholders mean "no stage recorded".
  return stage && !/^[-—–\s]+$/.test(stage)
    ? stage.toUpperCase()
    : "Stage not recorded";
};
export const percentage = (count, total) =>
  total ? Math.round((count / total) * 1000) / 10 : null;
const dayNumber = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export function addDays(day, amount) {
  return new Date((dayNumber(day) + amount) * 86400000)
    .toISOString()
    .slice(0, 10);
}
const pastDate = (value, today) => {
  const date = parseCourtDate(value);
  return date && date <= today ? date : null;
};
export const startDate = (item, today) =>
  pastDate(item.data?.filing_date, today) ||
  pastDate(item.data?.registration_date, today);
const closureDate = (item, today) =>
  pastDate(item.data?.disposal_date, today) ||
  pastDate(item.data?.decision_date, today);
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
function sortedCounts(map) {
  return [...map]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
export const filingYear = (item) => parseCourtDate(item.data?.filing_date)?.slice(0, 4);
export function analyticsOptions(cases) {
  return {
    courts: [...new Set(cases.map(courtName))].sort(),
    types: [...new Set(cases.map(caseType))].sort(),
    stages: [
      ...new Set(cases.filter((c) => c.hasDetails).map(caseStage)),
    ].sort(),
  };
}
export function filterCases(cases, filters = {}) {
  const search = tidy(filters.search).toLowerCase();
  return cases.filter(
    (item) =>
      (!filters.details || Boolean(item.hasDetails) === (filters.details === "available")) &&
      (!filters.year || filingYear(item) === filters.year) &&
      (!filters.court || courtName(item) === filters.court) &&
      (!filters.type || caseType(item) === filters.type) &&
      (!filters.status ||
        (filters.status === "Status unavailable"
          ? ["Status unknown", "Listed only"].includes(caseStatus(item))
          : caseStatus(item) === filters.status)) &&
      (!filters.stage ||
        (item.hasDetails && caseStage(item) === filters.stage)) &&
      (!filters.advocate || caseAdvocate(item) === filters.advocate) &&
      (!search ||
        JSON.stringify([item.cnr, item.data]).toLowerCase().includes(search)),
  );
}
export function buildAnalytics(
  cases,
  { today = indiaToday(), months = 6 } = {},
) {
  months = months === 12 ? 12 : 6;
  const details = cases.filter((item) => item.hasDetails);
  const pending = details.filter((item) => caseStatus(item) === "Pending");
  const disposed = details.filter((item) => caseStatus(item) === "Disposed");
  const known = pending.length + disposed.length;
  const status = ["Pending", "Disposed", "Status unknown", "Listed only"].map(
    (label) => ({
      label,
      count: cases.filter((item) => caseStatus(item) === label).length,
    }),
  );
  const stages = new Map(
    ["NBW", "SUMMONS", "EVIDENCES", "FOR STEPS"].map((stage) => [stage, 0]),
  );
  for (const item of details)
    stages.set(caseStage(item), (stages.get(caseStage(item)) || 0) + 1);
  const types = new Map(),
    disposalTypes = new Map(),
    courts = new Map(),
    judges = new Map();
  const nextDates = details
    .filter((item) => caseStatus(item) !== "Disposed")
    .map((item) => ({
      item,
      day: parseCourtDate(item.data?.next_hearing_date),
    }))
    .filter((e) => e.day);
  const upcoming = nextDates
    .filter((e) => e.day >= today && e.day <= addDays(today, 29))
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) || a.item.cnr.localeCompare(b.item.cnr),
    );
  const next7 = upcoming.filter((e) => e.day <= addDays(today, 6));
  const pastHearing = nextDates
    .filter((e) => e.day < today)
    .sort((a, b) => a.day.localeCompare(b.day));
  const noNext = pending.filter(
    (item) => !parseCourtDate(item.data?.next_hearing_date),
  );
  const missingDecision = disposed.filter(
    (item) => !pastDate(item.data?.decision_date, today),
  );
  const ageLabels = [
    "0–90 days",
    "91–180 days",
    "181–365 days",
    "1–2 years",
    "Over 2 years",
    "Date not recorded",
  ];
  const age = new Map(ageLabels.map((label) => [label, 0]));
  const ageCases = new Map(ageLabels.map((label) => [label, []]));
  const longPending = [];
  for (const item of pending) {
    // Case age is explicitly filing-date based. Registration dates are useful
    // elsewhere in the product, but are not a substitute for an unknown filing
    // date in this metric.
    const start = pastDate(item.data?.filing_date, today);
    const days = start ? dayNumber(today) - dayNumber(start) : null;
    const label =
      days === null
        ? ageLabels[5]
        : ageLabels[
            days <= 90
              ? 0
              : days <= 180
                ? 1
                : days <= 365
                  ? 2
                  : days <= 730
                    ? 3
                    : 4
          ];
    age.set(label, age.get(label) + 1);
    ageCases.get(label).push(item);
    // Keep the established review queue's registration-date fallback separate
    // from the filing-date-only age buckets shown above.
    const priorityStart = startDate(item, today);
    const priorityDays = priorityStart ? dayNumber(today) - dayNumber(priorityStart) : null;
    if (priorityDays !== null && priorityDays > 365)
      longPending.push({ item, day: priorityStart, days: priorityDays });
  }
  longPending.sort((a, b) => b.days - a.days || a.item.cnr.localeCompare(b.item.cnr));
  const freshness = new Map(
    [
      "Within 7 days",
      "7–29 days ago",
      "30+ days ago",
      "Check date unavailable",
    ].map((label) => [label, 0]),
  );
  const stale = [];
  for (const item of details) {
    const instant = Date.parse(item.last_checked_at || "");
    const checkDay = Number.isFinite(instant)
      ? indiaToday(new Date(instant))
      : null;
    const days =
      checkDay && checkDay <= today
        ? dayNumber(today) - dayNumber(checkDay)
        : null;
    const label =
      days === null
        ? "Check date unavailable"
        : days <= 6
          ? "Within 7 days"
          : days <= 29
            ? "7–29 days ago"
            : "30+ days ago";
    freshness.set(label, freshness.get(label) + 1);
    if (days !== null && days >= 30) stale.push({ item, days });
  }
  stale.sort((a, b) => b.days - a.days);
  for (const item of cases) {
    const type = caseType(item);
    types.set(type, (types.get(type) || 0) + 1);
    const court = courtName(item);
    if (!courts.has(court))
      courts.set(court, {
        label: court,
        total: 0,
        detailed: 0,
        pending: 0,
        disposed: 0,
        next7: 0,
      });
    const row = courts.get(court);
    row.total++;
    if (item.hasDetails) row.detailed++;
    if (caseStatus(item) === "Pending") row.pending++;
    if (caseStatus(item) === "Disposed") row.disposed++;
  }
  for (const event of next7) courts.get(courtName(event.item)).next7++;
  for (const item of details) {
    const label =
      tidy(item.data?.court_number_judge) || "Judge / courtroom not recorded";
    judges.set(label, (judges.get(label) || 0) + 1);
  }
  for (const item of disposed) {
    const label =
      tidy(item.data?.nature_of_disposal).toUpperCase() || "Not recorded";
    disposalTypes.set(label, (disposalTypes.get(label) || 0) + 1);
  }
  const trend = Array.from({ length: months }, (_, i) => ({
    month: shiftMonth(today.slice(0, 7), i - months + 1),
    filings: 0,
    decisions: 0,
    disposals: 0,
  }));
  const trendMap = new Map(trend.map((row) => [row.month, row]));
  let filingDates = 0,
    decisionDates = 0;
  for (const item of details) {
    const filing = pastDate(item.data?.filing_date, today);
    if (filing) {
      filingDates++;
      const month = trendMap.get(filing.slice(0, 7));
      if (month) month.filings++;
    }
    const decision = pastDate(item.data?.decision_date, today);
    if (decision) {
      decisionDates++;
      const month = trendMap.get(decision.slice(0, 7));
      if (month) month.decisions++;
    }
  }
  const durations = disposed
    .map((item) => {
      const start = startDate(item, today),
        decision = pastDate(item.data?.decision_date, today);
      return start && decision && decision >= start
        ? dayNumber(decision) - dayNumber(start)
        : null;
    })
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  const closedCases = disposed.map(item => ({ item, day: closureDate(item, today) }));
  for (const row of closedCases) {
    const month = row.day && trendMap.get(row.day.slice(0, 7));
    if (month) month.disposals++;
  }
  closedCases.sort((a, b) => (b.day || "").localeCompare(a.day || "") || a.item.cnr.localeCompare(b.item.cnr));
  const tatRecords = closedCases.flatMap(({ item, day: closed }) => {
    const filing = pastDate(item.data?.filing_date, today);
    return filing && closed && closed >= filing
      ? [{ item, filing, closed, days: dayNumber(closed) - dayNumber(filing) }]
      : [];
  });
  const tatDurations = tatRecords.map(row => row.days);
  const averageTat = tatDurations.length ? tatDurations.reduce((sum, days) => sum + days, 0) / tatDurations.length : null;
  const tatBands = [
    { label: "Within 90 days", max: 90 },
    { label: "91–180 days", max: 180 },
    { label: "181–365 days", max: 365 },
    { label: "1–2 years", max: 730 },
    { label: "Over 2 years", max: Infinity },
  ].map((band, i, bands) => {
    const bandCases = tatRecords
      .filter((row) => row.days <= band.max && (i === 0 || row.days > bands[i - 1].max))
      .map((row) => row.item);
    return { label: band.label, count: bandCases.length, cases: bandCases };
  });
  for (const court of courts.values()) {
    const samples = tatRecords.filter(row => courtName(row.item) === court.label);
    court.tatSamples = samples.length;
    court.averageTat = samples.length ? samples.reduce((sum, row) => sum + row.days, 0) / samples.length : null;
  }
  const middle = Math.floor(durations.length / 2);
  const medianDays = durations.length
    ? durations.length % 2
      ? durations[middle]
      : (durations[middle - 1] + durations[middle]) / 2
    : null;
  const hearingWeeks = Array.from({ length: 5 }, (_, i) => {
    const from = addDays(today, i * 7),
      through = addDays(today, Math.min(i * 7 + 6, 29));
    return {
      from,
      through,
      count: upcoming.filter((e) => e.day >= from && e.day <= through).length,
    };
  });
  return {
    total: cases.length,
    detailed: details.length,
    listed: cases.length - details.length,
    pending: pending.length,
    disposed: disposed.length,
    unknown: details.length - known,
    coverage: percentage(details.length, cases.length),
    disposalRate: percentage(disposed.length, known),
    known,
    status,
    stages: sortedCounts(stages),
    types: sortedCounts(types),
    judges: sortedCounts(judges),
    disposalTypes: sortedCounts(disposalTypes),
    courts: [...courts.values()].sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label),
    ),
    age: [...age].map(([label, count]) => ({ label, count, cases: ageCases.get(label) })),
    freshness: [...freshness].map(([label, count]) => ({ label, count })),
    trend,
    filingDates,
    decisionDates,
    datedDisposed: disposed.length - missingDecision.length,
    averageTat,
    medianTat: median(tatDurations),
    tatSamples: tatDurations.length,
    tatBands,
    closedCases,
    longPending,
    pendingNbw: pending.filter(item => caseStage(item) === "NBW"),
    pendingSummons: pending.filter(item => caseStage(item) === "SUMMONS"),
    medianDays,
    durationSamples: durations.length,
    upcoming,
    next7,
    pastHearing,
    noNext,
    missingDecision,
    stale,
    hearingWeeks,
    latestCheck:
      details
        .map((c) => c.last_checked_at)
        .filter((value) => Number.isFinite(Date.parse(value)))
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null,
  };
}

export function annualActivity(cases, today) {
  const years = new Map();
  function record(date, field) {
    if (!date) return;
    const year = date.slice(0, 4);
    const row = years.get(year) || { year, filings: 0, disposals: 0 };
    row[field]++;
    years.set(year, row);
  }
  for (const item of cases) {
    record(pastDate(item.data?.filing_date, today), "filings");
    if (caseStatus(item) === "Disposed") record(closureDate(item, today), "disposals");
  }
  return [...years.values()].sort((a, b) => b.year.localeCompare(a.year));
}

export function observedStageDurations(cases, today) {
  const totals = new Map();
  for (const item of cases) {
    if (!item.hasDetails || !Array.isArray(item.data?.history)) continue;
    const dates = new Map();
    for (const row of item.data.history) {
      if (!Array.isArray(row)) continue;
      const day = pastDate(row[1], today);
      const stage = caseStage({ data: { case_stage: row[3] } });
      if (!day) continue;
      dates.set(day, dates.has(day) && dates.get(day) !== stage ? null : stage);
    }
    const contributedStages = new Set();
    let start = null;
    let previous = null;
    for (const [day, stage] of [...dates].sort(([a], [b]) => a.localeCompare(b))) {
      if (!stage || stage === "Stage not recorded") {
        start = previous = null;
        continue;
      }
      if (stage === previous) continue;
      if (previous) {
        const total = totals.get(previous) || { days: 0, samples: 0, cases: 0 };
        total.days += dayNumber(day) - dayNumber(start);
        total.samples++;
        if (!contributedStages.has(previous)) {
          total.cases++;
          contributedStages.add(previous);
        }
        totals.set(previous, total);
      }
      start = day;
      previous = stage;
    }
  }
  return totals;
}

// A small, deliberately data-only layer for dashboard interactions. Keeping the
// case records with each row lets the UI open precisely the cases represented by
// a metric without reverse-engineering a label into an imprecise filter.
export function pendingStageRows(cases) {
  const rows = new Map();
  for (const item of cases) {
    if (caseStatus(item) !== "Pending") continue;
    const label = caseStage(item);
    const row = rows.get(label) || { label, count: 0, cases: [] };
    row.count++;
    row.cases.push(item);
    rows.set(label, row);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function courtPerformanceRows(cases, today = indiaToday()) {
  const groups = new Map();
  for (const item of cases) {
    const label = courtName(item);
    const row = groups.get(label) || {
      label, cases: [], total: 0, pending: 0, disposed: 0, tatDays: [], pendingStages: new Map(),
    };
    row.cases.push(item);
    row.total++;
    const status = caseStatus(item);
    if (status === "Pending") {
      row.pending++;
      const stage = caseStage(item);
      row.pendingStages.set(stage, (row.pendingStages.get(stage) || 0) + 1);
    }
    if (status === "Disposed") {
      row.disposed++;
      const filing = pastDate(item.data?.filing_date, today);
      const closed = closureDate(item, today);
      if (filing && closed && closed >= filing) row.tatDays.push(dayNumber(closed) - dayNumber(filing));
    }
    groups.set(label, row);
  }
  return [...groups.values()].map((row) => {
    const common = [...row.pendingStages].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return {
      ...row,
      disposalRate: percentage(row.disposed, row.pending + row.disposed),
      averageTat: row.tatDays.length ? row.tatDays.reduce((sum, value) => sum + value, 0) / row.tatDays.length : null,
      tatSamples: row.tatDays.length,
      commonPendingStage: common?.[0] || "—",
    };
  });
}

export function caseAdvocate(item) {
  const values = Array.isArray(item.data?.petitioners) ? item.data.petitioners : [];
  const names = values.flatMap((value) => String(value).split(/\bAdvocate\s*[-:]\s*/i).slice(1))
    .map((value) => tidy(value).replace(/^\d+\)\s*/, "")).filter(Boolean);
  return names.length ? names.join("; ") : "Advocate not recorded";
}

export function portfolioDiagnostic(cases, today = indiaToday(), reviewDays = 365) {
  const pending = cases.filter((item) => caseStatus(item) === "Pending");
  const dated = pending.flatMap((item) => {
    const filing = pastDate(item.data?.filing_date, today);
    return filing ? [{ item, days: dayNumber(today) - dayNumber(filing) }] : [];
  });
  const age = (items) => items.map(({ days }) => days);
  const averageAge = age(dated).length ? age(dated).reduce((sum, day) => sum + day, 0) / dated.length : null;
  const medianAge = median(age(dated));
  const old = dated.filter((row) => row.days > 365);
  const oldest = [...dated].sort((a, b) => b.days - a.days)[0] || null;
  const byAdvocate = new Map();
  for (const row of dated) {
    const label = caseAdvocate(row.item);
    const value = byAdvocate.get(label) || { label, cases: [], ages: [], old12: 0, old24: 0, stages: new Map() };
    value.cases.push(row.item); value.ages.push(row.days);
    if (row.days > 365) value.old12++;
    if (row.days > 730) value.old24++;
    const stage = caseStage(row.item); value.stages.set(stage, (value.stages.get(stage) || 0) + 1);
    byAdvocate.set(label, value);
  }
  const advocates = [...byAdvocate.values()].map((row) => {
    const dominant = [...row.stages].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { ...row, averageAge: row.ages.reduce((s, v) => s + v, 0) / row.ages.length, medianAge: median(row.ages), dominantStage: dominant?.[0] || "—", review: row.ages.filter((day) => day > reviewDays).length };
  }).sort((a, b) => b.cases.length - a.cases.length || a.label.localeCompare(b.label));
  const years = new Map();
  for (const item of cases) {
    const label = filingYear(item) || "Filing year unavailable";
    const row = years.get(label) || { label, cases: [], pending: [], disposed: [], types: new Map() };
    row.cases.push(item);
    if (caseStatus(item) === "Pending") {
      row.pending.push(item);
      const type = caseType(item); row.types.set(type, (row.types.get(type) || 0) + 1);
    }
    if (caseStatus(item) === "Disposed") row.disposed.push(item);
    years.set(label, row);
  }
  const yearRows = [...years.values()].sort((a, b) => b.label.localeCompare(a.label));
  return { pending, dated, averageAge, medianAge, old, oldest, advocates, yearRows, advocateCoverage: percentage(dated.filter((row) => caseAdvocate(row.item) !== "Advocate not recorded").length, dated.length) };
}

/* ------------------------------------------------------------------ *
 * Dashboard additions: scope filters, stage cards, activity chart,
 * NBW insight and advocate performance.
 * ------------------------------------------------------------------ */

export const NO_STAGE = "Stage not recorded";

const averageOf = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

// Years in which cases were filed, newest first (drives the Year filter).
export function filingYears(cases) {
  return [...new Set(cases.map(filingYear).filter(Boolean))].sort((a, b) => b.localeCompare(a));
}

// Court is a "contains" search so typing part of a court name works; year is exact.
export function scopeCases(cases, { court = "", year = "" } = {}) {
  const needle = tidy(court).toUpperCase();
  return cases.filter(
    (item) =>
      (!year || filingYear(item) === year) &&
      (!needle || courtName(item).includes(needle)),
  );
}

// Every advocate named against the petitioner. A case with two advocates is
// counted once under each of them.
export function caseAdvocates(item) {
  const values = Array.isArray(item.data?.petitioners) ? item.data.petitioners : [];
  const names = values
    .flatMap((value) => String(value).split(/\bAdvocate\s*[-:]\s*/i).slice(1))
    .map((value) => tidy(value).replace(/^\d+\)\s*/, "").replace(/[.,;]+$/, "").toUpperCase())
    .filter(Boolean);
  return names.length ? [...new Set(names)] : ["Advocate not recorded"];
}

// Pending cases per stage, with the share of all pending cases.
export function pendingStageCards(cases) {
  const rows = pendingStageRows(cases);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return {
    total,
    rows: rows.map((row) => ({ ...row, share: percentage(row.count, total) })),
  };
}

// NBW: how many pending cases sit there, plus evidence from the saved hearing
// history of disposed cases (how many passed through NBW before closing).
export function nbwInsight(cases) {
  const { total, rows } = pendingStageCards(cases);
  const nbw = rows.find((row) => row.label === "NBW");
  let sample = 0,
    throughNbw = 0;
  for (const item of cases) {
    if (caseStatus(item) !== "Disposed" || !Array.isArray(item.data?.history)) continue;
    const stages = item.data.history
      .filter(Array.isArray)
      .map((row) => caseStage({ data: { case_stage: row[3] } }))
      .filter((stage) => stage !== NO_STAGE);
    if (!stages.length) continue;
    sample++;
    if (stages.includes("NBW")) throughNbw++;
  }
  return {
    pendingTotal: total,
    count: nbw?.count || 0,
    share: nbw?.share ?? null,
    cases: nbw?.cases || [],
    sample,
    throughNbw,
    throughRate: percentage(throughNbw, sample),
  };
}

// Filings vs disposals. Yearly: one bar pair per year. Monthly: the 12 months
// of the selected year, or the last 12 months when no year is selected.
export function activitySeries(cases, { granularity = "year", year = "", today = indiaToday() } = {}) {
  const monthly = granularity === "month";
  const rows = new Map();
  const blank = (key, label) => ({ key, label, filings: 0, disposals: 0, filedCases: [], disposedCases: [] });
  const keyOf = (day) => (monthly ? day.slice(0, 7) : day.slice(0, 4));
  const monthName = (key) =>
    new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(`${key}-01T00:00:00`));
  if (monthly) {
    const months = year
      ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`)
      : Array.from({ length: 12 }, (_, i) => shiftMonth(today.slice(0, 7), i - 11));
    for (const key of months) rows.set(key, blank(key, year ? monthName(key) : `${monthName(key)} ${key.slice(2, 4)}`));
  }
  const events = [];
  for (const item of cases) {
    const filing = pastDate(item.data?.filing_date, today);
    if (filing) events.push({ item, day: filing, field: "filings" });
    if (caseStatus(item) === "Disposed") {
      const closed = closureDate(item, today);
      if (closed) events.push({ item, day: closed, field: "disposals" });
    }
  }
  if (!monthly && events.length) {
    const years = events.map((e) => Number(e.day.slice(0, 4)));
    for (let y = Math.min(...years); y <= Math.max(...years); y++) rows.set(String(y), blank(String(y), String(y)));
  }
  let shownFilings = 0,
    shownDisposals = 0,
    totalFilings = 0,
    totalDisposals = 0;
  for (const { item, day, field } of events) {
    field === "filings" ? totalFilings++ : totalDisposals++;
    const row = rows.get(keyOf(day));
    if (!row) continue;
    row[field]++;
    (field === "filings" ? row.filedCases : row.disposedCases).push(item);
    field === "filings" ? shownFilings++ : shownDisposals++;
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.key.localeCompare(b.key)),
    shownFilings,
    shownDisposals,
    totalFilings,
    totalDisposals,
  };
}

// Advocate-wise performance: how many cases each advocate holds, where they
// stand (disposed / pending by stage) and filing-to-disposal TAT.
export function advocatePerformance(cases, today = indiaToday()) {
  const groups = new Map();
  for (const item of cases) {
    if (!item.hasDetails) continue; // listed-only cases have no status yet
    const status = caseStatus(item);
    for (const label of caseAdvocates(item)) {
      const row =
        groups.get(label) ||
        { label, cases: [], pendingCases: [], disposedCases: [], stages: new Map(), tatDays: [] };
      row.cases.push(item);
      if (status === "Pending") {
        row.pendingCases.push(item);
        const stage = caseStage(item);
        row.stages.set(stage, [...(row.stages.get(stage) || []), item]);
      } else if (status === "Disposed") {
        row.disposedCases.push(item);
        const filing = pastDate(item.data?.filing_date, today);
        const closed = closureDate(item, today);
        if (filing && closed && closed >= filing) row.tatDays.push(dayNumber(closed) - dayNumber(filing));
      }
      groups.set(label, row);
    }
  }
  return [...groups.values()]
    .map((row) => ({
      label: row.label,
      total: row.cases.length,
      pending: row.pendingCases.length,
      disposed: row.disposedCases.length,
      cases: row.cases,
      pendingCases: row.pendingCases,
      disposedCases: row.disposedCases,
      stages: [...row.stages]
        .map(([label, items]) => ({ label, count: items.length, cases: items }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      disposalRate: percentage(row.disposedCases.length, row.cases.length),
      averageTat: averageOf(row.tatDays),
      medianTat: median(row.tatDays),
      tatSamples: row.tatDays.length,
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}
