const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function haversineMeters(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Validate and coarsen a client location to ~110 m (3 decimals) before it is kept in memory. */
export function cleanLocation(loc) {
  const lat = Number(loc?.lat ?? loc?.latitude);
  const lon = Number(loc?.lon ?? loc?.lng ?? loc?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { lat: null, lon: null };
  }
  return { lat: Math.round(lat * 1e3) / 1e3, lon: Math.round(lon * 1e3) / 1e3 };
}
