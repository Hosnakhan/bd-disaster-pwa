/**
 * Strict CORS: the browser may only call this API from an origin listed in FRONTEND_URL / CORS_ORIGIN.
 * No wildcard, no reflection of arbitrary origins, no cookies (credentials are never enabled).
 * Requests without an Origin header (curl, webhooks, health checks) are not browser cross-origin calls
 * and pass through; they are protected by tokens/signatures, not by CORS.
 */
export function corsMiddleware(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return function cors(req, res, next) {
    res.vary("Origin");
    const origin = req.get("origin");
    if (!origin) return next();
    if (!allowed.has(origin)) {
      // Preflights from unknown origins are refused outright; simple requests get no CORS headers,
      // so the browser blocks the response from being read by the foreign page.
      return req.method === "OPTIONS" ? res.status(403).json({ error: "origin-not-allowed" }) : next();
    }
    res.set("Access-Control-Allow-Origin", origin);
    if (req.method === "OPTIONS") {
      res.set({
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,OPTIONS",
        "Access-Control-Allow-Headers": req.get("access-control-request-headers") || "Content-Type, Authorization",
        "Access-Control-Max-Age": "600"
      });
      return res.status(204).end();
    }
    next();
  };
}
