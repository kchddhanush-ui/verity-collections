import { parseCourtDate } from "./hearings.js";

const stageText = (value) => typeof value === "string" && !["-", "—"].includes(value.trim()) ? value.trim() : "";

const captureDateLabel = (value) => {
  const instant = Date.parse(value || "");
  if (!Number.isFinite(instant)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(instant));
};

// Keep a missing court Decision Date visibly distinct from a date the
// workspace recorded while capturing the latest status.
export function decisionOrLatestStatusDate(item = {}) {
  const decision = stageText(item.data?.decision_date);
  if (decision) return { value: decision, source: "decision" };
  const captured = captureDateLabel(
    item.latest_capture_at || item.last_checked_at || item.last_listed_at,
  );
  return captured
    ? { value: captured, source: "latest-status" }
    : { value: "—", source: "unavailable" };
}

function recordedStages(data) {
  return (Array.isArray(data.history) ? data.history : []).filter(Array.isArray)
    .map((row) => ({ day: parseCourtDate(row[1]), stage: stageText(row[3]) }))
    .filter((row) => row.day && row.stage)
    .sort((a, b) => b.day.localeCompare(a.day));
}

export function currentRecordedStage(data = {}) {
  const explicit = stageText(data.case_stage);
  if (explicit) return explicit;
  // Closed cases must not appear to still be at an earlier hearing stage.
  if (stageText(data.case_status).toLowerCase() === "disposed") return "Disposed";
  return recordedStages(data)[0]?.stage || "—";
}

export function previousRecordedStage(data = {}) {
  const current = currentRecordedStage(data).toUpperCase();
  if (current === "—") return "—";
  return recordedStages(data).find((row) => row.stage.toUpperCase() !== current)?.stage || "—";
}
