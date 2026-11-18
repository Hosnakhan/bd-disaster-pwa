import { useCallback, useState } from "react";

/** One-shot geolocation on user tap (never prompts on load). */
export function useUserLocation() {
  const [state, setState] = useState({ pos: null, status: "idle" });
  const locate = useCallback(() => new Promise((resolve) => {
    if (!("geolocation" in navigator)) { setState((s) => ({ ...s, status: "unsupported" })); return resolve(null); }
    if (!window.isSecureContext) { setState((s) => ({ ...s, status: "insecure" })); return resolve(null); }
    setState((s) => ({ ...s, status: "locating" }));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        setState({ pos, status: "ok" });
        resolve(pos);
      },
      (err) => { setState((s) => ({ ...s, status: err.code === 1 ? "denied" : "error" })); resolve(null); },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 }
    );
  }), []);
  return { ...state, locate };
}
