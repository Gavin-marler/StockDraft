import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

// Wraps any page that requires authentication. If signed out, shows a
// magic-link sign-in form instead of children.
export default function SignInGate({
  children,
  title = "Sign in to continue",
  hint,
}: {
  children: React.ReactNode;
  title?: string;
  hint?: string;
}) {
  const { user, loading, signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  }
  if (user) return <>{children}</>;

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

  if (sent) {
    return (
      <div className="max-w-md mx-auto py-16 px-6 text-center space-y-3">
        <div className="text-5xl">📧</div>
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-gray-400">
          We sent a magic link to <span className="text-white font-mono">{email}</span>. Click it to finish
          signing in.
        </p>
        <p className="text-xs text-gray-500">
          The link will return you here. You can close this tab in the meantime.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-16 px-6">
      <h1 className="text-3xl font-bold mb-2">{title}</h1>
      {hint && <p className="text-sm text-gray-400 mb-4">{hint}</p>}
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label htmlFor="signin-email" className="label">Email</label>
          <input
            id="signin-email"
            type="email"
            required
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>
        {err && <div className="text-loss text-sm">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Sending…" : "Send magic link"}
        </button>
        <p className="text-xs text-gray-500">
          We'll email you a one-click link. No password.
        </p>
      </form>
    </div>
  );
}
