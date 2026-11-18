import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "./api";

const CACHE_KEY = "bd-district-alerts-v1";
const read = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch { /* storage full/private */ } };

/**
 * Polls /api/alerts (ETag/304 keeps 2G payloads tiny) and falls back to the last cached copy offline.
 * Returns statusByDistrict ready for <CommandMap />, with stale/offline data clearly labelled.
 */
export function useDistrictAlerts({ pollMs = 60_000 } = {}) {
  const [data, setData] = useState(() => read());
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let timer;
    const ctrl = new AbortController();
    async function load() {
      try {
        const r = await fetch(apiUrl("/api/alerts"), { signal: ctrl.signal });
        if (!r.ok) throw new Error(String(r.status));
        const json = await r.json();
        setData(json); write(json); setOffline(false);
      } catch (e) {
        if (e.name !== "AbortError") setOffline(true);
      }
      timer = setTimeout(load, pollMs);
    }
    const kick = () => { clearTimeout(timer); load(); };
    load();
    window.addEventListener("online", kick);
    const onVisible = () => document.visibilityState === "visible" && kick();
    document.addEventListener("visibilitychange", onVisible);
    return () => { ctrl.abort(); clearTimeout(timer); window.removeEventListener("online", kick); document.removeEventListener("visibilitychange", onVisible); };
  }, [pollMs]);

  const statusByDistrict = useMemo(() => {
    const out = {};
    const metaStale = data?.meta?.stale || offline;
    const when = data?.meta?.lastSuccessAt ? new Date(data.meta.lastSuccessAt).toLocaleString() : "unknown time";
    for (const [name, e] of Object.entries(data?.statuses || {})) {
      out[name] = metaStale || e.stale
        ? { ...e, message: `[OLD DATA — last confirmed ${when}] ${e.message}` }
        : e;
    }
    return out;
  }, [data, offline]);

  return { statusByDistrict, meta: data?.meta ?? null, offline, loaded: data !== null };
}
