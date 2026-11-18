// frontend/ and backend/ deploy separately and must not import from each other, so two small,
// dependency-free, secret-free modules are deliberately duplicated. This fails if they drift apart.
// Run from the repo root:  node scripts/check-shared-copies.mjs   (wire it into CI)
import { readFileSync } from "node:fs";
const pairs = [
  ["frontend/src/lib/districts.js", "backend/server/lib/districts.js"],
  ["frontend/src/lib/mapFeatures.js", "backend/server/lib/map-features-schema.js"]
];
let bad = 0;
for (const [a, b] of pairs) {
  const same = readFileSync(a, "utf8").replace(/\r\n/g, "\n") === readFileSync(b, "utf8").replace(/\r\n/g, "\n");
  console.log(same ? "in sync " : "DRIFTED ", a, "<->", b);
  if (!same) bad++;
}
process.exit(bad ? 1 : 0);
