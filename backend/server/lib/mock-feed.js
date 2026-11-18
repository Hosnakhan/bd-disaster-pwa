// DEV/DEMO ONLY. Mimics a DDM-style feed so the map and ingestion can be exercised end to end.
export function mockFeed(now = Date.now()) {
  const iso = (ms) => new Date(now + ms).toISOString(); // UTC "Z" suffix = explicit offset
  const H = 3_600_000;
  const a = (district, level, headline) => ({
    district, level, headline: `MOCK: ${headline}`, issuer: "MOCK-DDM",
    issuedAt: iso(-0.5 * H), validUntil: iso(12 * H), url: "https://example.org/mock-alert"
  });
  return {
    issuer: "MOCK-DDM",
    alerts: [
      a("Sunamganj", "RED", "River above danger level (demo data)"),
      a("Kurigram", "ORANGE", "Rising water expected (demo data)"),
      a("Sylhet", "YELLOW", "Heavy rain forecast (demo data)"),
      a("Dhaka", "GREEN", "No active warning (demo data)")
    ]
  };
}
