import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import { fn } from "../api/functions";
import sp500 from "../data/sp500_top50.json";
import SignInGate from "../components/SignInGate";
import TickerAutocomplete from "../components/TickerAutocomplete";
import QueuePanel from "../components/QueuePanel";
import { useAuth } from "../hooks/useAuth";
import { useQueue } from "../hooks/useQueue";

type Player = { id: string; name: string; auth_user_id: string };
type Holding = { id: string; player_id: string; ticker: string | null; buy_price: number };
type DraftState = {
  id: string;
  current_round: number;
  current_player_id: string;
  pick_deadline: string;
  status: "waiting" | "picking" | "complete";
};
type League = { id: string; name: string; stocks_per_player: number; budget: number };
type Quote = { price: number; change_pct: number };

export default function Draft() {
  const [params] = useSearchParams();
  const leagueId = params.get("league") || "";
  if (!leagueId) return <Center>Missing league id.</Center>;
  return (
    <SignInGate title="Sign in to enter the draft room">
      <DraftRoom leagueId={leagueId} />
    </SignInGate>
  );
}

function DraftRoom({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const [league, setLeague] = useState<League | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ds, setDs] = useState<DraftState | null>(null);
  const [activity, setActivity] = useState<{ id: string; description: string }[]>([]);
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState("");
  const [prices, setPrices] = useState<Record<string, Quote>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [customInfo, setCustomInfo] = useState<{
    ticker: string;
    price: number;
    change_pct: number;
    name: string | null;
    sector: string | null;
  } | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customErr, setCustomErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ ticker: string; price: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const autoFiredRef = useRef<string | null>(null);

  async function loadAll() {
    const [{ data: l }, { data: ps }, { data: hs }, { data: state }, { data: act }] = await Promise.all([
      supabase.from("leagues").select("id, name, stocks_per_player, budget").eq("id", leagueId).single(),
      supabase
        .from("players")
        .select("id, name, auth_user_id")
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

  useEffect(() => {
    let cancelled = false;
    async function loadPrices() {
      setPricesLoading(true);
      try {
        const r = await fn.fetchTickerPrices(sp500.map((s) => s.ticker), false);
        if (!cancelled) setPrices(r.prices);
      } catch (e) {
        console.warn(e);
      } finally {
        if (!cancelled) setPricesLoading(false);
      }
    }
    loadPrices();
    return () => {
      cancelled = true;
    };
  }, []);

  const me = useMemo(
    () => players.find((p) => p.auth_user_id === user?.id) ?? null,
    [players, user]
  );
  const queue = useQueue(me?.id);
  const queuedSet = useMemo(() => new Set(queue.map((q) => q.ticker)), [queue]);
  const companyNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of sp500) out[s.ticker] = s.name;
    if (customInfo?.name) out[customInfo.ticker] = customInfo.name;
    return out;
  }, [customInfo]);

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

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return sp500;
    return sp500.filter(
      (s) => s.ticker.includes(q) || s.name.toUpperCase().includes(q) || s.sector.toUpperCase().includes(q),
    );
  }, [search]);

  const exactCustomMatch = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q || !/^[A-Z.\-]{1,8}$/.test(q)) return null;
    if (sp500.some((s) => s.ticker === q)) return null;
    return q;
  }, [search]);

  // If the user types a different ticker, clear the previous lookup so the
  // row re-shows the "Look up" button rather than stale data.
  useEffect(() => {
    if (customInfo && customInfo.ticker !== exactCustomMatch) {
      setCustomInfo(null);
      setCustomErr(null);
    }
  }, [exactCustomMatch, customInfo]);

  async function lookupCustom(ticker: string) {
    setCustomLoading(true);
    setCustomErr(null);
    setCustomInfo(null);
    try {
      const r = await fn.lookupTicker(ticker);
      setCustomInfo({
        ticker: r.ticker,
        price: r.price,
        change_pct: r.change_pct,
        name: r.name,
        sector: r.sector,
      });
      setPrices((p) => ({ ...p, [r.ticker]: { price: r.price, change_pct: r.change_pct } }));
    } catch (e: any) {
      setCustomErr(e.message);
    } finally {
      setCustomLoading(false);
    }
  }

  function requestDraft(ticker: string, price: number) {
    setErr(null);
    setConfirming({ ticker, price });
  }

  async function toggleQueue(ticker: string) {
    if (!me) return;
    setErr(null);
    try {
      if (queuedSet.has(ticker)) {
        await fn.queueRemove({ player_id: me.id, ticker });
      } else {
        await fn.queueAdd({ player_id: me.id, ticker });
      }
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function draftFromQueue(ticker: string) {
    const px = prices[ticker]?.price;
    if (!px) {
      // Fetch live price quickly so we can show the confirm with a real number.
      try {
        const r = await fn.lookupTicker(ticker);
        requestDraft(ticker, r.price);
      } catch (e: any) {
        setErr(e.message);
      }
    } else {
      requestDraft(ticker, px);
    }
  }

  async function confirmPick() {
    if (!confirming || !me) return;
    setSubmitting(true);
    setErr(null);
    try {
      await fn.makePick({ player_id: me.id, ticker: confirming.ticker });
      setConfirming(null);
      setSearch("");
      setCustomInfo(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!league || !ds) return <Center>Loading draft…</Center>;
  if (!me) {
    return (
      <div className="max-w-md mx-auto py-16 px-6 text-center space-y-3">
        <div className="text-5xl">🙅</div>
        <h1 className="text-2xl font-bold">You're not in this league</h1>
        <p className="text-gray-400">
          {user?.email} isn't an approved player. Ask the admin for an invite link, or sign out and sign in with the email you joined with.
        </p>
        <a href={`/?league=${leagueId}`} className="btn-ghost inline-block">View leaderboard</a>
      </div>
    );
  }
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

  return (
    <div className="max-w-7xl mx-auto py-6 px-6 space-y-6">
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
          <div className="text-2xl font-bold">
            {currentPlayer?.name || "?"}
            {isMyTurn && <span className="ml-2 text-accent text-sm">(your pick)</span>}
          </div>
        </div>
        <div className={`text-5xl font-mono ${remainingSec <= 10 ? "text-loss" : "text-accent"}`}>
          {remainingSec}s
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {me && (
            <QueuePanel
              playerId={me.id}
              queue={queue}
              companyNames={companyNames}
              isMyTurn={isMyTurn}
              onDraftFromQueue={draftFromQueue}
            />
          )}

          <div className="card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:justify-between">
              <div>
                <h2 className="font-semibold">Available stocks</h2>
                <p className="text-xs text-gray-500">
                  {isMyTurn
                    ? "Click Draft on any row to make your pick."
                    : `Waiting for ${currentPlayer?.name} to pick…`}
                </p>
              </div>
              <div className="flex-1 max-w-sm">
                <label htmlFor="d-search" className="label">Search any ticker or company</label>
                <TickerAutocomplete
                  inputId="d-search"
                  value={search}
                  onChange={setSearch}
                  onPick={(t) => {
                    if (!sp500.some((s) => s.ticker === t)) lookupCustom(t);
                  }}
                  excludeTickers={draftedTickers}
                  placeholder="e.g. NVDA, MU, ROKU"
                />
              </div>
            </div>

            {err && <div className="text-loss text-sm">{err}</div>}

            {exactCustomMatch && (
              <div className="rounded-lg border border-accent/40 bg-emerald-950/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="font-mono font-semibold text-lg">{exactCustomMatch}</div>
                  {customInfo?.ticker === exactCustomMatch ? (
                    <>
                      <div className="text-sm">
                        {customInfo.name || "—"}
                        {customInfo.sector && (
                          <span className="text-gray-500 ml-2">· {customInfo.sector}</span>
                        )}
                      </div>
                      <div className="text-sm font-mono mt-1">
                        ${customInfo.price.toFixed(2)}{" "}
                        <span className={customInfo.change_pct >= 0 ? "text-accent" : "text-loss"}>
                          ({customInfo.change_pct >= 0 ? "+" : ""}
                          {customInfo.change_pct.toFixed(2)}%)
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-400">
                      Outside top 50 — look up to see live price.
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {draftedTickers.has(exactCustomMatch) ? (
                    <span className="text-xs text-gray-500">Already drafted</span>
                  ) : (
                    <>
                      <button
                        className="btn-ghost text-sm"
                        onClick={() => toggleQueue(exactCustomMatch)}
                      >
                        {queuedSet.has(exactCustomMatch) ? "Queued ✓" : "+ Queue"}
                      </button>
                      {customInfo?.ticker === exactCustomMatch ? (
                        <button
                          className="btn-primary text-sm"
                          disabled={!isMyTurn}
                          onClick={() =>
                            requestDraft(exactCustomMatch, customInfo!.price)
                          }
                        >
                          Draft {exactCustomMatch}
                        </button>
                      ) : (
                        <button
                          className="btn-ghost text-sm"
                          disabled={customLoading}
                          onClick={() => lookupCustom(exactCustomMatch)}
                        >
                          {customLoading ? "Looking up…" : "Look up"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            {customErr && <div className="text-loss text-sm">{customErr}</div>}

            {/* Mobile: card stack */}
            <ul className="sm:hidden space-y-2">
              {filtered.map((s) => {
                const q = prices[s.ticker];
                const taken = draftedTickers.has(s.ticker);
                return (
                  <li
                    key={s.ticker}
                    className={`rounded-lg border border-gray-800 p-3 ${
                      taken ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono font-bold">{s.ticker}</div>
                        <div className="text-xs text-gray-400 truncate">{s.name}</div>
                        <div className="text-[10px] text-gray-500">{s.sector}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm">
                          {q ? `$${q.price.toFixed(2)}` : pricesLoading ? "…" : "—"}
                        </div>
                        <div
                          className={`text-xs font-mono ${
                            q == null
                              ? "text-gray-500"
                              : q.change_pct >= 0
                              ? "text-accent"
                              : "text-loss"
                          }`}
                        >
                          {q ? `${q.change_pct >= 0 ? "+" : ""}${q.change_pct.toFixed(2)}%` : ""}
                        </div>
                      </div>
                    </div>
                    {!taken && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          className="btn-ghost text-xs py-1.5"
                          onClick={() => toggleQueue(s.ticker)}
                        >
                          {queuedSet.has(s.ticker) ? "Queued ✓" : "+ Queue"}
                        </button>
                        <button
                          className="btn-primary text-xs py-1.5"
                          disabled={!isMyTurn || !q}
                          onClick={() => q && requestDraft(s.ticker, q.price)}
                        >
                          Draft
                        </button>
                      </div>
                    )}
                    {taken && (
                      <div className="mt-2 text-xs text-gray-500 text-center">Drafted</div>
                    )}
                  </li>
                );
              })}
              {filtered.length === 0 && !exactCustomMatch && (
                <li className="text-center text-gray-500 text-sm py-4">No matches in the top 50.</li>
              )}
            </ul>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 bg-black/30">
                  <tr>
                    <th className="text-left px-3 py-2">Ticker</th>
                    <th className="text-left px-3 py-2">Company</th>
                    <th className="text-left px-3 py-2 hidden sm:table-cell">Sector</th>
                    <th className="text-right px-3 py-2">Price</th>
                    <th className="text-right px-3 py-2">Day %</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const q = prices[s.ticker];
                    const taken = draftedTickers.has(s.ticker);
                    return (
                      <tr
                        key={s.ticker}
                        className={`border-t border-gray-800 ${taken ? "opacity-40" : "hover:bg-black/30"}`}
                      >
                        <td className="px-3 py-2 font-mono font-semibold">{s.ticker}</td>
                        <td className="px-3 py-2">{s.name}</td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{s.sector}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {q ? `$${q.price.toFixed(2)}` : pricesLoading ? "…" : "—"}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono ${
                            q?.change_pct == null
                              ? "text-gray-500"
                              : q.change_pct >= 0
                              ? "text-accent"
                              : "text-loss"
                          }`}
                        >
                          {q ? `${q.change_pct >= 0 ? "+" : ""}${q.change_pct.toFixed(2)}%` : ""}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {taken ? (
                            <span className="text-xs text-gray-500">Drafted</span>
                          ) : (
                            <div className="inline-flex gap-1">
                              <button
                                className="btn-ghost text-xs px-2 py-1"
                                onClick={() => toggleQueue(s.ticker)}
                                title={queuedSet.has(s.ticker) ? "Remove from queue" : "Add to queue"}
                              >
                                {queuedSet.has(s.ticker) ? "Queued ✓" : "+ Queue"}
                              </button>
                              <button
                                className="btn-primary text-xs px-3 py-1"
                                disabled={!isMyTurn || !q}
                                onClick={() => q && requestDraft(s.ticker, q.price)}
                              >
                                Draft
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !exactCustomMatch && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                        No matches in the top 50.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold mb-3">Draft board</h2>
            <DraftBoard players={players} holdings={holdings} stocksPerPlayer={league.stocks_per_player} />
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
            Draft <span className="font-mono font-bold">{confirming.ticker}</span> at $
            {confirming.price.toFixed(2)}?
          </p>
          {err && <div className="text-loss text-sm mb-2">{err}</div>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
            <button className="btn-primary" disabled={submitting} onClick={confirmPick}>
              {submitting ? "Drafting…" : "Confirm"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DraftBoard({
  players,
  holdings,
  stocksPerPlayer,
}: {
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
                  {h?.ticker ? h.ticker : "—"}
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
