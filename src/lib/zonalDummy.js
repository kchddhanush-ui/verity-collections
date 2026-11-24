// TEMPORARY DUMMY DATA for the Zonal actions tab.
//
// Builds made-up zone, postal status, tracking number and action rows from the
// workspace's saved cases so the zonal view has something to show. Nothing
// here is real or saved anywhere.
//
// To remove: set SHOW_DUMMY_ZONAL_DATA to false, or delete this file and its
// import in components/ZonalActions.jsx.
export const SHOW_DUMMY_ZONAL_DATA = true;

const ZONE_NAMES = ["North", "South", "East", "West"];
// Postal mix per zone, so the zones rate differently:
// [Delivered, In Transit, Returned, Article not booked]
const POSTAL_MIX = {
  North: [0.7, 0.2, 0.05, 0.05],
  South: [0.45, 0.2, 0.2, 0.15],
  East: [0.4, 0.25, 0.2, 0.15],
  West: [0.15, 0.1, 0.45, 0.3],
};
const POSTAL = ["Delivered", "In Transit", "Returned", "Article not booked"];
const PER_ZONE = { pending: 18, disposed: 6 };

// Stable pseudo-random number in [0, 1) from a string, so the dummy data
// does not change between visits.
function rand(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
const pick = (weights, r) => {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) { sum += weights[i]; if (r < sum) return i; }
  return weights.length - 1;
};

function entityName(item) {
  const raw = String(item.data?.respondents?.[0] || item.data?.respondent || "").replace(/^\d+\)\s*/, "");
  return raw.split(/\s*\d+\)\s*|,?\s+REP(?:RESENTED|T)?\.?\s+BY\b/i)[0].replace(/[,.\s]+$/, "").trim();
}
function legalStatus(stage) {
  const s = String(stage || "").trim();
  if (!s) return "Summons";
  if (/^nbw$/i.test(s)) return "NBW";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function action(legal, postal, disposed) {
  const doc = legal === "NBW" ? "NBW" : "Summons";
  if (disposed) return ["Closure", "Confirm recovery and close the case"];
  if (postal === "Returned") return ["Share the Customer Shop/Resi New Address", `Re-issuance of ${doc} with the New address`];
  if (postal === "Article not booked") return ["Delay in update", "To monitor the Postal tracking"];
  if (postal === "In Transit") return ["To track", `To track the delivery of ${doc}`];
  if (legal === "NBW") return ["Execution", "Coordinate with the Lawcovery team for execution"];
  if (legal === "Summons") return ["Ensure appearance", "Follow up with the customer to appear on the next hearing"];
  return ["Attend hearing", "Coordinate with the Lawcovery team for the next hearing"];
}

// Made-up number in the same shape as the sample (e.g. EK892045170IN).
function trackingNumber(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const digits = String((h >>> 0) % 1000000000).padStart(9, "0");
  return `${(h >>> 0) % 2 ? "EK" : "JK"}${digits}IN`;
}

export function dummyZonalRows(cases = []) {
  if (!SHOW_DUMMY_ZONAL_DATA) return [];
  const usable = cases
    .filter((item) => item.hasDetails && (item.data?.filing_number || item.data?.registration_number) && entityName(item))
    .map((item) => ({ item, r: rand(item.cnr || item.id || "") }))
    .sort((a, b) => a.r - b.r);
  const taken = Object.fromEntries(ZONE_NAMES.map((zone) => [zone, { pending: 0, disposed: 0 }]));
  const rows = [];
  for (const { item, r } of usable) {
    const zone = ZONE_NAMES[Math.floor(rand(`${item.cnr}:zone`) * ZONE_NAMES.length)];
    const disposed = item.data?.case_status === "Disposed";
    const bucket = disposed ? "disposed" : "pending";
    if (taken[zone][bucket] >= PER_ZONE[bucket]) continue;
    taken[zone][bucket]++;
    const legal = disposed ? "Disposed" : legalStatus(item.data?.case_stage);
    const postal = disposed ? "Delivered" : POSTAL[pick(POSTAL_MIX[zone], rand(`${item.cnr}:post`))];
    const [act, next] = action(legal, postal, disposed);
    rows.push({
      dummy: true,
      zone,
      filingNumber: item.data?.filing_number || item.data?.registration_number,
      entity: entityName(item),
      legalStatus: legal,
      caseStatus: disposed ? "Disposed" : "Pending",
      trackingNumber: postal === "Article not booked" ? "-" : trackingNumber(item.cnr || ""),
      postalStatus: postal === "Article not booked" ? "Article not booked" : postal,
      action: act,
      nextStep: next,
    });
  }
  return rows;
}
