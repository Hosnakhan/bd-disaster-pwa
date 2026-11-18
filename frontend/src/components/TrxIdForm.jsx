import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { apiUrl } from "../lib/api";

const PROVIDERS = [["bkash", "bKash"], ["nagad", "Nagad"]];

/** After paying in the wallet app, donors report their TrxID so an admin can reconcile it. */
export default function TrxIdForm() {
  const [provider, setProvider] = useState("bkash");
  const [trxId, setTrxId] = useState("");
  const [amount, setAmount] = useState("");
  const [state, setState] = useState({ phase: "idle", message: "" });

  async function submit(e) {
    e.preventDefault();
    setState({ phase: "sending", message: "" });
    try {
      const r = await fetch(apiUrl("/api/donations/trx"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, trxId, amount })
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 201) { setState({ phase: "done", message: "Received. An admin will verify it." }); setTrxId(""); setAmount(""); return; }
      const msg = {
        "invalid-trxid": "That Transaction ID looks wrong. Copy it from your SMS or app receipt.",
        "already-submitted": "This Transaction ID was already submitted.",
        "too-many-requests": "Too many attempts. Please try again later.",
        "invalid-amount": "Amount must be a positive number."
      }[j.error] || "Could not send. Check your connection and try again.";
      setState({ phase: "error", message: msg });
    } catch {
      setState({ phase: "error", message: "No connection. Keep your TrxID and try again when online." });
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border border-milk-line bg-milk-2 p-4">
      <h3 className="text-xl font-black text-ink">I already paid — send my TrxID</h3>
      <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment provider">
        {PROVIDERS.map(([key, label]) => (
          <button type="button" key={key} role="radio" aria-checked={provider === key} onClick={() => setProvider(key)}
            className={`min-h-14 rounded-xl border-2 text-lg font-black ${provider === key ? "border-ink bg-brand text-ink" : "border-ink-muted bg-milk text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-sm font-bold text-ink" htmlFor="trx">Transaction ID (TrxID)</label>
      <input id="trx" value={trxId} onChange={(e) => setTrxId(e.target.value.toUpperCase())} required minLength={6} maxLength={20}
        autoCapitalize="characters" autoComplete="off" inputMode="text"
        className="mt-1 min-h-14 w-full rounded-xl border-2 border-ink-muted bg-milk px-3 text-xl font-black tracking-widest text-ink" />
      <label className="mt-3 block text-sm font-bold text-ink" htmlFor="amt">Amount in BDT</label>
      <input id="amt" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,2})?"
        className="mt-1 min-h-14 w-full rounded-xl border-2 border-ink-muted bg-milk px-3 text-xl font-black text-ink" />
      <button type="submit" disabled={state.phase === "sending"}
        className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-ink bg-brand text-lg font-black text-ink active:bg-brand-press disabled:opacity-60">
        <Send size={20} /> {state.phase === "sending" ? "Sending…" : "Send TrxID"}
      </button>
      {state.message && (
        <p role={state.phase === "error" ? "alert" : "status"} className={`mt-2 flex items-center gap-2 text-sm font-bold ${state.phase === "error" ? "text-red-700" : "text-emerald-800"}`}>
          {state.phase === "done" && <CheckCircle2 size={18} />}{state.message}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-muted">Submitting a TrxID does not confirm payment. It is checked by an admin against the receiving account.</p>
    </form>
  );
}
