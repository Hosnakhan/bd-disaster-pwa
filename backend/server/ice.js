import crypto from "node:crypto";
import express from "express";

/** GET /api/ice-servers -> STUN/TURN for internet-side pairing. Empty on an isolated LAN node. */
export function iceRouter(config) {
  const r = express.Router();
  r.get("/ice-servers", (_req, res) => {
    res.set("Cache-Control", "no-store");
    if (config.localMode) return res.json({ iceServers: [] });
    const { stunUrls, turnUrls, turnSecret, turnTtlSec } = config.ice;
    const iceServers = [];
    if (stunUrls.length) iceServers.push({ urls: stunUrls });
    if (turnUrls.length && turnSecret) {
      const username = `${Math.floor(Date.now() / 1000) + turnTtlSec}:bdmesh`; // coturn REST scheme
      const credential = crypto.createHmac("sha1", turnSecret).update(username).digest("base64");
      iceServers.push({ urls: turnUrls, username, credential });
    }
    res.json({ iceServers, ttl: turnTtlSec });
  });
  return r;
}
