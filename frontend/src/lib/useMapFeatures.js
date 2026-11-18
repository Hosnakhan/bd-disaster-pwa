import { useEffect, useState } from "react";
import { normalizeMapFeatures } from "./mapFeatures.js";
import { MAP_CONFIG } from "../config";

const CACHE_KEY = "bd-map-features-v1";
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } };
const writeCache = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch { /* storage full/private */ } };

function parse(json) {
  const { hotspots, camps, demo } = normalizeMapFeatures(json);
  return { hotspots, camps, demo, updatedAt: json?.meta?.updatedAt ?? null };
}

/** Hotspots + relief camps: live API -> last saved copy -> bundled demo (clearly flagged). */
export function useMapFeatures({ pollMs = 120_000 } = {}) {
  const [data, setData] = useState(() => { const c = readCache(); return c ? parse(c) : null; });
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let timer;
    const ctrl = new AbortController();
    async function load() {
      try {
        const r = await fetch(MAP_CONFIG.featuresUrl, { signal: ctrl.signal, cache: "no-cache" });
        if (!r.ok) throw new Error(String(r.status));
        const json = await r.json();
        writeCache(json); setData(parse(json)); setOffline(false);
      } catch (e) {
        if (e.name === "AbortError") return;
        setOffline(true);
        setData((cur) => cur); // keep whatever we have
        if (!readCache()) {
          try {
            const d = await fetch(MAP_CONFIG.demoFeaturesUrl, { signal: ctrl.signal });
            if (d.ok) {
  const jsonData = await d.json();
  setData((cur) => cur ?? parse({ ...jsonData, meta: { demo: true } }));
}
          } catch { /* no demo data either */ }
        }
      }
      timer = setTimeout(load, pollMs);
    }
    const kick = () => { clearTimeout(timer); load(); };
    load();
    window.addEventListener("online", kick);
    return () => { ctrl.abort(); clearTimeout(timer); window.removeEventListener("online", kick); };
  }, [pollMs]);

  return {
    hotspots: data?.hotspots ?? [], camps: data?.camps ?? [],
    demo: data?.demo === true, updatedAt: data?.updatedAt ?? null,
    offline, loaded: data !== null
  };
}
