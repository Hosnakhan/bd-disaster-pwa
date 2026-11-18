import crypto from "node:crypto";
import { config } from "../config.js";

const sha = (s) => crypto.createHash("sha256").update(s).digest();

export function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha(String(a)), sha(String(b)));
}

/** Bearer-token guard. Fails closed when ADMIN_TOKEN is missing or weak. */
export function requireAdmin(req, res, next) {
  if (config.adminToken.length < 24) return res.status(503).json({ error: "admin-disabled" });
  const m = /^Bearer (.+)$/.exec(req.get("authorization") || "");
  if (!m || !safeEqual(m[1], config.adminToken)) {
    res.set("WWW-Authenticate", "Bearer");
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
