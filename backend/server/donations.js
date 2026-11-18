import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import rateLimit from "express-rate-limit";
import { JsonStore, appendLine } from "./lib/store.js";
import { requireAdmin, safeEqual } from "./lib/auth.js";
import { validateSubmission } from "./lib/donation-validate.js";

/**
 * PLACEHOLDER donation reconciliation. Nothing here moves money or calls bKash/Nagad.
 * Donors submit the TrxID they received; an admin compares it with the merchant statement
 * and marks it verified/rejected. A record is only "verified" by a human admin action.
 */
export async function createDonations({ config, log }) {
  const store = new JsonStore(path.join(config.dataDir, "donations.json"), { records: [] });
  const auditFile = path.join(config.dataDir, "donation-audit.log");
  const webhookFile = path.join(config.dataDir, "webhook-events.log");
  const data = await store.load();
  const records = data.records;
  const seen = new Set(records.map((r) => `${r.provider}:${r.trxId}`));
  const salt = config.ipHashSalt || crypto.randomBytes(16).toString("hex");
  const ipHash = (ip) => crypto.createHash("sha256").update(salt + ip).digest("hex").slice(0, 16); // no raw IPs at rest

  const submitLimiter = rateLimit({ 
    windowMs: 60_000, 
    limit: 10, 
    standardHeaders: "draft-7", 
    legacyHeaders: false, 
    message: { error: "too-many-requests" } 
  });
  
  const adminLimiter = rateLimit({ 
    windowMs: 60_000, 
    limit: 60, 
    standardHeaders: "draft-7", 
    legacyHeaders: false 
  });

  const api = express.Router();
  const webhooks = express.Router();

  // Public: donor submits their TrxID for manual verification.
  api.post("/donations/trx", submitLimiter, express.json({ limit: "8kb" }), async (req, res) => {
    const { value, error } = validateSubmission(req.body);
    if (error) return res.status(400).json({ error });
    const dedupe = `${value.provider}:${value.trxId}`;
    if (seen.has(dedupe)) return res.status(409).json({ error: "already-submitted" });
    seen.add(dedupe);
    const record = {
      id: crypto.randomUUID(), ...value, status: "pending",
      receivedAt: new Date().toISOString(), ipHash: ipHash(req.ip || ""),
      providerEventAt: null, reviewedAt: null, reviewNote: null
    };
    records.push(record);
    try {
      await store.save({ records });
      await appendLine(auditFile, { t: record.receivedAt, event: "submitted", id: record.id, provider: record.provider, trxId: record.trxId, amount: record.amount });
    } catch (e) {
      records.pop(); seen.delete(dedupe);
      log("error", "donation save failed", { error: e.message });
      return res.status(503).json({ error: "temporarily-unavailable" });
    }
    log("info", "donation trx received", { id: record.id, provider: record.provider });
    res.status(201).json({ ok: true, id: record.id, status: "pending" });
  });

  // Admin: list / review.
  api.get("/admin/donations", adminLimiter, requireAdmin, (req, res) => {
    const status = String(req.query.status || "pending");
    const rows = records.filter((r) => status === "all" || r.status === status).slice(-500).reverse();
    res.json({ count: rows.length, records: rows });
  });

  api.patch("/admin/donations/:id", adminLimiter, requireAdmin, express.json({ limit: "4kb" }), async (req, res) => {
    const rec = records.find((r) => r.id === req.params.id);
    if (!rec) return res.status(404).json({ error: "not-found" });
    const status = req.body?.status;
    if (!["verified", "rejected", "pending"].includes(status)) return res.status(400).json({ error: "invalid-status" });
    const prev = rec.status;
    rec.status = status;
    rec.reviewedAt = new Date().toISOString();
    rec.reviewNote = String(req.body?.note ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 200) || null;
    await store.save({ records });
    await appendLine(auditFile, { t: rec.reviewedAt, event: "status-changed", id: rec.id, from: prev, to: status });
    res.json({ ok: true, record: rec });
  });

  // Provider callback PLACEHOLDER. Fails closed: no secret configured => 503.
  webhooks.post("/webhooks/:provider", express.raw({ type: "*/*", limit: "64kb" }), async (req, res) => {
    const provider = String(req.params.provider).toLowerCase();
    const secret = config.donations.webhookSecrets[provider];
    if (!secret) return res.status(503).json({ error: "webhook-not-configured" });
    const given = String(req.get("x-signature") || "");
    const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
    if (!given || !safeEqual(given, expected)) return res.status(401).json({ error: "bad-signature" });

    let body = {};
    try { body = JSON.parse(req.body.toString("utf8")); } catch { return res.status(400).json({ error: "bad-json" }); }
    const trxId = String(body.trxID ?? body.trxId ?? body.txnId ?? "").trim().toUpperCase() || null;
    await appendLine(webhookFile, { t: new Date().toISOString(), provider, trxId, amount: body.amount ?? null });
    const rec = trxId && records.find((r) => r.provider === provider && r.trxId === trxId);
    if (rec && !rec.providerEventAt) { // flag only; a human still verifies
      rec.providerEventAt = new Date().toISOString();
      await store.save({ records });
    }
    res.json({ received: true });
  });

  return { api, webhooks };
}