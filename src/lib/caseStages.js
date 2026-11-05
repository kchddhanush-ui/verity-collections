import { parseCourtDate } from "./hearings.js";

const stageText = (value) => typeof value === "string" && !["-", "—"].includes(value.trim()) ? value.trim() : "";

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
