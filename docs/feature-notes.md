> **Note:** this is the original feature documentation, kept for its WebRTC/mesh limitations, donation setup and launch checklist.
> Paths and commands predate the split: `server/` is now `backend/server/`, `src/` is now `frontend/src/`,
> `shared/map-features.js` exists as two copies (`frontend/src/lib/mapFeatures.js`, `backend/server/lib/map-features-schema.js`),
> and the run/deploy instructions are in the root `README.md` and `DEPLOYMENT.md`.

# Bangladesh Disaster PWA — Critical Feature Pack

React + Tailwind + Leaflet + WebRTC feature pack for integration into the main Bangladesh disaster PWA.

## Install and run

```bash
npm install
npm run fetch:geojson   # run once while online; stores a local district GeoJSON file
npm run dev
npm run build
```

The app uses a vector-only Leaflet map by default. This is intentional: the district polygons, CSS, JS and app shell can be cached by the PWA service worker, so the map remains visible offline without depending on third-party raster tiles. `showOnlineTiles` can be enabled for OSM tiles, but those tiles are not guaranteed to be available offline; use a properly licensed, pre-packaged tile set or self-hosted tile service if a raster basemap is required.

## 1. District map

- Boundary download source: Bangladesh Agro-Meteorological Information Service (BAMIS), `https://www.bamis.gov.bd/res/public/map/bangladesh_district_bounds_new.json`.
- The build script validates the FeatureCollection and expected district-scale feature count before saving to `public/data/bangladesh-districts.geojson`.
- District status is keyed by canonical English district names. Missing or unverified entries display as `unknown`, never green.
- Replace `sampleDistrictStatuses` with your API response. Recommended schema:

```json
{
  "Sunamganj": {
    "status": "warning",
    "message": "Official warning summary",
    "updatedAt": "2026-11-08T06:00:00+06:00",
    "sourceUrl": "https://..."
  }
}
```

Only render statuses that your backend has verified against an official source. Include the alert issuer, publication time, valid-until time, source URL, ingestion time and stale-data policy. Avoid deriving district status from a single unverified social post.

## 2. WebRTC mesh

`src/lib/mesh.js` provides:
- peer connection lifecycle and ordered DataChannels;
- application-level packet IDs, duplicate suppression, TTL/hop count and store-forward style rebroadcast;
- a 12 MB guard and chunked Blob transfer helper;
- callbacks for received packets and peer state.

### Critical networking limitation

WebRTC is **not automatic nearby-device discovery**. A pair of phones must exchange SDP offers/answers and ICE candidates through a signaling channel. Internet-free operation is possible only when both devices can reach each other over a local network/hotspot and the signaling mechanism is also reachable locally (for example, a local Wi-Fi hotspot server, QR/manual SDP exchange, or a dedicated Android companion). The code configures no public STUN/TURN server, so it does not depend on one, but local routing/firewall/browser policies still need testing. Browser support and background execution vary.

The included `acceptMediaPacket` helper reconstructs media only when the application calls it with every relayed media packet. The demo packet relay does not provide durable storage, acknowledgements, retransmission, end-to-end encryption, congestion control, priority scheduling, or guaranteed delivery. Add these before emergency deployment. For sensitive SOS data, use authenticated peer identities, signed packets, encrypted application payloads, expiry, explicit user consent, and audited retention. Do not automatically rebroadcast private media without consent.

Suggested signaling API (implement on local LAN or your chosen backend):
1. Caller sends `{ peerId, offer: pc.localDescription }`.
2. Receiver calls `acceptOffer(peerId, offer)` and returns the answer.
3. Caller calls `acceptAnswer(peerId, answer)`.
4. Exchange trickled ICE candidates with `addIceCandidate`; this minimal helper waits for ICE gathering and returns a non-trickle SDP description.

### Example

```js
const mesh = new MeshRelay({
  onPacket: (packet) => {
    const media = mesh.acceptMediaPacket(packet);
    if (media) saveMediaToIndexedDb(media.blob, media.metadata);
    else if (packet.payload?.type === "sos") storeSOS(packet.payload);
  },
  onPeer: console.log
});

const offer = await mesh.createOffer("rescue-node-01");
await signaling.sendOffer("rescue-node-01", offer);
// On the other device: const answer = await mesh.acceptOffer("phone-01", offer)
// Caller: await mesh.acceptAnswer("rescue-node-01", answer)
await mesh.send({
  type: "sos",
  location: { latitude: 23.7, longitude: 90.4, accuracy: 20 },
  createdAt: new Date().toISOString(),
  consent: { shareLocation: true }
}, { ttl: 8 });
```

The `signaling` object above is application-specific and is not included.

## 3. Donations

`src/config.js` is deliberately disabled by default. Set `enabled: true` only after the relief organization has verified:
- legal recipient identity and wallet ownership;
- registered merchant/personal account type and number;
- official provider-approved app URL/deep-link scheme;
- exact account-specific QR image;
- customer support and reconciliation process.

No real wallet number, personal number, QR or Nagad USSD value is invented or embedded. bKash's public product page currently documents `*247#` as its USSD platform. Nagad's current USSD code must be confirmed with Nagad before configuring. Deep-link schemes are not assumed: configure only a provider-approved URL. A static QR image is not a payment confirmation; the app never marks a donation paid. For a real payment workflow, integrate provider checkout/payment APIs server-side, keep credentials off the client, verify callbacks/signatures, and reconcile transaction status server-side.

Bangla QR merchant payments are governed by Bangladesh Bank guidance; ensure the chosen QR is the actual QR issued for the receiving merchant. Do not transform a phone number or generic URL into a purported provider payment QR.

## Production release checklist

- [ ] Download and review the district GeoJSON licence, attribution and boundary version; test name normalization for every district.
- [ ] Replace sample alerts with authenticated DDM/FFWC/BMD ingestion and expose source + timestamp + validity.
- [ ] Define stale-data UX; never show old cached warnings as current without a stale badge.
- [ ] Add API authentication, schema validation, rate limiting, observability and signed alert updates.
- [ ] Implement local signaling/discovery and test on the target Android/iOS browsers and hotspot combinations.
- [ ] Add end-to-end encryption, sender authentication, acknowledgements, retries, fragmentation, backpressure, dedup persistence and consent.
- [ ] Test offline install, airplane mode, storage eviction, low-end Android, accessibility and reduced-motion settings.
- [ ] Complete provider onboarding and server-side payment integration; test refunds, reconciliation and fraud scenarios.
- [ ] Field-test with DDM/local responders; do not treat this code pack as a certified emergency dispatch system.

---

# Backend (Node.js + Express + Socket.io)

```
server/
  index.js            Express app, CSP/helmet, static PWA hosting, Socket.io, graceful shutdown
  signaling.js        /signal namespace: nearby pairing + SDP/ICE relay (no mesh payloads)
  alerts.js           GET /api/alerts, POST /api/alerts/ingest (admin), POST /api/alerts/refresh (admin)
  lib/alert-service.js  poll job, snapshot persistence, stale/expiry-aware view
  lib/alerts-normalize.js  upstream feed -> danger/warning/caution/safe (ADAPT to the real feed)
  donations.js        POST /api/donations/trx, admin review, /api/webhooks/:provider placeholder
  ice.js              GET /api/ice-servers (STUN + short-lived TURN credentials)
  lan-beacon.js       UDP broadcast of this node's LAN URL (LOCAL_MODE)
```

## Run

```bash
npm ci
npm run fetch:geojson && npm run check:districts   # online, once
# development: two terminals
npm run dev:server        # API + signaling on :3000 (mock alerts on)
npm run dev               # Vite on :5173, proxies /api and /socket.io
# production
npm run build && NODE_ENV=production ADMIN_TOKEN=... node server/index.js
```

## Admin examples

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" "http://localhost:3000/api/admin/donations?status=pending"
curl -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"verified","note":"matched merchant statement"}' http://localhost:3000/api/admin/donations/<id>
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"alerts":[{"district":"Sylhet","level":"ORANGE","headline":"...","issuedAt":"2026-11-08T10:00:00+06:00","validUntil":"2026-11-09T10:00:00+06:00"}]}' \
  http://localhost:3000/api/alerts/ingest
```

Alert timestamps MUST carry an explicit UTC offset (`Z` or `+06:00`). Expired alerts are dropped, a district with no current official entry is "unknown" (never green), and data older than `ALERT_STALE_AFTER_MS` is flagged stale.

---

# Command Center map (`src/components/map/`)

| File | Role |
| --- | --- |
| `CommandMap.jsx` | Map shell: fit-to-Bangladesh, min-zoom lock, layer chips, controls, status chip, theme toggle, selection state |
| `BottomSheet.jsx` | Mobile peek/half/full sheet (drag, fling, keyboard); desktop uses a left side panel instead |
| `PanelContent.jsx` | Alerts / Hazards / Camps lists, detail cards, capacity bars, Directions and Call actions |
| `DistrictLayer.jsx` | District polygons (status colour + pulse) and zoom-revealed name labels |
| `FeatureMarkers.jsx` | Viewport-culled, screen-space clustered hazard and camp markers (44 px touch targets) |
| `UpazilaLayer.jsx` | Optional upazila outlines/labels from `/data/bangladesh-upazilas.geojson` (not bundled; skipped if absent) |

**Zoom reveal** (relative to the zoom that fits Bangladesh, so phones and desktops behave alike): hazards always (clustered until +1.5), district names +1, relief camps clustered +1.5 and individual +3, upazilas +2 (labels +3.5).

**Data**
- `GET /api/map-features` serves hotspots and camps. Admins publish with `PUT /api/admin/map-features` (Bearer token; strict validation, UTC offsets required).
- Without the API the app uses its last saved copy, then `public/data/map-features.demo.json`, which is flagged DEMO in the UI.
- Shape: see `shared/map-features.js` (`hotspots[]`: id, name, lat, lon, severity danger|warning|caution; `camps[]`: id, name, lat, lon, capacity, occupancy, status open|full|closed, facilities, phone).

```bash
curl -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"hotspots":[{"id":"h1","name":"River overflow","lat":25.07,"lon":91.40,"severity":"danger","updatedAt":"2026-11-08T10:00:00+06:00"}],
       "camps":[{"id":"c1","name":"Govt. High School shelter","lat":25.07,"lon":91.39,"capacity":400,"occupancy":120,"status":"open","facilities":["water","medical"],"updatedAt":"2026-11-08T10:00:00+06:00"}]}' \
  http://localhost:3000/api/admin/map-features
```

**Tiles**: CARTO Dark Matter / light basemaps via `MAP_CONFIG` in `src/config.js`. Tiles you have already viewed are cached by the service worker; district polygons always work offline. For guaranteed offline coverage, self-host tiles (e.g. PMTiles) and change the URL. Keep the OpenStreetMap/CARTO attribution and check their usage terms before heavy traffic.
