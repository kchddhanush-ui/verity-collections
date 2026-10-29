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
  return stage && !["-", "—"].includes(stage)
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
function sortedCounts(map) {
  return [...map]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
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
      (!filters.court || courtName(item) === filters.court) &&
      (!filters.type || caseType(item) === filters.type) &&
      (!filters.status || caseStatus(item) === filters.status) &&
      (!filters.stage ||
        (item.hasDetails && caseStage(item) === filters.stage)) &&
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
  for (const item of pending) {
    const start = startDate(item, today);
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
  }
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
    age: [...age].map(([label, count]) => ({ label, count })),
    freshness: [...freshness].map(([label, count]) => ({ label, count })),
    trend,
    filingDates,
    decisionDates,
    datedDisposed: disposed.length - missingDecision.length,
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
