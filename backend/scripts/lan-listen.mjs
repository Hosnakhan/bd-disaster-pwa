// Debug tool: node scripts/lan-listen.mjs  -> prints rescue-node beacons seen on this LAN.
import dgram from "node:dgram";
const port = Number(process.env.LAN_BEACON_PORT || 41234);
const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
s.on("message", (m, r) => {
  try { const j = JSON.parse(m); if (j.svc === "bd-disaster-mesh") console.log(r.address, j.name, j.urls.join(" ")); } catch {}
});
s.bind(port, () => console.log(`listening for beacons on udp/${port}`));
