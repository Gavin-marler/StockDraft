import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fn } from "../api/functions";

export default function ResetPin() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) return <div className="text-gray-400 p-10 text-center">Invalid reset link.</div>;
  if (done) {
    return (
      <div className="max-w-md mx-auto py-16 px-6 text-center space-y-3">
        <div className="text-5xl">✓</div>
        <h1 className="text-2xl font-bold">PIN updated</h1>
        <p className="text-gray-400">You can use your new PIN to trade and pick.</p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!/^\d{4}$/.test(pin)) return setErr("PIN must be 4 digits.");
    if (pin !== confirmPin) return setErr("PINs do not match.");
    try {
      await fn.consumeResetLink({ token, new_pin: pin });
      setDone(true);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="max-w-md mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold mb-6">Reset your PIN</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label">New 4-digit PIN</label>
          <input
            inputMode="numeric"
            maxLength={4}
            className="input tracking-widest text-center text-xl"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div>
          <label className="label">Confirm new PIN</label>
          <input
            inputMode="numeric"
            maxLength={4}
            className="input tracking-widest text-center text-xl"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        {err && <div className="text-loss text-sm">{err}</div>}
        <button className="btn-primary w-full">Update PIN</button>
      </form>
    </div>
  );
}
