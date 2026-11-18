// Canonical list of Bangladesh's 64 districts (English, as used by the alert feed and the map).
// KEEP IN SYNC with frontend/src/lib/districts.js (the two files are intentionally identical;
// the frontend and backend deploy separately and must not import from each other).
export const DISTRICTS = Object.freeze([
  "Bagerhat", "Bandarban", "Barguna", "Barishal", "Bhola", "Bogura",
  "Brahmanbaria", "Chandpur", "Chapainawabganj", "Chattogram", "Chuadanga",
  "Cox's Bazar", "Cumilla", "Dhaka", "Dinajpur", "Faridpur", "Feni", "Gaibandha",
  "Gazipur", "Gopalganj", "Habiganj", "Jamalpur", "Jashore", "Jhalokati",
  "Jhenaidah", "Joypurhat", "Khagrachhari", "Khulna", "Kishoreganj",
  "Kurigram", "Kushtia", "Lakshmipur", "Lalmonirhat", "Madaripur", "Magura",
  "Manikganj", "Meherpur", "Moulvibazar", "Munshiganj", "Mymensingh", "Naogaon",
  "Narail", "Narayanganj", "Narsingdi", "Natore", "Netrokona", "Nilphamari",
  "Noakhali", "Pabna", "Panchagarh", "Patuakhali", "Pirojpur", "Rajbari",
  "Rajshahi", "Rangamati", "Rangpur", "Satkhira", "Shariatpur", "Sherpur",
  "Sirajganj", "Sunamganj", "Sylhet", "Tangail", "Thakurgaon"
]);

// Matching key: lower-case, letters/digits only. "Cox'S Bazar", "coxs bazar" and "Cox's  Bazar" collapse together.
const key = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

const BY_KEY = new Map(DISTRICTS.map((d) => [key(d), d]));

// Old names, transliteration variants and spellings seen in GADM / BBS / BAMIS / DDM data.
const ALIASES = {
  barisal: "Barishal", bogra: "Bogura", chittagong: "Chattogram", comilla: "Cumilla",
  jessore: "Jashore", jhalakati: "Jhalokati", jhalokathi: "Jhalokati", jhalakathi: "Jhalokati",
  khagrachari: "Khagrachhari", khagrachhari: "Khagrachhari",
  chapainawabganj: "Chapainawabganj", nawabganj: "Chapainawabganj",
  maulvibazar: "Moulvibazar", moulavibazar: "Moulvibazar", netrakona: "Netrokona",
  laxmipur: "Lakshmipur", lakshmipur: "Lakshmipur", joypurhat: "Joypurhat", jaipurhat: "Joypurhat",
  brahmanbaria: "Brahmanbaria", brahamanbaria: "Brahmanbaria",
  coxsbazar: "Cox's Bazar", coxbazar: "Cox's Bazar",
  kishorganj: "Kishoreganj", narsinghdi: "Narsingdi", munshigonj: "Munshiganj",
  hobiganj: "Habiganj", jenaidah: "Jhenaidah", lalmonirhat: "Lalmonirhat", lalmanirhat: "Lalmonirhat",
  patuakhali: "Patuakhali", rangmati: "Rangamati", dacca: "Dhaka"
};

/** Returns the canonical district name, or null when the input is not a recognised district. */
export function canonicalDistrict(name) {
  const k = key(name);
  if (!k) return null;
  return BY_KEY.get(k) ?? ALIASES[k] ?? null;
}
