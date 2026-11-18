import path from "node:path";
import { JsonStore } from "./store.js";
import { normalizeRawAlerts } from "./alerts-normalize.js";
import { mockFeed } from "./mock-feed.js";

const iso = (ms = Date.now()) => new Date(ms).toISOString();
const MAX_BACKOFF_MS = 30 * 60_000;

/**
 * Pulls (or receives pushed) hazard alerts, normalises them to district statuses, persists the last
 * good snapshot, and serves a stale/expiry-aware view. Never invents "safe": a district with no
 * current official entry is simply absent, which the frontend renders as "unknown".
 */
export class AlertService {
  constructor({ config, log }) {
    this.cfg = config.alerts;
    this.log = log;
    this.store = new JsonStore(path.join(config.dataDir, "alerts-snapshot.json"), null);
    this.state = { statuses: {}, meta: { source: "none", mock: false, lastAttemptAt: null, lastSuccessAt: null, lastError: null, accepted: 0, rejected: 0 } };
    this.etag = null;
    this.failures = 0;
    this.timer = null;
    this.running = false;
  }

  async init() {
    const snap = await this.store.load().catch((e) => { this.log("warn", "alert snapshot unreadable", { error: e.message }); return null; });
    if (snap?.statuses && snap?.meta) this.state = snap;
  }

  start() {
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      await this.refresh();
      const base = this.failures ? Math.min(this.cfg.pollMs * 2 ** this.failures, MAX_BACKOFF_MS) : this.cfg.pollMs;
      const jitter = base * (0.9 + Math.random() * 0.2);
      this.timer = setTimeout(loop, jitter);
      this.timer.unref();
    };
    loop();
  }

  stop() { this.running = false; clearTimeout(this.timer); }

  async #fetchRaw() {
    const { sourceUrl, sourceToken, allowMock, maxBytes } = this.cfg;
    if (sourceUrl) {
      const headers = { accept: "application/json", "user-agent": "bd-disaster-pwa/1.0" };
      if (sourceToken) headers.authorization = `Bearer ${sourceToken}`;
      if (this.etag) headers["if-none-match"] = this.etag;
      const res = await fetch(sourceUrl, { headers, signal: AbortSignal.timeout(10_000) });
      if (res.status === 304) return { notModified: true };
      if (!res.ok) throw new Error(`source responded HTTP ${res.status}`);
      if (Number(res.headers.get("content-length") || 0) > maxBytes) throw new Error("source response too large");
      const text = await res.text();
      if (text.length > maxBytes) throw new Error("source response too large");
      this.etag = res.headers.get("etag");
      return { data: JSON.parse(text), source: "url", mock: false };
    }
    if (allowMock) return { data: mockFeed(), source: "mock", mock: true };
    throw new Error("no ALERT_SOURCE_URL configured and mock feed disabled");
  }

  /** Apply a normalised result. Refuses to wipe good data if the whole feed was rejected (schema drift). */
  async #apply(raw, { source, mock }) {
    const result = normalizeRawAlerts(raw);
    const accepted = Object.keys(result.statuses).length;
    const droppedAsExpired = result.rejected.filter((r) => r.reason === "expired").length;
    if (result.total > 0 && accepted === 0 && droppedAsExpired < result.total) {
      throw new Error(`all ${result.total} alerts rejected (${[...new Set(result.rejected.map((r) => r.reason))].join(", ")}); feed format changed?`);
    }
    const changed = JSON.stringify(result.statuses) !== JSON.stringify(this.state.statuses);
    this.state = {
      statuses: result.statuses,
      meta: { ...this.state.meta, source, mock, lastSuccessAt: iso(), lastError: null, accepted, rejected: result.rejected.length }
    };
    await this.store.save(this.state);
    if (changed) this.log("info", "district alerts updated", { accepted, rejected: result.rejected.length, source });
    return { changed, accepted, rejected: result.rejected };
  }

  async refresh() {
    this.state.meta.lastAttemptAt = iso();
    try {
      const r = await this.#fetchRaw();
      if (r.notModified) {
        this.state.meta.lastSuccessAt = iso();
        await this.store.save(this.state);
      } else {
        await this.#apply(r.data, r);
      }
      this.failures = 0;
    } catch (e) {
      this.failures = Math.min(this.failures + 1, 8);
      this.state.meta.lastError = String(e.message).slice(0, 200);
      this.log("warn", "alert refresh failed", { error: this.state.meta.lastError, failures: this.failures });
      this.store.save(this.state).catch(() => {});
    }
  }

  /** Authenticated push (full snapshot, same semantics as the pull feed). */
  async ingest(raw) {
    this.state.meta.lastAttemptAt = iso();
    return this.#apply(raw, { source: "push", mock: false });
  }

  view(now = Date.now()) {
    const { statuses, meta } = this.state;
    const last = meta.lastSuccessAt ? Date.parse(meta.lastSuccessAt) : 0;
    const stale = !last || now - last > this.cfg.staleAfterMs;
    const out = {};
    for (const [district, e] of Object.entries(statuses)) {
      if (e.validUntil && Date.parse(e.validUntil) <= now) continue; // expired -> unknown, never shown as current
      out[district] = stale ? { ...e, stale: true } : e;
    }
    return { meta: { ...meta, stale }, statuses: out };
  }
}
