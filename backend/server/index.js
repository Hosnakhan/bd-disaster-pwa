import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { config, validateConfig } from "./config.js";
import { log } from "./lib/log.js";
import { lanUrls } from "./lib/lan.js";
import { corsMiddleware } from "./lib/cors.js";
import { AlertService } from "./lib/alert-service.js";
import { alertsRouter } from "./alerts.js";
import { attachSignaling } from "./signaling.js";
import { iceRouter } from "./ice.js";
import { createDonations } from "./donations.js";
import { mapFeaturesRouter } from "./map-features.js";
import { startLanBeacon } from "./lan-beacon.js";

validateConfig(log);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);

// This process is a JSON API: it never serves HTML, so the CSP forbids everything.
// Only an isolated LAN node that serves a built frontend (STATIC_DIR) needs the page-oriented policy.
const apiCsp = { useDefaults: false, directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"] } };
const pageCsp = {
  useDefaults: true,
  directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"], // Leaflet positions panes with inline styles
    "img-src": ["'self'", "data:", "blob:", "https://*.basemaps.cartocdn.com", "https://*.tile.openstreetmap.org"],
    "connect-src": ["'self'", "ws:", "wss:", "https://*.basemaps.cartocdn.com"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    // A LAN-only node over plain http must NOT send upgrade-insecure-requests (it would break the page).
    "upgrade-insecure-requests": config.isProd && !config.localMode ? [] : null
  }
};
app.use(helmet({
  contentSecurityPolicy: config.staticDir ? pageCsp : apiCsp,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" } // reads are gated by CORS, not by CORP
}));
app.use(compression());
app.use("/api", corsMiddleware(config.allowedOrigins)); // before the rate limiter so 429s stay readable by the PWA

// Webhooks need the raw body for signature checks, so they mount before any JSON parser.
const donations = await createDonations({ config, log });
app.use("/api", donations.webhooks);

app.use("/api", rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: "draft-7", legacyHeaders: false }));

const alerts = new AlertService({ config, log });
await alerts.init();

app.get("/healthz", (_req, res) => {
  const { meta } = alerts.view();
  res.json({ ok: true, alerts: { source: meta.source, lastSuccessAt: meta.lastSuccessAt, stale: meta.stale, mock: meta.mock } });
});
app.get("/api/lan-info", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ mode: config.localMode ? "local" : "online", urls: lanUrls(config), name: config.lan.nodeName });
});
app.use("/api", alertsRouter(alerts, log));
app.use("/api", iceRouter(config));
app.use("/api", donations.api);
app.use("/api", await mapFeaturesRouter({ config, log }));
app.use("/api", (_req, res) => res.status(404).json({ error: "not-found" }));

if (config.staticDir) {
  // Optional single-process mode for an isolated rescue node. Hashed assets are immutable; shell + SW revalidate.
  app.use(express.static(config.staticDir, {
    index: false,
    setHeaders(res, file) {
      const immutable = file.includes(`${path.sep}assets${path.sep}`);
      res.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
    }
  }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/socket.io/")) return next();
    res.sendFile(path.join(config.staticDir, "index.html"), (err) => err && next());
  });
} else {
  app.get("/", (_req, res) => res.json({ service: "bd-disaster-api", ok: true }));
}
app.use((_req, res) => res.status(404).json({ error: "not-found" }));

app.use((err, _req, res, _next) => {
  log("error", "unhandled", { error: err.message });
  res.status(err.status && err.status < 500 ? err.status : 500).json({ error: "server-error" });
});

const server = config.tls.keyFile && config.tls.certFile
  ? https.createServer({ key: fs.readFileSync(config.tls.keyFile), cert: fs.readFileSync(config.tls.certFile) }, app)
  : http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 10_000,
  pingTimeout: 15_000,
  // Same allow-list as REST. Socket.io's own CORS covers the long-polling transport; allowRequest also
  // covers the websocket upgrade (which CORS does not). Connections with no Origin (non-browser clients) pass.
  cors: { origin: config.allowedOrigins, methods: ["GET", "POST"], credentials: false },
  allowRequest: (req, cb) => {
    const origin = req.headers.origin;
    if (!origin) return cb(null, true);
    const sameOrigin = req.headers.host && (origin === `https://${req.headers.host}` || origin === `http://${req.headers.host}`);
    cb(null, config.allowedOrigins.includes(origin) || Boolean(config.staticDir && sameOrigin));
  }
});
const signaling = attachSignaling(io, { config, log });
const stopBeacon = config.lan.beacon ? startLanBeacon(config, log) : () => {};

server.listen(config.port, config.host, () => {
  log("info", "server listening", { port: config.port, tls: Boolean(config.tls.keyFile), localMode: config.localMode, allowedOrigins: config.allowedOrigins.length });
  if (config.localMode) for (const u of lanUrls(config)) log("info", `rescue node reachable at ${u}`);
  alerts.start();
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  log("info", "shutting down", { signal });
  alerts.stop(); signaling.stop(); stopBeacon();
  io.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (e) => log("error", "unhandledRejection", { error: String(e?.message ?? e) }));
