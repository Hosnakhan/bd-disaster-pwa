import crypto from "node:crypto";
import { haversineMeters, cleanLocation } from "./lib/geo.js";
import { lanRoomFor } from "./lib/lan.js";
import { safeEqual } from "./lib/auth.js";

const NODE_ID = /^[A-Za-z0-9-]{8,64}$/;
const SDP_MAX = 20_000;
const TOKEN_TTL_MS = 5 * 60_000;
const LINK_TTL_MS = 2 * 60_000;
const SIGNAL_TYPES = new Set(["offer", "answer", "candidate", "bye"]);
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Pairing-only signaling on the /signal namespace. It never sees mesh payloads, only SDP/ICE.
 * Nearby = same server-derived LAN room, or within NEARBY_RADIUS_M by (coarsened) location.
 */
export function attachSignaling(io, { config, log }) {
  const cfg = config.signaling;
  const nsp = io.of("/signal");
  const peers = new Map();  // nodeId -> { id, socketId, room, lat, lon }
  const tokens = new Map(); // nodeId -> { token, expires }  (prevents nodeId hijack on reconnect)
  const links = new Map();  // pairKey -> { offerer, answered, ts }

  function relation(a, b) {
    if (a.room && a.room === b.room) return { via: "lan", distanceM: null };
    if (a.lat !== null && b.lat !== null) {
      const d = haversineMeters(a.lat, a.lon, b.lat, b.lon);
      if (d <= cfg.nearbyRadiusM) return { via: "geo", distanceM: Math.round(d) };
    }
    return null;
  }

  function neighborsOf(me) {
    const found = [];
    for (const p of peers.values()) {
      if (p.id === me.id) continue;
      const rel = relation(me, p);
      if (rel) found.push({ nodeId: p.id, ...rel, initiator: me.id < p.id }); // lower id offers => no glare
    }
    found.sort((x, y) => (x.via === y.via ? (x.distanceM ?? 0) - (y.distanceM ?? 0) : x.via === "lan" ? -1 : 1));
    return found.slice(0, cfg.maxNeighbors);
  }

  function announce(me) {
    for (const p of peers.values()) {
      if (p.id === me.id) continue;
      const rel = relation(me, p);
      if (rel) nsp.to(p.socketId).emit("peer:nearby", { nodeId: me.id, ...rel, initiator: p.id < me.id });
    }
  }

  nsp.use((socket, next) => (nsp.sockets.size >= cfg.maxClients ? next(new Error("busy")) : next()));

  nsp.on("connection", (socket) => {
    // Per-socket sliding-window rate limit.
    const hits = [];
    socket.use((_packet, next) => {
      const now = Date.now();
      while (hits.length && hits[0] < now - 10_000) hits.shift();
      hits.push(now);
      if (hits.length > cfg.rateMax * 3) return socket.disconnect(true);
      if (hits.length > cfg.rateMax) return next(new Error("rate-limited"));
      next();
    });

    socket.on("hello", (msg, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const id = msg?.nodeId;
      if (!NODE_ID.test(id ?? "")) return reply({ ok: false, error: "bad-node-id" });
      if (socket.data.nodeId && socket.data.nodeId !== id) return reply({ ok: false, error: "node-id-change" });

      const saved = tokens.get(id);
      const known = peers.has(id) || saved;
      if (known && !(saved && typeof msg.token === "string" && safeEqual(saved.token, msg.token))) {
        return reply({ ok: false, error: "node-id-in-use" });
      }
      const old = peers.get(id);
      if (old && old.socketId !== socket.id) {
        peers.delete(id); // superseded: its disconnect handler must not announce peer:gone
        nsp.sockets.get(old.socketId)?.disconnect(true);
      }

      const token = saved?.token ?? crypto.randomBytes(24).toString("base64url");
      tokens.set(id, { token, expires: Date.now() + TOKEN_TTL_MS });
      const me = { id, socketId: socket.id, room: lanRoomFor(socket, config), ...cleanLocation(msg.location) };
      peers.set(id, me);
      socket.data.nodeId = id;

      reply({ ok: true, token, neighbors: neighborsOf(me), localMode: config.localMode });
      announce(me);
    });

    socket.on("peers:refresh", (msg, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const me = peers.get(socket.data.nodeId);
      if (!me) return reply({ ok: false, error: "no-hello" });
      if (msg?.location) Object.assign(me, cleanLocation(msg.location));
      reply({ ok: true, neighbors: neighborsOf(me) });
      announce(me);
    });

    socket.on("signal", (msg, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const me = peers.get(socket.data.nodeId);
      if (!me) return reply({ ok: false, error: "no-hello" });
      const { type, to } = msg ?? {};
      if (!SIGNAL_TYPES.has(type) || !NODE_ID.test(to ?? "")) return reply({ ok: false, error: "bad-signal" });
      const target = peers.get(to);
      if (!target) return reply({ ok: false, error: "peer-offline" });

      const key = pairKey(me.id, to);
      const link = links.get(key);
      const payload = { from: me.id, type };

      if (type === "offer" || type === "answer") {
        const d = msg.description;
        if (d?.type !== type || typeof d.sdp !== "string" || d.sdp.length > SDP_MAX) return reply({ ok: false, error: "bad-description" });
        payload.description = { type, sdp: d.sdp };
      }
      if (type === "offer") {
        if (!relation(me, target)) return reply({ ok: false, error: "not-nearby" });
        links.set(key, { offerer: me.id, answered: false, ts: Date.now() });
      } else if (type === "answer") {
        if (!link || link.offerer !== to || link.answered) return reply({ ok: false, error: "no-offer" });
        link.answered = true; link.ts = Date.now();
      } else {
        if (!link) return reply({ ok: false, error: "no-link" });
        link.ts = Date.now();
        if (type === "candidate") {
          const c = msg.candidate;
          if (typeof c?.candidate !== "string" || c.candidate.length > 1000) return reply({ ok: false, error: "bad-candidate" });
          payload.candidate = { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null };
        }
      }
      nsp.to(target.socketId).emit("signal", payload);
      reply({ ok: true });
    });

    socket.on("disconnect", () => {
      const id = socket.data.nodeId;
      if (!id || peers.get(id)?.socketId !== socket.id) return;
      const me = peers.get(id);
      peers.delete(id);
      for (const p of peers.values()) if (relation(me, p)) nsp.to(p.socketId).emit("peer:gone", { nodeId: id });
    });
  });

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, t] of tokens) if (t.expires < now && !peers.has(id)) tokens.delete(id);
    for (const [k, l] of links) if (now - l.ts > LINK_TTL_MS) links.delete(k);
  }, 30_000);
  sweep.unref();

  return { stats: () => ({ peers: peers.size }), stop: () => clearInterval(sweep) };
}
