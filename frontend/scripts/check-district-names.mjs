// Verifies public/data/bangladesh-districts.geojson lines up with the canonical 64 districts.
// Run from frontend/:  npm run check:districts
import { readFile } from "node:fs/promises";
import { DISTRICTS, canonicalDistrict } from "../src/lib/districts.js";

const gj = JSON.parse(await readFile("public/data/bangladesh-districts.geojson", "utf8"));
const nameOf = (p = {}) => p.NAME_2 || p.ADM2_EN || p.adm2_en || p.district || p.DISTRICT || p.name || "";

const problems = [];
const matched = new Map();
for (const f of gj.features) {
  const raw = nameOf(f.properties);
  if (!raw) { problems.push("Feature with no recognisable district name property."); continue; }
  const canon = canonicalDistrict(raw);
  if (!canon) { problems.push(`Not recognised: "${raw}" (add it to ALIASES in src/lib/districts.js AND backend/server/lib/districts.js)`); continue; }
  if (matched.has(canon)) problems.push(`Duplicate feature for ${canon}`);
  matched.set(canon, raw);
}
for (const d of DISTRICTS) if (!matched.has(d)) problems.push(`No GeoJSON feature for: ${d}`);
if (gj.features.length !== DISTRICTS.length) problems.push(`Expected ${DISTRICTS.length} features, found ${gj.features.length}`);

console.log(`${gj.features.length} features checked, ${matched.size}/${DISTRICTS.length} districts matched.`);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("All district names line up.");
