import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { STATUS, normalizeDistrictName, statusForDistrict } from "../../lib/districtStatus";
import { labelIcon } from "./icons";

const CAN_HOVER = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;
const CLASSES = ["district-danger", "district-warning", "district-caution", "district-safe", "district-unknown"];

function styleFor(feature, statusByDistrict, selectedName, theme) {
  const light = theme !== "dark";
  const s = statusForDistrict(feature.properties, statusByDistrict);
  const known = s.status !== "unknown";
  const selected = selectedName && normalizeDistrictName(s.name) === normalizeDistrictName(selectedName);
  return {
    s,
    style: {
      color: selected ? (light ? "#101820" : "#ffffff") : known ? STATUS[s.status].color : light ? "#7d828a" : "#7b8ca0",
      weight: selected ? 3 : known ? 1.6 : 0.9,
      opacity: selected ? 1 : known ? 0.95 : 0.55,
      fillColor: STATUS[s.status].fill,
      fillOpacity: s.status === "danger" ? 0.4 : known ? 0.3 : 0.05,
      lineJoin: "round"
    }
  };
}

/**
 * District polygons (SVG renderer: CSS pulse classes need real DOM paths) plus zoom-revealed name labels.
 * The geometry is built once; status changes only restyle existing paths.
 */
export default function DistrictLayer({ geojson, statusByDistrict, selectedName, onSelect, visible, zoom, base, getInsets, focusRef, theme = "light" }) {
  const map = useMap();
  const layerRef = useRef(null);
  const labelRef = useRef(null);
  const centersRef = useRef([]);
  const latest = useRef({});
  latest.current = { statusByDistrict, selectedName, onSelect, getInsets, theme };

  const restyle = () => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.eachLayer((l) => {
      const { s, style } = styleFor(l.feature, latest.current.statusByDistrict, latest.current.selectedName, latest.current.theme);
      l.setStyle(style);
      const el = l.getElement?.();
      if (el) { el.classList.remove(...CLASSES); el.classList.add(`district-${s.status}`, "district-shape"); }
      if (latest.current.selectedName && normalizeDistrictName(s.name) === normalizeDistrictName(latest.current.selectedName)) l.bringToFront();
    });
  };

  // geometry: once per geojson
  useEffect(() => {
    if (!geojson) return undefined;
    const boundsByName = new Map();
    const layer = L.geoJSON(geojson, {
      renderer: L.svg({ padding: 0.3 }),
      bubblingMouseEvents: false,
      onEachFeature: (feature, l) => {
        const name = statusForDistrict(feature.properties, {}).name;
        if (name) boundsByName.set(normalizeDistrictName(name), l);
        l.on("click", () => {
          latest.current.onSelect(statusForDistrict(feature.properties, latest.current.statusByDistrict));
        });
        if (CAN_HOVER) l.bindTooltip(name || "District", { sticky: true });
      }
    });
    layerRef.current = layer;
    centersRef.current = [];
    layer.eachLayer((l) => {
      const b = l.getBounds();
      const name = statusForDistrict(l.feature.properties, {}).name;
      if (name) centersRef.current.push({ name, center: b.getCenter(), lonSpan: b.getEast() - b.getWest() });
    });
    if (focusRef) {
      focusRef.current = (districtName, insets) => {
        const l = boundsByName.get(normalizeDistrictName(districtName));
        if (!l) return;
        const ins = insets ?? latest.current.getInsets();
        map.flyToBounds(l.getBounds(), {
          paddingTopLeft: [ins.left + 16, ins.top + 16], paddingBottomRight: [ins.right + 16, ins.bottom + 16], maxZoom: 9.5, duration: 0.7, animate: !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)
        });
      };
    }
    layer.addTo(map);
    restyle();
    return () => { layer.remove(); layerRef.current = null; if (focusRef) focusRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, map]);

  // visibility
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (visible && !map.hasLayer(layer)) { layer.addTo(map); restyle(); }
    if (!visible && map.hasLayer(layer)) layer.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, geojson]);

  // status / selection changes: restyle only
  useEffect(restyle, [statusByDistrict, selectedName, geojson, visible, theme]);

  // name labels: revealed with zoom, only for districts big enough on screen, only inside the viewport
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    labelRef.current = group;
    let raf = 0;
    const draw = () => {
      raf = 0;
      group.clearLayers();
      const z = map.getZoom();
      if (!visible || z < base + 1) return;
      const view = map.getBounds();
      const pxPerDeg = (256 * 2 ** z) / 360;
      for (const c of centersRef.current) {
        if (c.lonSpan * pxPerDeg < 64 || !view.contains(c.center)) continue;
        const st = statusForDistrict({ name: c.name }, statusByDistrict).status;
        L.marker(c.center, { icon: labelIcon(c.name, st !== "unknown" && st !== "safe" ? `dl-${st}` : ""), interactive: false, keyboard: false }).addTo(group);
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
    map.on("moveend zoomend", schedule);
    schedule();
    return () => { map.off("moveend zoomend", schedule); cancelAnimationFrame(raf); group.remove(); };
  }, [map, visible, base, zoom, statusByDistrict, geojson]);

  return null;
}
