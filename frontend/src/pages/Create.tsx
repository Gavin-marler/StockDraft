import { useState } from "react";
import { fn } from "../api/functions";
import SignInGate from "../components/SignInGate";
import { useAuth } from "../hooks/useAuth";

export default function Create() {
  return (
    <SignInGate
      title="Sign in to create a league"
      hint="You'll be the admin and also a player in the league."
    >
      <CreateForm />
    </SignInGate>
  );
}

function CreateForm() {
  const { user } = useAuth();
  const defaultDisplay = user?.email?.split("@")[0] || "";
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState(defaultDisplay);
  const [budget, setBudget] = useState(500);
  const [stocksPerPlayer, setStocksPerPlayer] = useState(5);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ league_id: string; invite_token: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr("League name is required.");
    if (!displayName.trim()) return setErr("Your display name is required.");
    setLoading(true);
    try {
      const r = await fn.createLeague({
        name: name.trim(),
        admin_name: displayName.trim(),
        budget,
        stocks_per_player: stocksPerPlayer,
        max_players: maxPlayers,
        start_date: startDate,
      });
      setResult(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const inviteUrl = `${window.location.origin}/join?token=${result.invite_token}`;
    const adminUrl = `${window.location.origin}/admin?league=${result.league_id}`;
    const leaderboardUrl = `${window.location.origin}/?league=${result.league_id}`;
    return (
      <div className="max-w-xl mx-auto py-12 px-6 space-y-6">
        <h1 className="text-3xl font-bold">League created!</h1>
        <p className="text-sm text-gray-400">
          You're already in as <span className="text-white">{displayName.trim()}</span> — share the
          invite link below to get the rest of your league signed up.
        </p>
        <div className="card space-y-4">
          <div>
            <div className="label">Invite link (share with players)</div>
            <CopyField value={inviteUrl} />
          </div>
          <div>
            <div className="label">Admin dashboard</div>
            <CopyField value={adminUrl} />
          </div>
          <div>
            <div className="label">Public leaderboard</div>
            <CopyField value={leaderboardUrl} />
          </div>
        </div>
        <a href={adminUrl} className="btn-primary block text-center">
          Open admin dashboard →
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold mb-6">Create a league</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label htmlFor="f-name" className="label">League name</label>
          <input id="f-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-display" className="label">Your display name</label>
          <input
            id="f-display"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How other players will see you"
          />
          <p className="text-xs text-gray-500 mt-1">You'll be automatically added as a player.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="f-budget" className="label">Budget per player ($)</label>
            <input
              id="f-budget"
              type="number"
              min={50}
              className="input"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="f-stocks" className="label">Stocks per player</label>
            <input
              id="f-stocks"
              type="number"
              min={1}
              max={10}
              className="input"
              value={stocksPerPlayer}
              onChange={(e) => setStocksPerPlayer(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="f-max" className="label">Max players (2-8)</label>
            <input
              id="f-max"
              type="number"
              min={2}
              max={8}
              className="input"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="f-start" className="label">Start date</label>
            <input
              id="f-start"
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
        {err && <div className="text-loss text-sm">{err}</div>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating…" : "Create league"}
        </button>
      </form>
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input className="input flex-1 font-mono text-xs" readOnly value={value} />
      <button
        type="button"
        className="btn-ghost"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
