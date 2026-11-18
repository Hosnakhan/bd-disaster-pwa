import express from "express";
import { requireAdmin } from "./lib/auth.js";

export function alertsRouter(service, log) {
  const r = express.Router();

  // Public: current district statuses for the PWA map.
  r.get("/alerts", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.json(service.view());
  });

  // Admin push: replace the snapshot from an operator tool or an upstream relay.
  r.post("/alerts/ingest", requireAdmin, express.json({ limit: "256kb" }), async (req, res) => {
    try {
      const out = await service.ingest(req.body);
      res.json({ ok: true, changed: out.changed, accepted: out.accepted, rejectedCount: out.rejected.length, rejected: out.rejected.slice(0, 20) });
    } catch (e) {
      log("warn", "alert ingest rejected", { error: e.message });
      res.status(422).json({ ok: false, error: String(e.message).slice(0, 200) });
    }
  });

  // Admin: force a pull now.
  r.post("/alerts/refresh", requireAdmin, async (_req, res) => {
    await service.refresh();
    res.json(service.view().meta);
  });

  return r;
}
