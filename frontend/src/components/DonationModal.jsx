import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, ExternalLink, HeartHandshake, Phone, X } from "lucide-react";
import { paymentConfig } from "../config";
import TrxIdForm from "./TrxIdForm";

function copyText(value) {
  if (!value) return Promise.reject(new Error("No verified number configured."));
  return navigator.clipboard.writeText(value);
}

function PaymentProvider({ provider }) {
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [showQr, setShowQr] = useState(false);
  const configured = provider.enabled;
  const number = provider.merchantNumber || provider.personalNumber;
  const numberLabel = provider.merchantNumber ? "Verified merchant number" : "Verified personal number";

  async function copy(value, label) {
    try {
      await copyText(value);
      setCopied(label);
      setError("");
      window.setTimeout(() => setCopied(""), 1800);
    } catch (e) { setError(e.message); }
  }

  const appLink = useMemo(() => {
    const raw = provider.appDeepLink || "";
    // Do not allow arbitrary javascript:, data:, or remote untrusted schemes.
    return /^(bkash|nagad):\/\//i.test(raw) ? raw : "";
  }, [provider.appDeepLink]);

  return (
    <article className="rounded-2xl border border-milk-line bg-milk-2 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-black text-ink">{provider.label}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${configured ? "bg-emerald-700 text-white" : "border border-ink-muted bg-milk text-ink-muted"}`}>
          {configured ? "Configured" : "Not configured"}
        </span>
      </div>

      {configured ? (
        <>
          {provider.merchantNumber && (
            <>
              <p className="mt-3 text-sm font-semibold text-ink-muted">Verified merchant number</p>
              <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-ink p-3">
                <strong className="break-all text-xl tracking-wide text-milk">{provider.merchantNumber}</strong>
                <button onClick={() => copy(provider.merchantNumber, "merchant")} className="min-h-12 rounded-lg bg-brand px-3 font-bold text-ink active:bg-brand-press" aria-label={`Copy ${provider.label} merchant number`}>
                  <Copy size={20} />
                </button>
              </div>
            </>
          )}
          {provider.personalNumber && (
            <>
              <p className="mt-3 text-sm font-semibold text-ink-muted">Verified personal number</p>
              <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-ink p-3">
                <strong className="break-all text-xl tracking-wide text-milk">{provider.personalNumber}</strong>
                <button onClick={() => copy(provider.personalNumber, "personal")} className="min-h-12 rounded-lg bg-brand px-3 font-bold text-ink active:bg-brand-press" aria-label={`Copy ${provider.label} personal number`}>
                  <Copy size={20} />
                </button>
              </div>
            </>
          )}
          {!number && <p className="mt-3 text-sm font-semibold text-amber-900">No verified wallet number has been configured.</p>}
          {provider.ussd && (
            <a className="mt-3 flex min-h-14 items-center justify-center gap-2 rounded-xl bg-ink text-lg font-black text-milk" href={`tel:${encodeURIComponent(provider.ussd)}`}>
              <Phone size={20} /> Dial {provider.ussd}
            </a>
          )}
          {appLink && (
            <a className="mt-2 flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-ink bg-brand text-lg font-black text-ink active:bg-brand-press" href={appLink}>
              Open {provider.label} app <ExternalLink size={18} />
            </a>
          )}
          {provider.qrImageUrl && (
            <button onClick={() => setShowQr((v) => !v)} className="mt-3 min-h-12 w-full rounded-xl border-2 border-ink font-bold text-ink">
              {showQr ? "Hide payment QR" : "Show verified payment QR"}
            </button>
          )}
          {showQr && provider.qrImageUrl && (
            <img className="mx-auto mt-3 max-h-56 rounded-lg bg-white p-2" src={provider.qrImageUrl} alt={`${provider.label} verified merchant payment QR`} />
          )}
          <p className="mt-3 text-xs font-semibold text-amber-900">Check the recipient name and amount in your wallet before confirming. This page does not verify or collect payments.</p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          This provider is disabled until the relief organization verifies its account, number, app link and QR with the provider. No payment details are shown.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-bold text-red-700">{error}</p>}
      {copied && <p role="status" className="mt-2 text-sm font-bold text-emerald-800">Copied.</p>}
    </article>
  );
}

const CLOSE_MS = 180; // keep in sync with .dm-out in styles/index.css

export default function DonationModal({ open, onClose }) {
  const [closing, setClosing] = useState(false);
  const closeBtn = useRef(null);
  const timer = useRef(0);

  // Animate out, then tell the parent. Idempotent so a double tap on the backdrop cannot fire onClose twice.
  const dismiss = useCallback(() => {
    if (timer.current) return;
    setClosing(true);
    timer.current = window.setTimeout(() => { timer.current = 0; setClosing(false); onClose(); }, CLOSE_MS);
  }, [onClose]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // While open: Escape closes, the page behind does not scroll, focus moves into the dialog and is restored after.
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e) => e.key === "Escape" && dismiss();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, dismiss]);

  if (!open) return null;

  return (
    // Backdrop. pointerdown (not click) so it works on touch immediately, and the target check means taps
    // inside the panel, or a text-selection drag that ends on the backdrop, never dismiss it.
    <div
      className={`fixed inset-0 z-[2000] flex items-end justify-center bg-ink/75 p-2 sm:items-center ${closing ? "dm-backdrop-out" : "dm-backdrop-in"}`}
      onPointerDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="donate-title"
        className={`flex max-h-[90vh] [@supports(height:100dvh)]:max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border-2 border-ink bg-milk text-ink shadow-2xl ${closing ? "dm-panel-out" : "dm-panel-in"}`}
      >
        {/* Sticky header: always reachable, even on a short phone with the keyboard open. */}
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b-2 border-ink bg-brand p-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-ink p-3"><HeartHandshake size={28} className="text-milk" /></span>
            <div>
              <h2 id="donate-title" className="text-2xl font-black text-ink">Emergency support</h2>
              <p className="text-sm font-semibold text-ink">Send help only to a verified relief account.</p>
            </div>
          </div>
          <button ref={closeBtn} type="button" onClick={dismiss} className="min-h-12 min-w-12 shrink-0 rounded-full bg-ink text-milk focus-visible:!outline-milk" aria-label="Close donation dialog"><X className="mx-auto" /></button>
        </div>

        {/* Body: the only scrolling region. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="space-y-3">
            <PaymentProvider provider={paymentConfig.bkash} />
            <PaymentProvider provider={paymentConfig.nagad} />
          </div>

          <TrxIdForm />

          {paymentConfig.donationLandingUrl && /^https:\/\//i.test(paymentConfig.donationLandingUrl) && (
            <a href={paymentConfig.donationLandingUrl} target="_blank" rel="noreferrer" className="mt-4 flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-ink bg-brand text-lg font-black text-ink active:bg-brand-press">
              Verified secure donation page <ExternalLink size={18} />
            </a>
          )}
          <p className="mt-4 text-xs leading-5 text-ink-muted">
            Never send money to a number received only through social media or an unverified message. Retain the transaction ID and receipt.
          </p>
        </div>
      </div>
    </div>
  );
}
