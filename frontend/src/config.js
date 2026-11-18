import { apiUrl } from "./lib/api";

// Replace with values verified for your registered relief organization.
// Never commit private wallet numbers, API keys, or payment credentials to source control.
export const paymentConfig = {
  bkash: {
    enabled: false,
    label: "bKash",
    merchantNumber: "",
    personalNumber: "",
    appDeepLink: "", // Configure only from a provider-approved integration/documentation.
    ussd: "*247#",
    qrImageUrl: "" // Use the QR supplied for this exact verified merchant account.
  },
  nagad: {
    enabled: false,
    label: "Nagad",
    merchantNumber: "",
    personalNumber: "",
    appDeepLink: "",
    ussd: "", // Set only after validating the current code with Nagad.
    qrImageUrl: ""
  },
  // Optional verified HTTPS payment page. Prefer provider checkout APIs on the server.
  donationLandingUrl: ""
};

// BASE_URL is "/" by default, or "/<repo-name>/" on a GitHub Pages project site (set at build time).
const BASE = import.meta.env.BASE_URL;
export const DISTRICT_GEOJSON_URL = `${BASE}data/bangladesh-districts.geojson`;

// Map UI. Tiles are third-party (CARTO/OpenStreetMap): keep the attribution, respect their usage terms,
// and switch to self-hosted tiles (e.g. PMTiles) before heavy production traffic.
export const MAP_CONFIG = {
  boundsBD: [[20.55, 87.95], [26.75, 92.75]],      // fitted on load; also the minimum zoom
  panBounds: [[19.6, 87.0], [27.6, 93.6]],         // soft pan limit
  tiles: {
    dark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", label: "Dark" },
    light: { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", label: "Sunlight" }
  },
  tileHost: "basemaps.cartocdn.com",
  subdomains: "abcd",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  featuresUrl: apiUrl("/api/map-features"),
  demoFeaturesUrl: `${BASE}data/map-features.demo.json`,
  upazilaUrl: `${BASE}data/bangladesh-upazilas.geojson` // optional file, not bundled
};
