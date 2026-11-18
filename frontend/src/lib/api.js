// Single place that knows where the backend lives.
// VITE_API_BASE_URL is inlined at BUILD time (Vercel: Project Settings -> Environment Variables, then redeploy).
// Empty string = same origin, which is what `npm run dev` uses (Vite proxies /api and /socket.io to the backend)
// and what an isolated LAN rescue node uses when it serves this build itself.
const raw = (import.meta.env.VITE_API_BASE_URL ?? "").trim();

export const API_BASE_URL = raw.replace(/\/+$/, "");

/** apiUrl("/api/alerts") -> "https://api.example.com/api/alerts" (or "/api/alerts" when same-origin). */
export const apiUrl = (path) => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
