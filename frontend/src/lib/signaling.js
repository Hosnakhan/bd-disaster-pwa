/**
 * Glue between MeshRelay (SDP offer/answer, non-trickle) and the Socket.io signaling server.
 * socket.io-client is loaded lazily so it stays out of the first-paint bundle.
 *
 *   const conn = await connectSignaling({ mesh, location: { lat, lon } });
 *   conn.refresh({ lat, lon });   // after the user moves
 *   conn.close();
 */
import { API_BASE_URL, apiUrl } from "./api";

const MAX_PEERS = 6;

export async function fetchIceServers() {
  try {
    const r = await fetch(apiUrl("/api/ice-servers"), { cache: "no-store" });
    return r.ok ? (await r.json()).iceServers || [] : [];
  } catch { return []; } // offline / LAN node: host candidates only
}

export async function connectSignaling({ mesh, baseUrl = API_BASE_URL, location = null, onStatus = () => {} }) {
  const { io } = await import("socket.io-client");
  const socket = io(`${baseUrl}/signal`, { transports: ["websocket", "polling"], reconnectionDelayMax: 10_000 });
  const inflight = new Set();
  const TOKEN_KEY = `bd-mesh-token:${mesh.nodeId}`;
  const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) || undefined; } catch { return undefined; } };
  const saveToken = (t) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ } };
  const plain = (d) => ({ type: d.type, sdp: d.sdp });
  const emit = (ev, msg) => new Promise((resolve) => socket.timeout(8000).emit(ev, msg, (err, res) => resolve(err ? { ok: false, error: "timeout" } : res)));

  async function connectTo(n) {
    if (!n.initiator || inflight.has(n.nodeId) || mesh.peers.has(n.nodeId) || mesh.peers.size >= MAX_PEERS) return;
    inflight.add(n.nodeId);
    try {
      const offer = await mesh.createOffer(n.nodeId);
      const res = await emit("signal", { to: n.nodeId, type: "offer", description: plain(offer) });
      if (!res?.ok) throw new Error(res?.error || "offer-failed");
    } catch (e) {
      mesh.onError(e);
    } finally {
      setTimeout(() => inflight.delete(n.nodeId), 15_000); // allow a retry later
    }
  }

  socket.on("peer:nearby", connectTo);
  socket.on("signal", async ({ from, type, description, candidate }) => {
    try {
      if (type === "offer") {
        if (mesh.peers.size >= MAX_PEERS && !mesh.peers.has(from)) return;
        const answer = await mesh.acceptOffer(from, description);
        await emit("signal", { to: from, type: "answer", description: plain(answer) });
      } else if (type === "answer") await mesh.acceptAnswer(from, description);
      else if (type === "candidate") await mesh.addIceCandidate(from, candidate);
    } catch (e) { mesh.onError(e); }
  });

  async function hello(loc) {
    const res = await emit("hello", { nodeId: mesh.nodeId, token: readToken(), location: loc || undefined });
    if (!res?.ok) { onStatus({ state: "error", error: res?.error }); return; }
    saveToken(res.token);
    onStatus({ state: "online", neighbors: res.neighbors.length, localMode: res.localMode });
    res.neighbors.forEach(connectTo);
  }
  socket.on("connect", () => hello(location)); // also re-runs after every reconnect
  socket.on("disconnect", () => onStatus({ state: "offline" }));

  return {
    socket,
    refresh: async (loc) => {
      const res = await emit("peers:refresh", { location: loc || undefined });
      if (res?.ok) res.neighbors.forEach(connectTo);
    },
    close: () => socket.close()
  };
}
