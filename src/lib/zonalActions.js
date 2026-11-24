// Zone-wise action list for zonal officers.
//
// To add or update cases, add rows here (one object per case). A new `zone`
// value automatically appears as its own zone tab. Use "-" or "" when a
// value is not available yet.
export const ZONAL_ACTIONS = [
  {
    zone: "South", filingNumber: "44777/2025", entity: "MK MARKETING", legalStatus: "Summons",
    trackingNumber: "EK892045170IN", postalStatus: "Returned",
    action: "Share the Customer Shop/Resi New Address", nextStep: "Re-issuance of Summons with the New address",
  },
  {
    zone: "South", filingNumber: "46004/2025", entity: "VARAM TRADERS", legalStatus: "NBW",
    trackingNumber: "EK900498378IN", postalStatus: "Delivered",
    action: "Execution", nextStep: "Coordinate with the Lawcovery team for execution",
  },
  {
    zone: "South", filingNumber: "26072/2025", entity: "Sangeetha Vegetables", legalStatus: "Convicted",
    trackingNumber: "-", postalStatus: "-",
    action: "Arrest", nextStep: "Coordinate with the Lawcovery team for Arrest",
  },
  {
    zone: "South", filingNumber: "47062/2026", entity: "Sri balaji traders", legalStatus: "Summons",
    trackingNumber: "JK075615436IN", postalStatus: "In Transit",
    action: "To track", nextStep: "To track the delivery of Summons",
  },
  {
    zone: "South", filingNumber: "23102/2025", entity: "F L K COCONUT KINGS", legalStatus: "NBW",
    trackingNumber: "JK075615762IN", postalStatus: "Article not booked",
    action: "Delay in update", nextStep: "To monitor the Postal tracking",
  },
];

const blank = (value) => !value || /^[\s\-–—]*$/.test(String(value));
export const clean = (value) => (blank(value) ? "" : String(value).trim());

// Postal status → tone used for its badge.
export function postalTone(status) {
  const s = clean(status).toLowerCase();
  if (!s) return "none";
  if (/deliver/.test(s)) return "good";
  if (/return|undeliver|refus/.test(s)) return "bad";
  if (/not booked|delay|pending/.test(s)) return "warn";
  return "info"; // in transit, booked, dispatched…
}


// Pending or Disposed. A case counts as Disposed only when its row says so
// (caseStatus: "Disposed"); otherwise it is Pending at its legal status
// (Summons, NBW, Convicted…).
export function caseStatusOf(row) {
  return /dispos|closed/i.test(clean(row.caseStatus)) ? "Disposed" : "Pending";
}

// How urgently a case needs action, so each zone's list shows the cases that
// need the most action first:
//   returned post (new address needed) → not booked → warrant/arrest to
//   execute → in transit → delivered and waiting on court → disposed.
export function actionPriority(row) {
  if (caseStatusOf(row) === "Disposed") return { score: 0, level: "disposed", label: "Disposed" };
  const tone = postalTone(row.postalStatus);
  const legal = clean(row.legalStatus);
  let score = tone === "bad" ? 100 : tone === "warn" ? 80 : /nbw|convict/i.test(legal) ? 70 : tone === "info" ? 40 : 30;
  if (/nbw|convict/i.test(legal) && score < 100) score += 5;
  return score >= 75
    ? { score, level: "high", label: "High priority" }
    : score >= 40
      ? { score, level: "medium", label: "Medium priority" }
      : { score, level: "low", label: "Low priority" };
}

// Zones always offered, even before their cases are added. Any other zone
// found in the rows is added after these.
export const ZONES = ["North", "South", "East", "West"];
export const zonesOf = (rows) => [
  ...ZONES,
  ...[...new Set(rows.map((row) => clean(row.zone)).filter(Boolean))].filter((zone) => !ZONES.includes(zone)).sort(),
];

const needsFollowUp = (row) => ["bad", "warn"].includes(postalTone(row.postalStatus));

// One row per zone for the comparison panel. Rated on the share of cases whose
// postal delivery failed or has not started (returned / not booked): under 20%
// performing well, 20–40% watch, 40% or more needs more action.
export function zonePerformance(rows, zones = zonesOf(rows)) {
  return zones.map((zone) => {
    const list = rows.filter((row) => clean(row.zone) === zone);
    const cases = list.length;
    const followUp = list.filter(needsFollowUp).length;
    const share = cases ? Math.round((followUp / cases) * 1000) / 10 : null;
    return {
      zone, cases, followUp, share,
      pending: list.filter((row) => caseStatusOf(row) === "Pending").length,
      disposed: list.filter((row) => caseStatusOf(row) === "Disposed").length,
      nbw: list.filter((row) => /nbw/i.test(clean(row.legalStatus))).length,
      rating: !cases ? "none" : share >= 40 ? "action" : share >= 20 ? "watch" : "good",
    };
  });
}
