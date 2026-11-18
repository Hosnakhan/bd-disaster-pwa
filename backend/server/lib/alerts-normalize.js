import { canonicalDistrict } from "./districts.js";

// Source severity words -> the PWA's status keys (Red/Orange/Yellow/Green).
const LEVELS = {
  red: "danger", danger: "danger", severe: "danger", extreme: "danger",
  orange: "warning", warning: "warning", high: "warning",
  yellow: "caution", caution: "caution", watch: "caution", moderate: "caution",
  green: "safe", safe: "safe", normal: "safe", low: "safe"
};
const RANK = { danger: 3, warning: 2, caution: 1, safe: 0 };
const TZ = /(Z|[+-]\d{2}:?\d{2})$/i;
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function parseDate(v) {
  if (typeof v !== "string" || !TZ.test(v.trim())) return null; // demand an explicit offset (e.g. +06:00)
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Convert a raw alert feed into { statuses, rejected, total }.
 * ADAPT HERE: this is the only place that knows the upstream feed's shape.
 */
export function normalizeRawAlerts(raw, { now = Date.now() } = {}) {
  const items = Array.isArray(raw) ? raw : Array.isArray(raw?.alerts) ? raw.alerts : null;
  if (!items) throw new Error("feed is not an array or { alerts: [] }");
  const topIssuer = raw?.issuer;
  const best = new Map();
  const rejected = [];

  items.forEach((it, index) => {
    const bad = (reason) => rejected.push({ index, district: clean(it?.district, 40), reason });
    const district = canonicalDistrict(it?.district ?? it?.district_name ?? it?.name);
    if (!district) return bad("unknown-district");
    const status = LEVELS[String(it?.level ?? it?.status ?? it?.severity ?? it?.color ?? "").toLowerCase()];
    if (!status) return bad("unknown-level");
    const issuedAt = parseDate(it?.issuedAt ?? it?.issued_at ?? it?.updatedAt ?? it?.timestamp);
    if (issuedAt === null) return bad("bad-issued-at");
    if (issuedAt > now + 10 * 60_000) return bad("issued-in-future");
    const rawUntil = it?.validUntil ?? it?.valid_until ?? it?.expires;
    const validUntil = rawUntil == null ? null : parseDate(rawUntil);
    if (rawUntil != null && validUntil === null) return bad("bad-valid-until");
    if (validUntil !== null && validUntil <= now) return bad("expired");
    const url = it?.url ?? it?.sourceUrl;
    const sourceUrl = typeof url === "string" && /^https:\/\//i.test(url) ? url.slice(0, 500) : null;

    const entry = {
      status,
      message: clean(it?.message ?? it?.headline ?? it?.title, 300) || "No details provided by issuer.",
      issuer: clean(it?.issuer ?? it?.source ?? topIssuer, 80) || null,
      updatedAt: new Date(issuedAt).toISOString(),
      validUntil: validUntil === null ? null : new Date(validUntil).toISOString(),
      sourceUrl
    };
    const cur = best.get(district);
    if (!cur || RANK[status] > RANK[cur.status] || (RANK[status] === RANK[cur.status] && entry.updatedAt > cur.updatedAt)) {
      best.set(district, entry);
    }
  });

  return { statuses: Object.fromEntries(best), rejected, total: items.length };
}
