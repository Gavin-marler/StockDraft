import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../api/supabaseClient";

type Mode = "magic" | "password";

export default function SignInForm({
  onSignedIn,
  defaultMode = "password",
}: {
  onSignedIn?: () => void;
  defaultMode?: Mode;
}) {
  const { signInWithEmail } = useAuth();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "magic") {
        await signInWithEmail(email);
        setSent(true);
      } else {
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          if (/invalid login credentials/i.test(signInError.message)) {
            const { error: signUpError } = await supabase.auth.signUp({
              email: email.trim(),
              password,
            });
            if (signUpError) throw signUpError;
            const { error: retry } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (retry) throw retry;
          } else {
            throw signInError;
          }
        }
        onSignedIn?.();
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center space-y-3 py-2">
        <div className="text-5xl">📧</div>
        <h3 className="text-xl font-bold">Check your email</h3>
        <p className="text-gray-400 text-sm">
          Magic link sent to <span className="text-white font-mono">{email}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex text-xs rounded-lg overflow-hidden border border-gray-800">
        <button
          type="button"
          className={`flex-1 py-2 ${mode === "password" ? "bg-accent text-black" : "text-gray-400"}`}
          onClick={() => setMode("password")}
        >
          Password
        </button>
        <button
          type="button"
          className={`flex-1 py-2 ${mode === "magic" ? "bg-accent text-black" : "text-gray-400"}`}
          onClick={() => setMode("magic")}
        >
          Magic link
        </button>
      </div>

      <div>
        <label htmlFor="sf-email" className="label">Email</label>
        <input
          id="sf-email"
          type="email"
          required
          autoFocus
          className="input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {mode === "password" && (
        <div>
          <label htmlFor="sf-pw" className="label">Password</label>
          <input
            id="sf-pw"
            type="password"
            required
            className="input"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            New email? An account is created automatically.
          </p>
        </div>
      )}

      {err && <div className="text-loss text-sm">{err}</div>}

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "…" : mode === "magic" ? "Send magic link" : "Sign in / Create account"}
      </button>
    </form>
  );
}
