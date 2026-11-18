import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); // backend/
const env = process.env;
const bool = (v, d = false) => (v === undefined || v === "" ? d : /^(1|true|yes|on)$/i.test(v));
const int = (v, d, min = -Infinity) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= min ? n : d;
};
const list = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
const parseTrustProxy = (v = "false") => {
  if (v === "false" || v === "") return false;
  if (v === "true") return 1; // one hop; never blanket-trust X-Forwarded-For
  if (/^\d+$/.test(v)) return Number(v);
  return v; // e.g. "loopback"
};

/** "https://app.vercel.app/" -> "https://app.vercel.app" (browsers send Origin without a trailing slash). */
function normalizeOrigin(raw) {
  try {
    const u = new URL(raw);
    return u.origin; // scheme + host + port, no path
  } catch {
    return null;
  }
}

const isProd = env.NODE_ENV === "production";
const localMode = bool(env.LOCAL_MODE); // rescue-node / isolated hotspot deployment

// FRONTEND_URL is the canonical setting. CORS_ORIGIN is accepted as an alias. Both may be comma-separated.
const rawOrigins = [...list(env.FRONTEND_URL), ...list(env.CORS_ORIGIN)];
const allowedOrigins = [...new Set(rawOrigins.map(normalizeOrigin).filter(Boolean))];
const invalidOrigins = rawOrigins.filter((o) => !normalizeOrigin(o));

export const config = {
  isProd,
  localMode,
  port: int(env.PORT, 3000, 1), // Render injects PORT
  host: env.HOST || "0.0.0.0",
  // Optional: serve an already-built frontend from this process (isolated LAN rescue node only).
  // Unset = pure API server, which is what you want for Render/Railway/DigitalOcean.
  staticDir: env.STATIC_DIR ? path.resolve(root, env.STATIC_DIR) : "",
  dataDir: path.resolve(root, env.DATA_DIR || "data"),
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
  allowedOrigins,
  invalidOrigins,
  tls: { keyFile: env.TLS_KEY_FILE || "", certFile: env.TLS_CERT_FILE || "" },
  adminToken: env.ADMIN_TOKEN || "",
  ipHashSalt: env.IP_HASH_SALT || "",

  signaling: {
    nearbyRadiusM: int(env.NEARBY_RADIUS_M, 300, 10),
    maxNeighbors: int(env.MAX_NEIGHBORS, 6, 1),
    maxClients: int(env.MAX_SIGNAL_CLIENTS, 2000, 1),
    rateMax: int(env.SIGNAL_RATE_MAX, 40, 5) // events per 10 s per socket
  },

  ice: {
    stunUrls: list(env.STUN_URLS),
    turnUrls: list(env.TURN_URLS),
    turnSecret: env.TURN_SECRET || "", // coturn static-auth-secret (REST credentials)
    turnTtlSec: int(env.TURN_TTL_SEC, 3600, 60)
  },

  lan: {
    beacon: bool(env.LAN_BEACON, localMode),
    beaconPort: int(env.LAN_BEACON_PORT, 41234, 1024),
    beaconIntervalMs: int(env.LAN_BEACON_INTERVAL_MS, 5000, 1000),
    nodeName: env.NODE_NAME || "bd-rescue-node"
  },

  alerts: {
    sourceUrl: env.ALERT_SOURCE_URL || "",
    sourceToken: env.ALERT_SOURCE_TOKEN || "",
    pollMs: int(env.ALERT_POLL_MS, 5 * 60_000, 60_000),
    staleAfterMs: int(env.ALERT_STALE_AFTER_MS, 2 * 60 * 60_000, 60_000),
    // Mock feed is for development/demo only. Off in production unless explicitly enabled.
    allowMock: bool(env.ALLOW_MOCK_ALERTS, !isProd),
    maxBytes: 2 * 1024 * 1024
  },

  donations: {
    webhookSecrets: { bkash: env.WEBHOOK_SECRET_BKASH || "", nagad: env.WEBHOOK_SECRET_NAGAD || "" }
  }
};

export function validateConfig(log) {
  if (config.adminToken && config.adminToken.length < 24) {
    log("warn", "ADMIN_TOKEN is shorter than 24 chars; admin routes are DISABLED");
  }
  if (!config.adminToken) log("warn", "ADMIN_TOKEN not set; admin and alert-push routes are DISABLED");
  for (const o of config.invalidOrigins) log("warn", "FRONTEND_URL/CORS_ORIGIN entry is not a valid URL and was ignored", { value: o });
  if (config.isProd && !config.staticDir && config.allowedOrigins.length === 0) {
    log("warn", "FRONTEND_URL is not set: every cross-origin browser request (REST and websocket) will be REFUSED");
  }
  if (config.isProd && config.allowedOrigins.some((o) => o.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(o))) {
    log("warn", "FRONTEND_URL contains a non-https origin in production");
  }
  if (config.isProd && !config.ipHashSalt) {
    log("warn", "IP_HASH_SALT not set: donor IP hashes change on every restart (set a stable random value)");
  }
  if (config.isProd && config.alerts.sourceUrl && !/^https:\/\//i.test(config.alerts.sourceUrl)) {
    log("warn", "ALERT_SOURCE_URL is not https in production");
  }
  if (config.isProd && config.alerts.allowMock) log("warn", "ALLOW_MOCK_ALERTS is on in production");
  if (config.tls.keyFile !== "" && config.tls.certFile === "") log("warn", "TLS_KEY_FILE set without TLS_CERT_FILE");
}
