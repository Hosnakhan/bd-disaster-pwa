import { canonicalDistrict } from "./districts";

export const STATUS = Object.freeze({
  danger: { label: "Danger", color: "#ef4444", fill: "#ef4444" },
  warning: { label: "Warning", color: "#f97316", fill: "#f97316" },
  caution: { label: "Caution", color: "#eab308", fill: "#eab308" },
  safe: { label: "Safe", color: "#22c55e", fill: "#22c55e" },
  unknown: { label: "No verified status", color: "#64748b", fill: "#64748b" }
});

/** Canonical lower-case key so "Chapai Nawabganj", "Chapainawabganj" and "chapainawabganj " compare equal. */
export function normalizeDistrictName(value = "") {
  return (canonicalDistrict(value) ?? String(value).trim()).toLocaleLowerCase("en");
}

// GADM (the bundled GeoJSON) uses NAME_2 for districts; the other keys cover BAMIS/BBS style files.
// NAME_1 is deliberately NOT a fallback: in GADM it is the division, not the district.
const nameOf = (p = {}) => p.NAME_2 || p.ADM2_EN || p.adm2_en || p.district || p.DISTRICT || p.name || "";

// statusByDistrict is rebuilt only when new alert data arrives; index it once per object, not once per polygon.
const indexCache = new WeakMap();
function indexByCanonical(statusByDistrict) {
  if (!statusByDistrict || typeof statusByDistrict !== "object") return new Map();
  let idx = indexCache.get(statusByDistrict);
  if (!idx) {
    idx = new Map();
    for (const [key, entry] of Object.entries(statusByDistrict)) {
      const canon = canonicalDistrict(key);
      if (canon) idx.set(canon, entry);
    }
    indexCache.set(statusByDistrict, idx);
  }
  return idx;
}

/**
 * Resolve a GeoJSON feature's properties (or { name }) to the district's display name + verified status.
 * Matching goes through canonicalDistrict(), so spelling differences between the map file and the alert feed
 * never turn into a silent "unknown". Missing or unmatched districts stay "unknown", never green.
 */
export function statusForDistrict(properties, statusByDistrict) {
  const rawName = nameOf(properties);
  const canon = canonicalDistrict(rawName);
  const name = canon ?? rawName;
  const entry = canon ? indexByCanonical(statusByDistrict).get(canon) : undefined;
  const status = entry?.status && STATUS[entry.status] ? entry.status : "unknown";
  return {
    name, status, ...STATUS[status],
    message: entry?.message || "No verified district alert is available.",
    updatedAt: entry?.updatedAt || null, issuer: entry?.issuer || null,
    validUntil: entry?.validUntil || null, sourceUrl: entry?.sourceUrl || null, stale: entry?.stale === true
  };
}
