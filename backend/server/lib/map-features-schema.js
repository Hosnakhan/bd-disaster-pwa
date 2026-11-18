// Shared by the Express API (strict validation) and the PWA (lenient parsing). No dependencies.
export const FACILITIES = ["water", "food", "medical", "toilet", "power"];
const SEVERITY = new Set(["danger", "warning", "caution"]);
const CAMP_STATUS = new Set(["open", "full", "closed"]);
const BOUNDS = { latMin: 19.5, latMax: 27.5, lonMin: 86.5, lonMax: 93.5 }; // generous box around Bangladesh
const TZ = /(Z|[+-]\d{2}:?\d{2})$/i;
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Normalise { hotspots: [], camps: [] }. Invalid items are dropped and described in `errors`.
 * The API rejects a PUT when errors exist; the client simply ignores them.
 */
export function normalizeMapFeatures(raw, { requireTz = false } = {}) {
  const errors = [];
  const out = { hotspots: [], camps: [] };
  const arr = (v, name) => (v === undefined ? [] : Array.isArray(v) ? v.slice(0, 2000) : (errors.push(`${name} must be an array`), []));

  const date = (v, where) => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || !Number.isFinite(Date.parse(v)) || (requireTz && !TZ.test(v.trim()))) {
      errors.push(`${where}: updatedAt must be an ISO date${requireTz ? " with a UTC offset" : ""}`);
      return undefined;
    }
    return new Date(v).toISOString();
  };

  const common = (it, kind, i, seen) => {
    const where = `${kind}[${i}]`;
    const id = String(it?.id ?? "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errors.push(`${where}: bad id`), null;
    if (seen.has(id)) return errors.push(`${where}: duplicate id ${id}`), null;
    const lat = Number(it?.lat), lon = Number(it?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < BOUNDS.latMin || lat > BOUNDS.latMax || lon < BOUNDS.lonMin || lon > BOUNDS.lonMax) {
      return errors.push(`${where}: lat/lon missing or outside Bangladesh region`), null;
    }
    const name = clean(it?.name, 120);
    if (!name) return errors.push(`${where}: name required`), null;
    const updatedAt = date(it?.updatedAt, where);
    if (updatedAt === undefined) return null;
    return {
      id, name, lat, lon,
      district: clean(it?.district, 60) || null,
      upazila: clean(it?.upazila, 60) || null,
      message: clean(it?.message, 300) || null,
      updatedAt
    };
  };

  const seenH = new Set(), seenC = new Set();
  arr(raw?.hotspots, "hotspots").forEach((it, i) => {
    const base = common(it, "hotspots", i, seenH);
    if (!base) return;
    const severity = String(it?.severity ?? "").toLowerCase();
    if (!SEVERITY.has(severity)) return errors.push(`hotspots[${i}]: severity must be danger|warning|caution`);
    seenH.add(base.id);
    out.hotspots.push({ ...base, severity, type: clean(it?.type, 40) || "flood" });
  });
  arr(raw?.camps, "camps").forEach((it, i) => {
    const base = common(it, "camps", i, seenC);
    if (!base) return;
    const status = String(it?.status ?? "open").toLowerCase();
    if (!CAMP_STATUS.has(status)) return errors.push(`camps[${i}]: status must be open|full|closed`);
    const capacity = Math.round(Number(it?.capacity ?? 0));
    const occupancy = Math.round(Number(it?.occupancy ?? 0));
    if (!(capacity >= 0 && capacity <= 200000) || !(occupancy >= 0 && occupancy <= 400000)) return errors.push(`camps[${i}]: bad capacity/occupancy`);
    const phone = it?.phone ? String(it.phone).replace(/[\s-]/g, "") : null;
    if (phone && !/^\+?\d{6,15}$/.test(phone)) return errors.push(`camps[${i}]: bad phone`);
    seenC.add(base.id);
    out.camps.push({
      ...base, status, capacity, occupancy, phone,
      facilities: (Array.isArray(it?.facilities) ? it.facilities : []).map(String).filter((f) => FACILITIES.includes(f))
    });
  });
  return { ...out, errors, demo: raw?.meta?.demo === true };
}
