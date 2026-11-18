import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { clusterPoints } from "../../lib/cluster";
import { SEVERITY_RANK } from "../../lib/mapGeo";
import { campIcon, clusterIcon, hotspotIcon } from "./icons";

const CAN_HOVER = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/**
 * Imperatively managed markers for one feature kind. Only items inside the (padded) viewport are drawn,
 * clustered below `soloZoom`, and the layer is rebuilt once per moveend/zoomend inside requestAnimationFrame.
 * Markers are 44px touch targets (the visible glyph is smaller).
 */
export default function FeatureMarkers({ kind, items, visible, minZoom, soloZoom, selectedId, onSelect, getInsets }) {
  const map = useMap();

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    let raf = 0;

    const draw = () => {
      raf = 0;
      group.clearLayers();
      const z = map.getZoom();
      if (!visible || z < minZoom) return;

      const view = map.getBounds().pad(0.3);
      const inView = items.filter((i) => view.contains([i.lat, i.lon]));
      const solo = z >= soloZoom;
      const nodes = solo
        ? inView.map((item) => ({ type: "item", item }))
        : clusterPoints(inView, (lat, lon) => map.project([lat, lon], z), 56);

      for (const n of nodes) {
        if (n.type === "cluster") {
          const sev = kind === "hotspot"
            ? n.items.reduce((b, i) => (SEVERITY_RANK[i.severity] > SEVERITY_RANK[b] ? i.severity : b), "caution")
            : undefined;
          const m = L.marker([n.lat, n.lon], {
            icon: clusterIcon(kind, n.count, sev), keyboard: true, title: `${n.count} ${kind === "camp" ? "relief camps" : "hazard areas"} — zoom in`,
            alt: `${n.count} ${kind === "camp" ? "relief camps" : "hazard areas"}`, bubblingMouseEvents: false, zIndexOffset: kind === "hotspot" ? 500 : 0
          });
          m.on("click", () => {
            const ins = getInsets();
            map.flyToBounds(L.latLngBounds(n.items.map((i) => [i.lat, i.lon])), {
              paddingTopLeft: [ins.left + 24, ins.top + 24], paddingBottomRight: [ins.right + 24, ins.bottom + 24],
              maxZoom: Math.min(map.getMaxZoom(), Math.max(soloZoom + 0.5, z + 2)), duration: 0.6
            });
          });
          m.addTo(group);
        } else {
          const it = n.item;
          const sel = it.id === selectedId;
          const m = L.marker([it.lat, it.lon], {
            icon: kind === "hotspot" ? hotspotIcon(it.severity, sel) : campIcon(it.status, sel),
            keyboard: true, title: it.name, alt: it.name, bubblingMouseEvents: false,
            zIndexOffset: sel ? 1000 : kind === "hotspot" ? 500 : 0
          });
          if (CAN_HOVER) m.bindTooltip(it.name, { direction: "top", offset: [0, -18] });
          m.on("click", () => onSelect(kind, it.id));
          m.addTo(group);
        }
      }
    };

    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
    map.on("moveend zoomend", schedule);
    schedule();
    return () => { map.off("moveend zoomend", schedule); cancelAnimationFrame(raf); group.remove(); };
  }, [map, kind, items, visible, minZoom, soloZoom, selectedId, onSelect, getInsets]);

  return null;
}
