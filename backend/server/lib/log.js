// Tiny structured logger. Never pass SDPs, coordinates or payment identifiers as fields.
export function log(level, msg, fields = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}
