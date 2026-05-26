import { useEffect, useMemo, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { fn } from "../api/functions";
import ConfettiBurst from "../components/ConfettiBurst";
import TradeModal from "../components/TradeModal";

type Player = { id: string; name: string; last_trade_month: string | null };
type Holding = {
  id: string;
  player_id: string;
  ticker: string | null;
  shares: number;
  buy_price: number;
  slot_value_usd: number;
  is_cash: boolean;
};
type Activity = {
  id: string;
  type: string;
  description: string;
  created_at: string;
};
type League = {
  id: string;
  name: string;
  status: string;
  stocks_per_player: number;
  budget: number;
  end_date: string;
};

export default function Leaderboard({ leagueId }: { leagueId: string }) {
  const [league, setLeague] = useState<League | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<Record<string, { price: number; change_pct: number }>>({});
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [tradeFor, setTradeFor] = useState<Player | null>(null);

  async function loadAll() {
    const [{ data: l }, { data: ps }, { data: hs }, { data: act }] = await Promise.all([
      supabase.from("leagues").select("*").eq("id", leagueId).single(),
      supabase
        .from("players")
        .select("id, name, last_trade_month")
        .eq("league_id", leagueId)
        .eq("status", "approved"),
      supabase
        .from("holdings")
        .select("id, player_id, ticker, shares, buy_price, slot_value_usd, is_cash, players!inner(league_id)")
        .eq("players.league_id", leagueId),
      supabase
        .from("activity")
        .select("id, type, description, created_at")
        .eq("league_id", leagueId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (l) setLeague(l as League);
    setPlayers((ps as Player[]) || []);
    setHoldings(((hs as any[]) || []).map((h) => ({ ...h, players: undefined })));
    setActivity((act as Activity[]) || []);
  }

  async function refreshPrices(force = false) {
    try {
      const r = await fn.fetchPrices({ league_id: leagueId, refresh: force });
      setPrices(r.prices);
      setLastUpdated(r.last_updated);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    loadAll();
    refreshPrices();
    const ch = supabase
      .channel(`board:${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leagues", filter: `id=eq.${leagueId}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity", filter: `league_id=eq.${leagueId}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "holdings" }, loadAll)
      .subscribe();
    const interval = setInterval(() => refreshPrices(false), 5 * 60 * 1000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  const rankings = useMemo(() => {
    if (!league) return [];
    const slotCost = league.budget / league.stocks_per_player;
    return players
      .map((p) => {
        const ph = holdings.filter((h) => h.player_id === p.id);
        let value = 0;
        let cost = 0;
        for (const h of ph) {
          cost += Number(h.slot_value_usd);
          if (h.is_cash || !h.ticker) {
            value += Number(h.slot_value_usd);
          } else {
            const px = prices[h.ticker]?.price;
            value += px ? px * Number(h.shares) : Number(h.slot_value_usd);
          }
        }
        const missing = league.stocks_per_player - ph.length;
        if (missing > 0) {
          cost += missing * slotCost;
          value += missing * slotCost;
        }
        const gain = value - cost;
        const pct = cost > 0 ? (gain / cost) * 100 : 0;
        return { player: p, value, cost, gain, pct };
      })
      .sort((a, b) => b.value - a.value);
  }, [players, holdings, prices, league]);

  const stockPerf = useMemo(() => {
    const items = holdings
      .filter((h) => !h.is_cash && h.ticker && prices[h.ticker])
      .map((h) => {
        const cur = prices[h.ticker!].price;
        const pct = ((cur - Number(h.buy_price)) / Number(h.buy_price)) * 100;
        const playerName = players.find((p) => p.id === h.player_id)?.name || "?";
        return { ticker: h.ticker!, pct, playerName };
      });
    const sorted = [...items].sort((a, b) => b.pct - a.pct);
    return { top: sorted.slice(0, 5), bottom: [...sorted].reverse().slice(0, 5) };
  }, [holdings, prices, players]);

  if (!league) return <div className="p-10 text-gray-400">Loading…</div>;
  const isComplete = league.status === "complete";
  const winner = isComplete && rankings[0] ? rankings[0].player.name : null;

  return (
    <div className="max-w-6xl mx-auto py-8 px-6 space-y-6">
      {isComplete && winner && (
        <div className="card border-accent text-center relative overflow-hidden">
          <ConfettiBurst />
          <div className="text-5xl mb-2">🏆</div>
          <div className="text-2xl font-bold">{winner} wins {league.name}!</div>
          <a href="/winner" className="btn-primary mt-3 inline-block">View final results</a>
        </div>
      )}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-bold">{league.name}</h1>
          <div className="text-xs text-gray-500">
            Status: {league.status} · Ends {league.end_date}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">
            {lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : "—"}
          </span>
          <button className="btn-ghost text-sm" onClick={() => refreshPrices(true)}>Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="font-semibold mb-4">Standings</h2>
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-left">
                <tr>
                  <th className="py-1">#</th>
                  <th>Player</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Gain</th>
                  <th className="text-right">%</th>
                  {league.status === "active" && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rankings.map((r, i) => (
                  <tr key={r.player.id} className="border-t border-gray-800">
                    <td className="py-2">{i + 1}</td>
                    <td className="font-medium">{r.player.name}</td>
                    <td className="text-right">${r.value.toFixed(2)}</td>
                    <td className={`text-right ${r.gain >= 0 ? "text-accent" : "text-loss"}`}>
                      {r.gain >= 0 ? "+" : ""}${r.gain.toFixed(2)}
                    </td>
                    <td className={`text-right ${r.pct >= 0 ? "text-accent" : "text-loss"}`}>
                      {r.pct >= 0 ? "+" : ""}{r.pct.toFixed(2)}%
                    </td>
                    {league.status === "active" && (
                      <td className="text-right">
                        <button
                          className="btn-ghost text-xs"
                          onClick={() => setTradeFor(r.player)}
                        >
                          Trade
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PerfList title="Top 5 stocks" items={stockPerf.top} positive />
            <PerfList title="Bottom 5 stocks" items={stockPerf.bottom} positive={false} />
          </div>
        </div>

        <div className="card h-fit">
          <h2 className="font-semibold mb-3">Activity</h2>
          <ul className="space-y-2 text-sm max-h-[600px] overflow-y-auto">
            {activity.map((a) => (
              <li key={a.id} className="border-b border-gray-800 pb-2">
                <div>{a.description}</div>
                <div className="text-xs text-gray-500">{timeAgo(a.created_at)}</div>
              </li>
            ))}
            {activity.length === 0 && <li className="text-gray-500">No activity yet.</li>}
          </ul>
        </div>
      </div>

      {tradeFor && (
        <TradeModal
          player={tradeFor}
          leagueId={leagueId}
          holdings={holdings.filter((h) => h.player_id === tradeFor.id)}
          heldTickers={new Set(holdings.filter((h) => h.ticker).map((h) => h.ticker!))}
          prices={prices}
          onClose={() => {
            setTradeFor(null);
            loadAll();
            refreshPrices(true);
          }}
        />
      )}
    </div>
  );
}

function PerfList({
  title,
  items,
  positive,
}: {
  title: string;
  items: { ticker: string; pct: number; playerName: string }[];
  positive: boolean;
}) {
  return (
    <div className="card">
      <h3 className="font-semibold mb-3">{title}</h3>
      {items.length === 0 ? (
        <div className="text-gray-500 text-sm">No data.</div>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((s, i) => (
            <li key={i} className="flex justify-between">
              <span>
                <span className="font-mono">{s.ticker}</span>
                <span className="text-gray-500 ml-2 text-xs">{s.playerName}</span>
              </span>
              <span className={positive ? "text-accent" : "text-loss"}>
                {s.pct >= 0 ? "+" : ""}{s.pct.toFixed(2)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
