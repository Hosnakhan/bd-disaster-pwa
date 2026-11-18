import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiBase = (env.VITE_API_BASE_URL || "").trim();
  const siteUrl = (env.VITE_SITE_URL || "").trim().replace(/\/+$/, "");
  if (siteUrl) {
    let parsedSiteUrl;
    try { parsedSiteUrl = new URL(siteUrl); } catch { throw new Error("VITE_SITE_URL must be an absolute HTTPS URL."); }
    if (parsedSiteUrl.protocol !== "https:" || parsedSiteUrl.origin !== siteUrl) {
      throw new Error("VITE_SITE_URL must be an origin-only HTTPS URL, e.g. https://example.com (no path or trailing slash).");
    }
  }

  // A production build without an API URL would silently call the static host itself
  // (Vercel/Netlify answer unknown paths with index.html), so the app would look "offline" forever. Fail loudly.
  if (mode === "production" && !apiBase && env.VITE_SAME_ORIGIN_API !== "true") {
    throw new Error(
      "VITE_API_BASE_URL is not set. Set it to your backend URL (e.g. https://bd-disaster-api.onrender.com) " +
      "in your hosting dashboard, or set VITE_SAME_ORIGIN_API=true for a LAN node that serves this build itself."
    );
  }
  if (apiBase && !/^https?:\/\/[^/]+/i.test(apiBase)) {
    throw new Error(`VITE_API_BASE_URL must be an absolute URL such as https://api.example.com (got "${apiBase}").`);
  }
  if (mode === "production" && apiBase.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(apiBase)) {
    throw new Error("VITE_API_BASE_URL must use HTTPS in production; plain HTTP causes mixed-content failures.");
  }

  // GitHub Pages serves a project site from /<repo-name>/. The deploy workflow sets VITE_BASE_PATH accordingly.
  // Default "/" = identical behaviour to before (Vercel, LAN node, local dev).
  let base = (env.VITE_BASE_PATH || "/").trim();
  if (!base.startsWith("/")) base = `/${base}`;
  if (!base.endsWith("/")) base = `${base}/`;

  const devTarget = env.VITE_DEV_API_TARGET || "http://localhost:3000";
  const siteMetadataPlugin = {
    name: "site-metadata",
    transformIndexHtml(html) {
      if (!siteUrl) return html;
      const canonical = `<link rel="canonical" href="${siteUrl}/" />`;
      const ogUrl = `<meta property="og:url" content="${siteUrl}/" />`;
      return html.replace("<!-- SITE_CANONICAL -->", `${canonical}\n    ${ogUrl}`);
    }
  };

  return {
    base,
    plugins: [
      react(),
      siteMetadataPlugin,
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["data/bangladesh-districts.geojson"],
        manifest: {
          name: "Bangladesh Disaster Response",
          short_name: "BD Response",
          description: "Offline-first district alerts, community relay and emergency support.",
          theme_color: "#F76806",
          background_color: "#FAF6EC",
          display: "standalone",
          start_url: base,
          scope: base,
          icons: [
            { src: `${base}pwa-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
            { src: `${base}pwa-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
            { src: `${base}pwa-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" }
          ]
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,webp,geojson,json}"],
          // Optional, large: cached at runtime on first use instead of slowing down the first install on 2G.
          globIgnores: ["**/bangladesh-upazilas.geojson"],
          // API and websocket traffic must never be answered with the cached app shell.
          // (The API is cross-origin in production, so the service worker never sees it; this guards dev/LAN mode.)
          navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/healthz/],
          runtimeCaching: [
            {
              // Basemap tiles: whatever the user has already looked at keeps working offline.
              urlPattern: ({ url }) => url.hostname.endsWith("basemaps.cartocdn.com"),
              handler: "CacheFirst",
              options: {
                cacheName: "bd-map-tiles-v1",
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
                cacheableResponse: { statuses: [200] }
              }
            },
            {
              urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.endsWith(".geojson"),
              handler: "CacheFirst",
              options: {
                cacheName: "bd-district-geojson-v1",
                expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        }
      })
    ],
    build: { target: "es2019", sourcemap: false },
    server: {
      host: true,
      // Development only: with VITE_API_BASE_URL empty, /api and /socket.io are proxied to the local backend (`npm run dev` in /backend).
      proxy: {
        "/api": devTarget,
        "/socket.io": { target: devTarget, ws: true }
      }
    }
  };
});
