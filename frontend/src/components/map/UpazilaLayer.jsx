import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { MAP_CONFIG } from "../../config";
import { labelIcon } from "./icons";

const nameOf = (p = {}) => p.ADM3_EN || p.adm3_en || p.upazila || p.UPAZILA || p.name || "";

/**
 * Optional upazila boundaries/labels. The file is NOT bundled; if /data/bangladesh-upazilas.geojson is
 * absent this layer silently does nothing. Loaded lazily, only once the user has zoomed in far enough.
 */
export default function UpazilaLayer({ visible, zoom, base, theme = "light" }) {
  const map = useMap();
  const [data, setData] = useState(null);
  const tried = useRef(false);
  const wanted = visible && zoom >= base + 2;

  useEffect(() => {
    if (!wanted || tried.current) return undefined;
    tried.current = true;
    const ctrl = new AbortController();
    fetch(MAP_CONFIG.upazilaUrl, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.features && setData(j))
      .catch(() => {});
    return () => ctrl.abort();
  }, [wanted]);

  useEffect(() => {
    if (!data || !wanted) return undefined;
    const outline = L.geoJSON(data, {
      renderer: L.canvas({ padding: 0.2 }), interactive: false,
      style: theme === "dark" ? { color: "#cbd5e1", weight: 0.7, opacity: 0.4, fill: false } : { color: "#5B5F66", weight: 0.8, opacity: 0.45, fill: false }
    }).addTo(map);
    const centers = [];
    outline.eachLayer((l) => {
      const b = l.getBounds();
      const name = nameOf(l.feature.properties);
      if (name) centers.push({ name, center: b.getCenter(), lonSpan: b.getEast() - b.getWest() });
    });
    const labels = L.layerGroup().addTo(map);
    let raf = 0;
    const draw = () => {
      raf = 0;
      labels.clearLayers();
      const z = map.getZoom();
      if (z < base + 3.5) return;
      const view = map.getBounds();
      const pxPerDeg = (256 * 2 ** z) / 360;
      let n = 0;
      for (const c of centers) {
        if (n > 60) break;
        if (c.lonSpan * pxPerDeg < 70 || !view.contains(c.center)) continue;
        L.marker(c.center, { icon: labelIcon(c.name, "dl-up"), interactive: false, keyboard: false }).addTo(labels); n++;
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
    map.on("moveend zoomend", schedule);
    schedule();
    return () => { map.off("moveend zoomend", schedule); cancelAnimationFrame(raf); labels.remove(); outline.remove(); };
  }, [map, data, wanted, base, theme]);

  return null;
}
