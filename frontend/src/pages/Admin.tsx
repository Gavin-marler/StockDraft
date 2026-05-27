import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fn } from "../api/functions";
import { supabase } from "../api/supabaseClient";

type League = {
  id: string;
  name: string;
  budget: number;
  stocks_per_player: number;
  max_players: number;
  status: string;
  invite_token: string;
  start_date: string;
  end_date: string;
};
type Player = {
  id: string;
  name: string;
  status: "pending" | "approved";
  last_trade_month: string | null;
};

export default function Admin() {
  const [params] = useSearchParams();
  const leagueId = params.get("league") || "";
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(`admin_token:${leagueId}`)
  );
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tab, setTab] = useState<"pending" | "approved" | "draft" | "settings">("pending");
  const [resetLink, setResetLink] = useState<string | null>(null);

  async function load() {
    const { data: l } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
    if (l) setLeague(l as League);
    const { data: ps } = await supabase
      .from("players")
      .select("id, name, status, last_trade_month")
      .eq("league_id", leagueId)
      .order("created_at", { ascending: true });
    setPlayers((ps as Player[]) || []);
  }

  useEffect(() => {
    if (!token || !leagueId) return;
    load();
    const ch = supabase
      .channel(`admin:${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `league_id=eq.${leagueId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "leagues", filter: `id=eq.${leagueId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [token, leagueId]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const r = await fn.adminLogin({ league_id: leagueId, password: pw });
      localStorage.setItem(`admin_token:${leagueId}`, r.admin_token);
      setToken(r.admin_token);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (!leagueId) return <Center>Missing league id in URL.</Center>;
  if (!token) {
    return (
      <div className="max-w-md mx-auto py-12 px-6">
        <h1 className="text-3xl font-bold mb-6">Admin login</h1>
        <form onSubmit={login} className="card space-y-4">
          <div>
            <label htmlFor="a-pw" className="label">Admin password</label>
            <input
              id="a-pw"
              type="password"
              className="input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </div>
          {err && <div className="text-loss text-sm">{err}</div>}
          <button className="btn-primary w-full">Login</button>
        </form>
      </div>
    );
  }

  const pending = players.filter((p) => p.status === "pending");
  const approved = players.filter((p) => p.status === "approved");
  const inviteUrl = league ? `${window.location.origin}/join?token=${league.invite_token}` : "";

  async function approve(playerId: string, action: "approve" | "reject") {
    await fn.approvePlayer({ player_id: playerId, action }, token!);
    load();
  }

  async function resetPin(playerId: string) {
    setResetLink(null);
    const r = await fn.generateResetLink({ player_id: playerId }, token!);
    setResetLink(`${window.location.origin}/reset-pin?token=${r.token}`);
  }

  async function startDraft() {
    if (!confirm("Start the draft now? This expires the invite link.")) return;
    await fn.startDraft({ league_id: leagueId }, token!);
    window.location.href = `/draft?league=${leagueId}`;
  }

  async function skipPick() {
    if (!confirm("Skip current player's turn (auto-draft)?")) return;
    await fn.autoDraft({ league_id: leagueId, admin: true }, token!);
  }

  async function delLeague() {
    if (!confirm("DELETE this league and all data? This cannot be undone.")) return;
    await fn.deleteLeague({ league_id: leagueId }, token!);
    localStorage.removeItem(`admin_token:${leagueId}`);
    window.location.href = "/";
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-bold">{league?.name || "League"}</h1>
          <div className="text-xs text-gray-500">Status: {league?.status}</div>
        </div>
        <a href={`/?league=${leagueId}`} className="btn-ghost text-sm">View leaderboard</a>
      </div>

      <div className="flex gap-2 border-b border-gray-800">
        {(["pending", "approved", "draft", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 capitalize text-sm ${tab === t ? "border-b-2 border-accent text-white" : "text-gray-400"}`}
          >
            {t === "pending" ? `Pending (${pending.length})` : t}
          </button>
        ))}
      </div>

      {tab === "pending" && (
        <div className="card">
          {pending.length === 0 ? (
            <div className="text-gray-500 text-sm">No pending requests.</div>
          ) : (
            <ul className="divide-y divide-gray-800">
              {pending.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <span className="font-medium">{p.name}</span>
                  <div className="flex gap-2">
                    <button className="btn-primary text-sm" onClick={() => approve(p.id, "approve")}>Approve</button>
                    <button className="btn-ghost text-sm" onClick={() => approve(p.id, "reject")}>Reject</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "approved" && (
        <div className="space-y-4">
          {resetLink && (
            <div className="card border-accent">
              <div className="label">One-time reset link (send to player)</div>
              <input className="input font-mono text-xs" readOnly value={resetLink} />
            </div>
          )}
          <div className="card">
            {approved.length === 0 ? (
              <div className="text-gray-500 text-sm">No approved players yet.</div>
            ) : (
              <ul className="divide-y divide-gray-800">
                {approved.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-3">
                    <span className="font-medium">{p.name}</span>
                    <button className="btn-ghost text-sm" onClick={() => resetPin(p.id)}>Reset PIN</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "draft" && (
        <div className="card space-y-4">
          {league?.status === "open" && (
            <>
              <p className="text-sm text-gray-400">
                {approved.length} approved player{approved.length === 1 ? "" : "s"}. Need at least 2 to start.
              </p>
              <button
                className="btn-primary"
                disabled={approved.length < 2}
                onClick={startDraft}
              >
                Start draft
              </button>
            </>
          )}
          {league?.status === "drafting" && (
            <>
              <a href={`/draft?league=${leagueId}`} className="btn-primary inline-block">Open draft room</a>
              <button className="btn-ghost ml-2" onClick={skipPick}>Skip current pick</button>
            </>
          )}
          {(league?.status === "active" || league?.status === "complete") && (
            <p className="text-gray-400 text-sm">Draft is complete.</p>
          )}
        </div>
      )}

      {tab === "settings" && league && (
        <div className="card space-y-4">
          <div>
            <div className="label">Invite link</div>
            <input readOnly className="input font-mono text-xs" value={inviteUrl} />
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-gray-500">Budget</div><div>${league.budget}</div></div>
            <div><div className="text-gray-500">Stocks per player</div><div>{league.stocks_per_player}</div></div>
            <div><div className="text-gray-500">Max players</div><div>{league.max_players}</div></div>
            <div><div className="text-gray-500">Status</div><div>{league.status}</div></div>
            <div><div className="text-gray-500">Start</div><div>{league.start_date}</div></div>
            <div><div className="text-gray-500">End</div><div>{league.end_date}</div></div>
          </div>
          <button className="btn-ghost text-loss" onClick={delLeague}>Delete league</button>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-gray-400">{children}</div>;
}
