import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import { fn } from "../api/functions";
import sp500 from "../data/sp500_top50.json";

type Player = { id: string; name: string };
type Holding = { id: string; player_id: string; ticker: string | null; buy_price: number };
type DraftState = {
  id: string;
  current_round: number;
  current_player_id: string;
  pick_deadline: string;
  status: "waiting" | "picking" | "complete";
};
type League = { id: string; name: string; stocks_per_player: number; budget: number };

export default function Draft() {
  const [params] = useSearchParams();
  const leagueId = params.get("league") || "";
  const [league, setLeague] = useState<League | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ds, setDs] = useState<DraftState | null>(null);
  const [activity, setActivity] = useState<{ id: string; description: string }[]>([]);
  const [now, setNow] = useState(Date.now());
  const [pin, setPin] = useState("");
  const [search, setSearch] = useState("");
  const [lookup, setLookup] = useState<{ ticker: string; price: number } | null>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ ticker: string; price: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const autoFiredRef = useRef<string | null>(null);

  const me = useMemo(() => {
    try {
      const raw = localStorage.getItem(`player:${leagueId}`);
      return raw ? (JSON.parse(raw) as { id: string; name: string }) : null;
    } catch {
      return null;
    }
  }, [leagueId]);

  async function loadAll() {
    const [{ data: l }, { data: ps }, { data: hs }, { data: state }, { data: act }] = await Promise.all([
      supabase.from("leagues").select("id, name, stocks_per_player, budget").eq("id", leagueId).single(),
      supabase
        .from("players")
        .select("id, name")
        .eq("league_id", leagueId)
        .eq("status", "approved")
        .order("created_at", { ascending: true }),
      supabase
        .from("holdings")
        .select("id, player_id, ticker, buy_price, players!inner(league_id)")
        .eq("players.league_id", leagueId),
      supabase.from("draft_state").select("*").eq("league_id", leagueId).maybeSingle(),
      supabase
        .from("activity")
        .select("id, description")
        .eq("league_id", leagueId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (l) setLeague(l as League);
    setPlayers((ps as Player[]) || []);
    setHoldings(((hs as any[]) || []).map((h) => ({ ...h, players: undefined })));
    setDs((state as DraftState) || null);
    setActivity((act as any[]) || []);
  }

  useEffect(() => {
    if (!leagueId) return;
    loadAll();
    const ch = supabase
      .channel(`draft:${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_state", filter: `league_id=eq.${leagueId}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "holdings" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity", filter: `league_id=eq.${leagueId}` }, loadAll)
      .subscribe();
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(i);
    };
  }, [leagueId]);

  const remainingMs = ds?.pick_deadline ? new Date(ds.pick_deadline).getTime() - now : 0;
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

  useEffect(() => {
    if (!ds || ds.status !== "picking") return;
    if (remainingMs > 0) return;
    const key = `${ds.current_round}:${ds.current_player_id}`;
    if (autoFiredRef.current === key) return;
    autoFiredRef.current = key;
    fn.autoDraft({ league_id: leagueId }).catch((e) => console.warn("auto-draft", e));
  }, [remainingMs, ds, leagueId]);

  const draftedTickers = useMemo(
    () => new Set(holdings.filter((h) => h.ticker).map((h) => h.ticker!)),
    [holdings]
  );

  const isMyTurn = ds?.status === "picking" && ds?.current_player_id === me?.id;

  async function doLookup() {
    setLookupErr(null);
    setLookup(null);
    const t = search.trim().toUpperCase();
    if (!t) return;
    if (draftedTickers.has(t)) {
      setLookupErr(`${t} already drafted`);
      return;
    }
    try {
      const r = await fn.fetchPrices({ league_id: leagueId, refresh: true });
      // fallback: try lookupTicker which forwards raw tickers
      const r2: any = await fn.lookupTicker({ ticker: t });
      if (r2?.prices && r2.prices[t]) {
        setLookup({ ticker: t, price: r2.prices[t].price });
      } else if (r.prices[t]) {
        setLookup({ ticker: t, price: r.prices[t].price });
      } else {
        setLookupErr(`No price found for ${t}`);
      }
    } catch (e: any) {
      setLookupErr(e.message);
    }
  }

  async function pickPopular(ticker: string) {
    if (draftedTickers.has(ticker)) return;
    try {
      const r: any = await fn.lookupTicker({ ticker });
      const px = r?.prices?.[ticker]?.price;
      if (!px) return setErr(`No price for ${ticker}`);
      setConfirming({ ticker, price: px });
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function confirmPick() {
    if (!confirming || !me) return;
    setSubmitting(true);
    setErr(null);
    try {
      await fn.makePick({ player_id: me.id, pin, ticker: confirming.ticker });
      setConfirming(null);
      setLookup(null);
      setSearch("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!leagueId) return <Center>Missing league id.</Center>;
  if (!league || !ds) return <Center>Loading draft…</Center>;
  if (ds.status === "complete") {
    return (
      <div className="max-w-2xl mx-auto py-16 px-6 text-center space-y-3">
        <div className="text-5xl">✓</div>
        <h1 className="text-2xl font-bold">Draft complete</h1>
        <a href={`/?league=${leagueId}`} className="btn-primary inline-block">Go to leaderboard</a>
      </div>
    );
  }

  const currentPlayer = players.find((p) => p.id === ds.current_player_id);
  const order = snakeOrder(players, league.stocks_per_player);

  return (
    <div className="max-w-6xl mx-auto py-6 px-6 space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-bold">{league.name} — Draft</h1>
          <div className="text-xs text-gray-500">Round {ds.current_round} of {league.stocks_per_player}</div>
        </div>
        <a href={`/?league=${leagueId}`} className="text-sm text-gray-400">Leaderboard →</a>
      </div>

      <div className="card flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-400">On the clock</div>
          <div className="text-2xl font-bold">{currentPlayer?.name || "?"}</div>
        </div>
        <div className={`text-5xl font-mono ${remainingSec <= 10 ? "text-loss" : "text-accent"}`}>
          {remainingSec}s
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {isMyTurn ? (
            <div className="card space-y-4">
              <h2 className="font-semibold">Your pick</h2>
              <div>
                <label className="label">Your PIN</label>
                <input
                  inputMode="numeric"
                  maxLength={4}
                  className="input tracking-widest text-center text-xl w-32"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div>
                <label className="label">Search ticker</label>
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="e.g. AAPL"
                    value={search}
                    onChange={(e) => setSearch(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && doLookup()}
                  />
                  <button className="btn-ghost" type="button" onClick={doLookup}>Lookup</button>
                </div>
                {lookupErr && <div className="text-loss text-sm mt-2">{lookupErr}</div>}
                {lookup && (
                  <div className="mt-3 flex items-center justify-between">
                    <span><span className="font-mono">{lookup.ticker}</span> @ ${lookup.price.toFixed(2)}</span>
                    <button className="btn-primary text-sm" onClick={() => setConfirming(lookup)}>Draft</button>
                  </div>
                )}
              </div>
              <div>
                <div className="label">Popular tickers</div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {sp500.map((s) => (
                    <button
                      key={s.ticker}
                      disabled={draftedTickers.has(s.ticker)}
                      onClick={() => pickPopular(s.ticker)}
                      className={`text-xs rounded border px-2 py-2 font-mono ${
                        draftedTickers.has(s.ticker)
                          ? "border-gray-800 text-gray-600 line-through cursor-not-allowed"
                          : "border-gray-700 hover:border-accent"
                      }`}
                      title={s.name}
                    >
                      {s.ticker}
                    </button>
                  ))}
                </div>
              </div>
              {err && <div className="text-loss text-sm">{err}</div>}
            </div>
          ) : (
            <div className="card text-gray-400 text-sm">
              Waiting for {currentPlayer?.name} to pick…
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold mb-3">Draft board</h2>
            <DraftBoard order={order} players={players} holdings={holdings} stocksPerPlayer={league.stocks_per_player} />
          </div>
        </div>

        <div className="card h-fit">
          <h2 className="font-semibold mb-3">Activity</h2>
          <ul className="space-y-2 text-sm max-h-[500px] overflow-y-auto">
            {activity.map((a) => (
              <li key={a.id} className="border-b border-gray-800 pb-2">{a.description}</li>
            ))}
            {activity.length === 0 && <li className="text-gray-500">No activity yet.</li>}
          </ul>
        </div>
      </div>

      {confirming && (
        <Modal onClose={() => setConfirming(null)}>
          <h3 className="text-xl font-bold mb-3">Confirm pick</h3>
          <p className="text-gray-300 mb-4">
            Draft <span className="font-mono">{confirming.ticker}</span> at $
            {confirming.price.toFixed(2)}?
          </p>
          {!pin && <div className="text-loss text-sm mb-2">Enter your PIN above first.</div>}
          {err && <div className="text-loss text-sm mb-2">{err}</div>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
            <button className="btn-primary" disabled={submitting || !pin} onClick={confirmPick}>
              {submitting ? "Drafting…" : "Confirm"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function snakeOrder(players: Player[], rounds: number): { round: number; playerId: string }[] {
  const order: { round: number; playerId: string }[] = [];
  for (let r = 1; r <= rounds; r++) {
    const seq = r % 2 === 1 ? players : [...players].reverse();
    for (const p of seq) order.push({ round: r, playerId: p.id });
  }
  return order;
}

function DraftBoard({
  order,
  players,
  holdings,
  stocksPerPlayer,
}: {
  order: { round: number; playerId: string }[];
  players: Player[];
  holdings: Holding[];
  stocksPerPlayer: number;
}) {
  const grid: Record<string, (Holding | null)[]> = {};
  for (const p of players) grid[p.id] = Array(stocksPerPlayer).fill(null);
  const seen: Record<string, number> = {};
  for (const h of holdings) {
    if (!grid[h.player_id]) continue;
    const idx = seen[h.player_id] ?? 0;
    grid[h.player_id][idx] = h;
    seen[h.player_id] = idx + 1;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="text-left py-1">Player</th>
            {Array.from({ length: stocksPerPlayer }).map((_, i) => (
              <th key={i} className="text-left">R{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="border-t border-gray-800">
              <td className="py-2 font-medium">{p.name}</td>
              {grid[p.id].map((h, i) => (
                <td key={i} className="py-2 font-mono">
                  {h?.ticker ? h.ticker : h?.is_cash ? "$$$" : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-gray-400">{children}</div>;
}
