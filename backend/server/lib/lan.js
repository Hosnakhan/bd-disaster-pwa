import os from "node:os";

export const normalizeIp = (addr = "") => (addr.startsWith("::ffff:") ? addr.slice(7) : addr);

export function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254);
}

/**
 * Server-derived LAN room. Clients are never trusted to name their own room.
 * Only meaningful when clients reach this process directly (no reverse proxy hiding their IP).
 */
export function lanRoomFor(socket, config) {
  if (config.localMode) return "local"; // every client of an isolated rescue node is "nearby"
  if (config.trustProxy !== false) return null;
  const ip = normalizeIp(socket.handshake.address);
  return isPrivateIPv4(ip) ? `lan:${ip.split(".").slice(0, 3).join(".")}` : null;
}

export function lanInterfaces() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const ip = a.address.split(".").map(Number);
      const mask = a.netmask.split(".").map(Number);
      const broadcast = ip.map((o, i) => (o | (~mask[i] & 255)) & 255).join(".");
      out.push({ name, address: a.address, netmask: a.netmask, broadcast });
    }
  }
  return out;
}

export function lanUrls(config) {
  const scheme = config.tls.keyFile ? "https" : "http";
  return lanInterfaces().map((i) => `${scheme}://${i.address}:${config.port}`);
}
