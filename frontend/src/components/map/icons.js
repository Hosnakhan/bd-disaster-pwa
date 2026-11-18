import L from "leaflet";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cache = new Map();
const memo = (key, build) => { let v = cache.get(key); if (!v) { v = build(); cache.set(key, v); } return v; };

const WARN = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 4 3 20h18L12 4Z" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/><path d="M12 10v4.2" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.4" fill="#fff"/></svg>`;
export const TENT_SVG = (size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M2.5 20 12 4l9.5 16Z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M9.2 20 12 14.5l2.8 5.5Z" fill="#fff" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

const BASE = { className: "cm-icon", iconSize: [44, 44], iconAnchor: [22, 22] };

export const hotspotIcon = (severity, selected) =>
  memo(`h:${severity}:${selected}`, () => L.divIcon({
    ...BASE,
    html: `<div class="hz hz-${severity}${selected ? " hz-selected" : ""}"><span class="hz-ring"></span><span class="hz-ring hz-ring2"></span><span class="hz-core">${WARN}</span></div>`
  }));

export const campIcon = (status, selected) =>
  memo(`c:${status}:${selected}`, () => L.divIcon({
    ...BASE,
    html: `<div class="cp cp-${status}${selected ? " cp-selected" : ""}"><span class="cp-pin">${TENT_SVG()}</span>${
      status === "full" ? '<span class="cp-tag">FULL</span>' : status === "closed" ? '<span class="cp-tag cp-tag-closed">CLOSED</span>' : ""}</div>`
  }));

export const clusterIcon = (kind, count, severity = "danger") =>
  memo(`k:${kind}:${count}:${severity}`, () => L.divIcon({
    ...BASE,
    html: `<div class="cl ${kind === "camp" ? "cl-camp" : "cl-hot"}" data-s="${esc(severity)}">${count > 99 ? "99+" : count}</div>`
  }));

export const labelIcon = (text, cls = "") =>
  memo(`l:${cls}:${text}`, () => L.divIcon({ className: "cm-icon", html: `<div class="dl ${cls}">${esc(text)}</div>`, iconSize: [0, 0] }));

export const userIcon = () =>
  memo("u", () => L.divIcon({ className: "cm-icon", html: '<div class="ud"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }));
