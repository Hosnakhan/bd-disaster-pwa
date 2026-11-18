import dgram from "node:dgram";
import { lanInterfaces, lanUrls } from "./lib/lan.js";

/**
 * UDP broadcast beacon: announces this node's LAN URL(s) every few seconds so rescue nodes,
 * companion apps and scripts/lan-listen.mjs can discover it without internet.
 * NOTE: browsers cannot receive UDP. Phones still need the URL (QR / written / captive portal).
 */
export function startLanBeacon(config, log) {
  const sock = dgram.createSocket("udp4");
  let timer;
  sock.on("error", (e) => log("warn", "lan beacon error", { error: e.code || e.message }));
  sock.bind(0, () => {
    sock.setBroadcast(true);
    const tick = () => {
      const msg = Buffer.from(JSON.stringify({
        svc: "bd-disaster-mesh", v: 1, name: config.lan.nodeName, urls: lanUrls(config), t: Date.now()
      }));
      for (const i of lanInterfaces()) sock.send(msg, config.lan.beaconPort, i.broadcast, () => {});
    };
    tick();
    timer = setInterval(tick, config.lan.beaconIntervalMs);
    timer.unref();
    log("info", "lan beacon started", { port: config.lan.beaconPort });
  });
  return () => { clearInterval(timer); try { sock.close(); } catch { /* already closed */ } };
}
