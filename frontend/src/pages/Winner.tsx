import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import { fn } from "../api/functions";
import ConfettiBurst from "../components/ConfettiBurst";

type Player = { id: string; name: string };
type Holding = {
  id: string;
  player_id: string;
  ticker: string | null;
  shares: number;
  buy_price: number;
  slot_value_usd: number;
  is_cash: boolean;
};
type League = { id: string; name: string; stocks_per_player: number; budget: number; status: string };

export default function Winner() {
  const [params] = useSearchParams();
  const leagueId = params.get("league") || "";
  const [league, setLeague] = useState<League | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<Record<string, { price: number }>>({});

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      const [{ data: l }, { data: ps }, { data: hs }, p] = await Promise.all([
        supabase.from("leagues").select("*").eq("id", leagueId).single(),
        supabase.from("players").select("id, name").eq("league_id", leagueId).eq("status", "approved"),
        supabase
          .from("holdings")
          .select("*, players!inner(league_id)")
          .eq("players.league_id", leagueId),
        fn.fetchPrices({ league_id: leagueId }),
      ]);
      if (l) setLeague(l as League);
      setPlayers((ps as Player[]) || []);
      setHoldings(((hs as any[]) || []).map((h) => ({ ...h, players: undefined })));
      setPrices(p.prices);
    })();
  }, [leagueId]);

  const ranks = useMemo(() => {
    if (!league) return [];
    return players
      .map((p) => {
        const ph = holdings.filter((h) => h.player_id === p.id);
        let value = 0;
        let cost = 0;
        for (const h of ph) {
          cost += Number(h.slot_value_usd);
          if (h.is_cash || !h.ticker) value += Number(h.slot_value_usd);
          else {
            const px = prices[h.ticker]?.price;
            value += px ? px * Number(h.shares) : Number(h.slot_value_usd);
          }
        }
        return { p, value, gain: value - cost, pct: cost ? ((value - cost) / cost) * 100 : 0 };
      })
      .sort((a, b) => b.value - a.value);
  }, [league, players, holdings, prices]);

  if (!leagueId) return <div className="p-10">Missing league.</div>;
  if (!league) return <div className="p-10">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto py-12 px-6 text-center space-y-8">
      <ConfettiBurst />
      <div>
        <div className="text-7xl mb-4">🏆</div>
        <h1 className="text-4xl font-bold">{ranks[0]?.p.name} wins {league.name}!</h1>
        <p className="text-gray-400 mt-2">Final results</p>
      </div>
      <div className="card text-left">
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-left">
            <tr>
              <th className="py-1">#</th>
              <th>Player</th>
              <th className="text-right">Value</th>
              <th className="text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {ranks.map((r, i) => (
              <tr key={r.p.id} className="border-t border-gray-800">
                <td className="py-2">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                <td className="font-medium">{r.p.name}</td>
                <td className="text-right">${r.value.toFixed(2)}</td>
                <td className={`text-right ${r.pct >= 0 ? "text-accent" : "text-loss"}`}>
                  {r.pct >= 0 ? "+" : ""}{r.pct.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <a href={`/?league=${leagueId}`} className="btn-ghost inline-block">Back to leaderboard</a>
    </div>
  );
}
