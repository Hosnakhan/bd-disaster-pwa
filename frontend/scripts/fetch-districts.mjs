import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const url = "https://www.bamis.gov.bd/res/public/map/bangladesh_district_bounds_new.json";
const out = "public/data/bangladesh-districts.geojson";

const response = await fetch(url, {
  headers: { "user-agent": "Bangladesh-Disaster-PWA/1.0 (district boundary build task)" }
});
if (!response.ok) throw new Error(`District GeoJSON download failed: HTTP ${response.status}`);

const geojson = await response.json();
if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features) || geojson.features.length < 60) {
  throw new Error("Downloaded data did not pass the expected FeatureCollection / district-count check.");
}
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(geojson));
console.log(`Saved ${geojson.features.length} boundary features to ${out}`);
