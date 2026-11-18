import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { JsonStore } from "./lib/store.js";
import { requireAdmin } from "./lib/auth.js";
import { normalizeMapFeatures } from "./lib/map-features-schema.js";

const EMPTY = { meta: { demo: false, updatedAt: null }, hotspots: [], camps: [] };

/** Hazard hotspots and relief camps for the map. Curated by admins via PUT; public read-only GET. */
export async function mapFeaturesRouter({ config, log }) {
  const store = new JsonStore(path.join(config.dataDir, "map-features.json"), null);
  let current = await store.load().catch(() => null);
  if (!current && config.alerts.allowMock) { // same dev/demo switch as the alert mock
    try { current = JSON.parse(await fs.readFile(new URL("./seed/map-features.demo.json", import.meta.url), "utf8")); } catch { /* no demo file */ }
  }

  const r = express.Router();
  r.get("/map-features", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.json(current ?? EMPTY);
  });

  r.put("/admin/map-features", requireAdmin, express.json({ limit: "512kb" }), async (req, res) => {
    const { hotspots, camps, errors } = normalizeMapFeatures(req.body, { requireTz: true });
    if (errors.length) return res.status(422).json({ ok: false, errors: errors.slice(0, 20), errorCount: errors.length });
    const next = { meta: { demo: false, updatedAt: new Date().toISOString() }, hotspots, camps };
    await store.save(next);
    current = next;
    log("info", "map features updated", { hotspots: hotspots.length, camps: camps.length });
    res.json({ ok: true, hotspots: hotspots.length, camps: camps.length });
  });
  return r;
}
