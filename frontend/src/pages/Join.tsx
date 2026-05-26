import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fn } from "../api/functions";

export default function Join() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ league_id: string; player_id: string } | null>(null);

  if (!token) return <Center>Missing invite token.</Center>;

  if (submitted) {
    return (
      <div className="max-w-md mx-auto py-16 px-6 text-center space-y-4">
        <div className="text-6xl">⏳</div>
        <h1 className="text-2xl font-bold">Waiting for approval</h1>
        <p className="text-gray-400">
          Your request to join was submitted. The league admin will approve you shortly.
        </p>
        <p className="text-xs text-gray-500">
          Bookmark this page — once approved you can access the draft and leaderboard.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!/^\d{4}$/.test(pin)) return setErr("PIN must be exactly 4 digits.");
    if (pin !== confirmPin) return setErr("PINs do not match.");
    if (!name.trim()) return setErr("Name is required.");
    setLoading(true);
    try {
      const r = await fn.joinLeague({ invite_token: token, name: name.trim(), pin });
      localStorage.setItem(`player:${r.league_id}`, JSON.stringify({ id: r.player_id, name: name.trim() }));
      setSubmitted(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold mb-6">Join StockDraft</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label">Your name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">4-digit PIN</label>
          <input
            inputMode="numeric"
            maxLength={4}
            className="input tracking-widest text-center text-xl"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div>
          <label className="label">Confirm PIN</label>
          <input
            inputMode="numeric"
            maxLength={4}
            className="input tracking-widest text-center text-xl"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        {err && <div className="text-loss text-sm">{err}</div>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Joining…" : "Join league"}
        </button>
      </form>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-gray-400">{children}</div>;
}
