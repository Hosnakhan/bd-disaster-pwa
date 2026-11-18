import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttributionControl, MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { Maximize, LocateFixed, Minus, Moon, Plus, Sun } from "lucide-react";
import "leaflet/dist/leaflet.css";
import "../../styles/map.css";
import { DISTRICT_GEOJSON_URL, MAP_CONFIG } from "../../config";
import { STATUS, statusForDistrict } from "../../lib/districtStatus";
import { SEVERITY_RANK, distanceKm, timeAgo } from "../../lib/mapGeo";
import { useMapFeatures } from "../../lib/useMapFeatures";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useUserLocation } from "../../lib/useUserLocation";
import BottomSheet, { PEEK_HEIGHT, sheetVisible } from "./BottomSheet";
import DistrictLayer from "./DistrictLayer";
import FeatureMarkers from "./FeatureMarkers";
import PanelContent, { PeekSummary } from "./PanelContent";
import UpazilaLayer from "./UpazilaLayer";
import { userIcon } from "./icons";

const BLANK_TILE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // keeps offline tiles invisible, not broken-image icons
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const TOP_INSET = 112; // status row + layer chips

function useGeojson() {
  const [state, setState] = useState({ geojson: null, error: false });
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(DISTRICT_GEOJSON_URL, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((geojson) => setState({ geojson, error: false }))
      .catch((e) => e.name !== "AbortError" && setState({ geojson: null, error: true }));
    return () => ctrl.abort();
  }, []);
  return state;
}

/** Bridges Leaflet events into React state without re-rendering on every pan frame. */
function MapBridge({ onMap, onZoomInfo, onBackground, userMovedRef, rootRef }) {
  const map = useMap();
  const bg = useRef(onBackground);
  bg.current = onBackground;
  useEffect(() => {
    onMap(map);
    const el = map.getContainer();
    const mark = () => { userMovedRef.current = true; };
    const zoomEnd = () => onZoomInfo(map.getZoom());
    const start = () => rootRef.current?.classList.add("cm-moving");
    const end = () => rootRef.current?.classList.remove("cm-moving");
    const click = () => bg.current();
    el.addEventListener("pointerdown", mark, { passive: true });
    el.addEventListener("wheel", mark, { passive: true });
    map.on("zoomend", zoomEnd); map.on("movestart zoomstart", start); map.on("moveend zoomend", end); map.on("click", click);
    return () => {
      el.removeEventListener("pointerdown", mark); el.removeEventListener("wheel", mark);
      map.off("zoomend", zoomEnd); map.off("movestart zoomstart", start); map.off("moveend zoomend", end); map.off("click", click);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

function UserLayer({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (!pos) return undefined;
    const g = L.layerGroup().addTo(map);
    if (pos.accuracy && pos.accuracy < 3000) {
      L.circle([pos.lat, pos.lon], { radius: pos.accuracy, color: "#3b82f6", weight: 1, fillColor: "#3b82f6", fillOpacity: 0.12, interactive: false }).addTo(g);
    }
    L.marker([pos.lat, pos.lon], { icon: userIcon(), interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(g);
    return () => g.remove();
  }, [map, pos]);
  return null;
}

export default function CommandMap({ statusByDistrict, alertMeta, alertsOffline, alertsLoaded, headerActions }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const features = useMapFeatures();
  const { geojson, error: geoError } = useGeojson();
  const loc = useUserLocation();

  const rootRef = useRef(null);
  const focusDistrictRef = useRef(null);
  const userMoved = useRef(false);
  const [map, setMap] = useState(null);
  const [H, setH] = useState(0);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("bd-map-theme") === "dark" ? "dark" : "light"; } catch { return "light"; } });
  const [layers, setLayers] = useState({ districts: true, hotspots: true, camps: true });
  const [selected, setSelected] = useState(null); // { kind, id }
  const [tab, setTab] = useState("alerts");
  const [snap, setSnap] = useState("peek");
  const [zoomInfo, setZoomInfo] = useState({ zoom: 7, base: 7 });
  const [toast, setToast] = useState("");

  // ----- measurements -----
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setH(Math.round(el.clientHeight)));
    ro.observe(el);
    setH(Math.round(el.clientHeight));
    return () => ro.disconnect();
  }, []);

  const live = useRef({});
  live.current = { isDesktop, snap, H };
  /** Pixels covered by overlays, so the map centres things in the visible area. */
  const insetsFor = useCallback((snapName) => {
    const { isDesktop: d, snap: s, H: h } = live.current;
    return {
      top: TOP_INSET, left: 16, right: d ? 72 : 16,
      bottom: d ? 16 : sheetVisible(snapName ?? s, h) + 12
    };
  }, []);
  const getInsets = useCallback(() => insetsFor(), [insetsFor]);

  // ----- fit Bangladesh + minimum zoom -----
  const fitCountry = useCallback((animate, moveView = true) => {
    if (!map) return;
    const d = live.current.isDesktop;
    const ins = { top: TOP_INSET, left: 16, right: d ? 72 : 16, bottom: d ? 16 : PEEK_HEIGHT + 12 };
    map.invalidateSize({ pan: false });
    const bounds = L.latLngBounds(MAP_CONFIG.boundsBD);
    const z = map.getBoundsZoom(bounds, false, L.point(ins.left + ins.right, ins.top + ins.bottom));
    if (!Number.isFinite(z) || z <= 0) return;
    map.setMinZoom(z);
    if (moveView) {
      map.fitBounds(bounds, { paddingTopLeft: [ins.left, ins.top], paddingBottomRight: [ins.right, ins.bottom], animate: !!animate && !reducedMotion(), duration: 0.8 });
    }
    setZoomInfo({ zoom: map.getZoom(), base: z });
  }, [map]);

  useEffect(() => { // initial fit, and refit on resize/rotation until the user starts exploring
    if (!map || !H) return;
    fitCountry(false, !userMoved.current);
  }, [map, H, isDesktop, fitCountry]);

  const focusPoint = useCallback((lat, lon, minZoom, snapName) => {
    if (!map) return;
    const ins = insetsFor(snapName);
    const z = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), minZoom));
    const pt = map.project([lat, lon], z);
    const center = map.unproject(pt.subtract([(ins.left - ins.right) / 2, (ins.top - ins.bottom) / 2]), z);
    userMoved.current = true;
    map.flyTo(center, z, { animate: !reducedMotion(), duration: 0.8 });
  }, [map, insetsFor]);

  // ----- derived data -----
  const userPos = loc.pos;
  const hotspots = useMemo(() => features.hotspots
    .map((h) => ({ ...h, distanceKm: userPos ? distanceKm(userPos, h) : null }))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.name.localeCompare(b.name)), [features.hotspots, userPos]);
  const camps = useMemo(() => features.camps
    .map((c) => ({ ...c, distanceKm: userPos ? distanceKm(userPos, c) : null }))
    .sort((a, b) => (userPos ? a.distanceKm - b.distanceKm : a.name.localeCompare(b.name))), [features.camps, userPos]);

  const districtAlerts = useMemo(() => Object.keys(statusByDistrict || {})
    .map((name) => statusForDistrict({ name }, statusByDistrict))
    .filter((d) => d.status !== "unknown")
    .sort((a, b) => SEVERITY_RANK[b.status] - SEVERITY_RANK[a.status] || a.name.localeCompare(b.name)), [statusByDistrict]);
  const counts = useMemo(() => districtAlerts.reduce((m, d) => ({ ...m, [d.status]: (m[d.status] || 0) + 1 }), {}), [districtAlerts]);

  const selectedView = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "district") {
      const data = statusForDistrict({ name: selected.id }, statusByDistrict);
      return { ...selected, data, title: data.name, badge: data.label, badgeKey: data.status };
    }
    if (selected.kind === "hotspot") {
      const data = hotspots.find((h) => h.id === selected.id);
      return data && { ...selected, data, title: data.name, badge: data.severity, badgeKey: data.severity };
    }
    const data = camps.find((c) => c.id === selected.id);
    return data && { ...selected, data, title: data.name, badge: data.status, badgeKey: data.status };
  }, [selected, statusByDistrict, hotspots, camps]);

  const dataState = useMemo(() => {
    const when = alertMeta?.lastSuccessAt;
    if (alertMeta?.mock || features.demo) return { tone: "warn", title: "Demo data", sub: "Not official warnings" };
    if (!alertsLoaded) return { tone: "idle", title: "Loading alerts", sub: "Waiting for data" };
    if (alertsOffline) return { tone: "warn", title: "Offline", sub: `Showing saved alerts from ${timeAgo(when)}` };
    if (alertMeta?.stale) return { tone: "warn", title: "Old data", sub: `Last confirmed ${timeAgo(when)}` };
    return { tone: "live", title: "Live", sub: `Alerts updated ${timeAgo(when)}` };
  }, [alertMeta, alertsLoaded, alertsOffline, features.demo]);

  // ----- actions -----
  const expand = useCallback(() => setSnap((s) => (s === "peek" ? "half" : s)), []);
  const targetSnap = () => (live.current.isDesktop ? undefined : live.current.snap === "peek" ? "half" : live.current.snap);

  const pick = useCallback((kind, id) => {
    setSelected({ kind, id });
    setTab(kind === "district" ? "alerts" : kind === "hotspot" ? "hazards" : "camps");
    const target = targetSnap();
    expand();
    userMoved.current = true;
    if (kind === "district") { focusDistrictRef.current?.(id, insetsFor(target)); return; }
    const item = (kind === "hotspot" ? features.hotspots : features.camps).find((x) => x.id === id);
    if (item) focusPoint(item.lat, item.lon, zoomInfo.base + (kind === "camp" ? 3.5 : 2), target);
  }, [expand, features.hotspots, features.camps, focusPoint, insetsFor, zoomInfo.base]);

  const selectDistrict = useCallback((s) => pick("district", s.name), [pick]);

  const clearSelection = useCallback(() => setSelected(null), []);
  const background = useCallback(() => { setSelected(null); if (!live.current.isDesktop) setSnap("peek"); }, []);

  const locate = useCallback(async () => {
    const pos = await loc.locate();
    if (pos) focusPoint(pos.lat, pos.lon, zoomInfo.base + 3.5);
  }, [loc, focusPoint, zoomInfo.base]);

  useEffect(() => {
    const msg = { denied: "Location permission was denied.", insecure: "Location needs a secure (https) connection.", unsupported: "This device cannot provide location.", error: "Could not get your location. Try again outdoors." }[loc.status];
    if (!msg) return undefined;
    setToast(msg);
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [loc.status]);

  const toggleTheme = () => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; try { localStorage.setItem("bd-map-theme", n); } catch { /* private mode */ } return n; });
  const toggleLayer = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  const { zoom, base } = zoomInfo;
  const sheetPx = isDesktop || !H ? 0 : sheetVisible(snap, H);
  const showHint = layers.camps && features.camps.length > 0 && zoom < base + 1.5;
  const noticeText = toast || (geoError ? "District outlines could not be loaded." : "");

  const panel = (
    <PanelContent tab={tab} onTab={setTab} selected={selectedView} onClear={clearSelection}
      districtAlerts={districtAlerts} hotspots={hotspots} camps={camps}
      located={Boolean(userPos)} locating={loc.status === "locating"} onLocate={locate} onPick={pick} />
  );

  return (
    <div ref={rootRef} className="cm-root" data-theme={theme} style={{ "--sheet-h": `${sheetPx}px` }}>
      <div className="cm-mapwrap">
        <MapContainer
          className="cm-map" center={[23.7, 90.35]} zoom={7} minZoom={5} maxZoom={17}
          zoomControl={false} attributionControl={false}
          zoomSnap={0.5} zoomDelta={0.5} wheelPxPerZoomLevel={100} bounceAtZoomLimits={false}
          maxBounds={MAP_CONFIG.panBounds} maxBoundsViscosity={0.85} tapTolerance={20}
        >
          <MapBridge onMap={setMap} onZoomInfo={(z) => setZoomInfo((i) => (i.zoom === z ? i : { ...i, zoom: z }))}
            onBackground={background} userMovedRef={userMoved} rootRef={rootRef} />
          <TileLayer key={theme} url={MAP_CONFIG.tiles[theme].url} subdomains={MAP_CONFIG.subdomains} attribution={MAP_CONFIG.attribution}
            maxZoom={17} crossOrigin="anonymous" detectRetina={false} keepBuffer={1} updateWhenZooming={false} updateWhenIdle errorTileUrl={BLANK_TILE} />
          <AttributionControl position="bottomleft" prefix={false} />
          <DistrictLayer geojson={geojson} statusByDistrict={statusByDistrict} visible={layers.districts}
            selectedName={selectedView?.kind === "district" ? selectedView.id : null}
            onSelect={selectDistrict} zoom={zoom} base={base} getInsets={getInsets} focusRef={focusDistrictRef} theme={theme} />
          <UpazilaLayer visible={layers.districts} zoom={zoom} base={base} theme={theme} />
          <FeatureMarkers kind="camp" items={camps} visible={layers.camps} minZoom={base + 1.5} soloZoom={base + 3}
            selectedId={selected?.kind === "camp" ? selected.id : null} onSelect={pick} getInsets={getInsets} />
          <FeatureMarkers kind="hotspot" items={hotspots} visible={layers.hotspots} minZoom={0} soloZoom={base + 1.5}
            selectedId={selected?.kind === "hotspot" ? selected.id : null} onSelect={pick} getInsets={getInsets} />
          <UserLayer pos={userPos} />
        </MapContainer>

        <div className="cm-top">
          <div className="cm-row1">
            <div className="cm-status" data-tone={dataState.tone} role="status">
              <span className="cm-status-dot" />
              <span className="cm-status-text"><b>{dataState.title}</b><span>{dataState.sub}</span></span>
            </div>
            {headerActions}
          </div>
          <div className="cm-toggles" role="group" aria-label="Map layers">
            {[["districts", "Districts", "#64748b"], ["hotspots", "Hazards", "#ef4444"], ["camps", "Relief camps", "#22c55e"]].map(([k, label, c]) => (
              <button key={k} type="button" className="cm-toggle" style={{ "--tc": c }} aria-pressed={layers[k]} onClick={() => toggleLayer(k)}><i />{label}</button>
            ))}
          </div>
        </div>

        {noticeText && <div className="cm-toast" role="status">{noticeText}</div>}
        {showHint && <div className="cm-hint" role="note">Zoom in to see relief camps</div>}

        <div className="cm-ctrl" data-hidden={!isDesktop && snap === "full"}>
          <div className="cm-zoom">
            <button type="button" className="cm-btn" aria-label="Zoom in" onClick={() => map?.zoomIn()}><Plus size={22} /></button>
            <button type="button" className="cm-btn" aria-label="Zoom out" onClick={() => map?.zoomOut()}><Minus size={22} /></button>
          </div>
          <button type="button" className="cm-btn" aria-label="My location" disabled={loc.status === "locating"} onClick={locate}><LocateFixed size={22} /></button>
          <button type="button" className="cm-btn" aria-label="Show all of Bangladesh" onClick={() => { userMoved.current = false; fitCountry(true); }}><Maximize size={20} /></button>
          <button type="button" className="cm-btn" aria-label={theme === "dark" ? "Switch to sunlight map" : "Switch to dark map"} aria-pressed={theme === "light"} onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </div>

      {isDesktop ? (
        <aside className="cm-side" aria-label="Map details">
          <div className="cm-side-head"><PeekSummary selected={selectedView} counts={counts} /></div>
          <div className="cm-side-body">{panel}</div>
        </aside>
      ) : (
        <BottomSheet snap={snap} onSnapChange={setSnap} containerH={H} label="Map details"
          header={<PeekSummary selected={selectedView} counts={counts} />}>
          {panel}
        </BottomSheet>
      )}
    </div>
  );
}
