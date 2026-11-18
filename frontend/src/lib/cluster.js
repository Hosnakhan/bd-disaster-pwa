/**
 * Grid clustering in screen space. `project(lat, lon) -> {x, y}` is map.project at the current zoom,
 * so this module has no Leaflet dependency. Cells are anchored to the world origin, so cluster
 * membership does not change while panning.
 */
export function clusterPoints(items, project, radiusPx = 56) {
  const grid = new Map();
  for (const item of items) {
    const p = project(item.lat, item.lon);
    const key = `${Math.floor(p.x / radiusPx)}:${Math.floor(p.y / radiusPx)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(item); else grid.set(key, [item]);
  }
  const out = [];
  for (const bucket of grid.values()) {
    if (bucket.length === 1) { out.push({ type: "item", item: bucket[0] }); continue; }
    const lat = bucket.reduce((s, i) => s + i.lat, 0) / bucket.length;
    const lon = bucket.reduce((s, i) => s + i.lon, 0) / bucket.length;
    out.push({ type: "cluster", count: bucket.length, lat, lon, items: bucket });
  }
  return out;
}
