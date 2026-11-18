import { canonicalDistrict } from "./districts.js";

const PROVIDERS = ["bkash", "nagad", "rocket"];
const TRX = /^[A-Z0-9]{5,24}$/;
const MAX_AMOUNT_BDT = 10_000_000;

/** Validates a donor-submitted TrxID report. Everything stored here came from an anonymous user. */
export function validateSubmission(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "invalid-payload" };

  const provider = String(body.provider ?? "").trim().toLowerCase();
  if (!PROVIDERS.includes(provider)) return { error: "invalid-provider" };

  const trxId = String(body.trxId ?? body.trxID ?? "").trim().toUpperCase();
  if (!TRX.test(trxId)) return { error: "invalid-trxid" };

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT_BDT) return { error: "invalid-amount" };

  const phoneRaw = String(body.senderPhone ?? "").replace(/[\s-]/g, "");
  if (phoneRaw && !/^\+?\d{6,15}$/.test(phoneRaw)) return { error: "invalid-phone" };

  return {
    value: {
      provider,
      trxId,
      amount: Math.round(amount * 100) / 100,
      senderPhone: phoneRaw || null,
      district: canonicalDistrict(body.district) // unknown/blank -> null; free text is never stored
    }
  };
}
