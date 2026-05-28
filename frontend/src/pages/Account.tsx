import { useState } from "react";
import { supabase } from "../api/supabaseClient";
import SignInGate from "../components/SignInGate";
import { useAuth } from "../hooks/useAuth";

export default function Account() {
  return (
    <SignInGate title="Sign in to manage your account">
      <AccountInner />
    </SignInGate>
  );
}

function AccountInner() {
  const { user } = useAuth();
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    if (pw.length < 6) return setErr("Password must be at least 6 characters.");
    if (pw !== confirmPw) return setErr("Passwords do not match.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setOk(true);
      setPw("");
      setConfirmPw("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto py-12 px-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Account</h1>
        <p className="text-sm text-gray-500 mt-1">{user?.email}</p>
      </div>

      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-semibold">Set or change password</h2>
        <p className="text-xs text-gray-500">
          After setting a password you can sign in either way — password or magic link.
        </p>
        <div>
          <label htmlFor="acc-pw" className="label">New password</label>
          <input
            id="acc-pw"
            type="password"
            className="input"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="acc-pw2" className="label">Confirm new password</label>
          <input
            id="acc-pw2"
            type="password"
            className="input"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {err && <div className="text-loss text-sm">{err}</div>}
        {ok && <div className="text-accent text-sm">Password updated.</div>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
