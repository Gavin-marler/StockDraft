import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fn } from "../api/functions";
import SignInGate from "../components/SignInGate";
import { useAuth } from "../hooks/useAuth";

export default function Join() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  if (!token) return <Center>Missing invite token.</Center>;
  return (
    <SignInGate
      title="Sign in to join this league"
      hint="We'll send a magic link to your email. Your email becomes your identity in the league."
    >
      <JoinForm token={token} />
    </SignInGate>
  );
}

function JoinForm({ token }: { token: string }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ league_id: string; status: string } | null>(null);

  if (submitted) {
    if (submitted.status === "approved") {
      return (
        <div className="max-w-md mx-auto py-16 px-6 text-center space-y-4">
          <div className="text-6xl">✓</div>
          <h1 className="text-2xl font-bold">You're in!</h1>
          <a href={`/?league=${submitted.league_id}`} className="btn-primary inline-block">
            Go to leaderboard
          </a>
        </div>
      );
    }
    return (
      <div className="max-w-md mx-auto py-16 px-6 text-center space-y-4">
        <div className="text-6xl">⏳</div>
        <h1 className="text-2xl font-bold">Waiting for approval</h1>
        <p className="text-gray-400">
          Your request to join was submitted. The league admin will approve you shortly.
        </p>
        <a href={`/?league=${submitted.league_id}`} className="text-sm text-gray-500 underline">
          View the league leaderboard
        </a>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr("Name is required.");
    setLoading(true);
    try {
      const r = await fn.joinLeague({ invite_token: token, name: name.trim() });
      setSubmitted(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold mb-2">Join StockDraft</h1>
      <p className="text-xs text-gray-500 mb-6">Signed in as {user?.email}</p>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label htmlFor="j-name" className="label">Display name</label>
          <input
            id="j-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How should others see you?"
            autoFocus
          />
        </div>
        {err && <div className="text-loss text-sm">{err}</div>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Joining…" : "Request to join"}
        </button>
      </form>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-gray-400">{children}</div>;
}
