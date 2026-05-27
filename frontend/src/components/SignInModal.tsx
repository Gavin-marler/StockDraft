import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

export default function SignInModal({ onClose }: { onClose: () => void }) {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await signInWithEmail(email);
      setSent(true);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="text-center space-y-3 py-2">
            <div className="text-5xl">📧</div>
            <h3 className="text-xl font-bold">Check your email</h3>
            <p className="text-gray-400 text-sm">
              We sent a magic link to <span className="text-white font-mono">{email}</span>. Click it
              and you'll be signed in.
            </p>
            <button className="btn-ghost mt-2" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h3 className="text-xl font-bold">Sign in</h3>
            <p className="text-sm text-gray-400">
              No password. We'll email you a one-click sign-in link.
            </p>
            <div>
              <label htmlFor="sim-email" className="label">Email</label>
              <input
                id="sim-email"
                type="email"
                required
                autoFocus
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {err && <div className="text-loss text-sm">{err}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={busy}>
                {busy ? "Sending…" : "Send magic link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
