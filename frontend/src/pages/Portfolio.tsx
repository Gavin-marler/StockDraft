import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import { fn } from "../api/functions";
import SignInGate from "../components/SignInGate";
import TradeModal from "../components/TradeModal";
import { useAuth } from "../hooks/useAuth";

type Player = { id: string; name: string; last_trade_month: string | null };
type Holding = {
  id: string;
  ticker: string | null;
  shares: number;
  buy_price: number;
  slot_value_usd: number;
  buy_date: string;
  is_cash: boolean;
};
type League = {
  id: string;
  name: string;
  status: string;
  stocks_per_player: number;
  budget: number;
};

export default function Portfolio() {
  const [params] = useSearchParams();
  const leagueId = params.get("league") || "";
  if (!leagueId) return <Center>Missing league id.</Center>;
  return (
    <SignInGate title="Sign in to view your portfolio">
      <PortfolioInner leagueId={leagueId} />
    </SignInGate>
  );
}

function PortfolioInner({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const [league, setLeague] = useState<League | null>(null);
  const [me, setMe] = useState<Player | null>(null);
  const [allPlayers, setAllPlayers] = useState<{ id: string; name: string; auth_user_id: string }[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [allHoldings, setAllHoldings] = useState<{ ticker: string | null }[]>([]);
  const [prices, setPrices] = useState<Record<string, { price: number; change_pct: number }>>({});
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);

  async function loadAll() {
    const [{ data: l }, { data: ps }, { data: allH }] = await Promise.all([
      supabase.from("leagues").select("id, name, status, stocks_per_player, budget").eq("id", leagueId).single(),
      supabase
        .from("players")
        .select("id, name, auth_user_id, last_trade_month")
        .eq("league_id", leagueId)
        .eq("status", "approved"),
      supabase
        .from("holdings")
        .select("ticker, players!inner(league_id)")
        .eq("players.league_id", leagueId),
    ]);
    if (l) setLeague(l as League);
    const players = (ps as any[]) || [];
    setAllPlayers(players);
    const mine = players.find((p) => p.auth_user_id === user?.id);
    setMe(mine || null);
    setAllHoldings(((allH as any[]) || []).map((h) => ({ ticker: h.ticker })));

    if (mine) {
      const { data: hs } = await supabase
        .from("holdings")
        .select("id, ticker, shares, buy_price, slot_value_usd, buy_date, is_cash")
        .eq("player_id", mine.id)
        .order("buy_date", { ascending: true });
      setHoldings((hs as Holding[]) || []);
    } else {
      setHoldings([]);
    }
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
      .channel(`portfolio:${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "holdings" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `league_id=eq.${leagueId}` }, loadAll)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, user?.id]);

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    for (const h of holdings) {
      cost += Number(h.slot_value_usd);
      if (h.is_cash || !h.ticker) {
        value += Number(h.slot_value_usd);
      } else {
        const px = prices[h.ticker]?.price;
        value += px ? px * Number(h.shares) : Number(h.slot_value_usd);
      }
    }
    return { value, cost, gain: value - cost, pct: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
  }, [holdings, prices]);

  const heldTickers = useMemo(
    () => new Set(allHoldings.filter((h) => h.ticker).map((h) => h.ticker as string)),
    [allHoldings],
  );

  if (!league) return <Center>Loading…</Center>;
  if (!me) {
    return (
      <div className="max-w-md mx-auto py-16 px-6 text-center space-y-3">
        <div className="text-5xl">🙅</div>
        <h1 className="text-2xl font-bold">You're not in this league</h1>
        <p className="text-gray-400">
          {user?.email} isn't an approved player here. Sign in with the email you joined with, or
          view the public leaderboard.
        </p>
        <a href={`/?league=${leagueId}`} className="btn-ghost inline-block">View leaderboard</a>
      </div>
    );
  }

  const canTrade = league.status === "active";
  const thisMonth = new Date().toISOString().slice(0, 7);
  const alreadyTraded = me.last_trade_month === thisMonth;

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">My Portfolio</h1>
          <div className="text-xs text-gray-500">
            {me.name} · {league.name} · {league.status}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">
            {lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : "—"}
          </span>
          <button className="btn-ghost text-sm" onClick={() => refreshPrices(true)}>Refresh</button>
          {canTrade && (
            <button
              className="btn-primary text-sm"
              disabled={alreadyTraded}
              title={alreadyTraded ? `Already traded this month (${thisMonth})` : "Trade a stock"}
              onClick={() => setTradeOpen(true)}
            >
              {alreadyTraded ? "Traded this month" : "Trade"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Portfolio value" value={`$${totals.value.toFixed(2)}`} />
        <Stat label="Total cost" value={`$${totals.cost.toFixed(2)}`} />
        <Stat
          label="Gain / loss"
          value={`${totals.gain >= 0 ? "+" : ""}$${totals.gain.toFixed(2)}`}
          tone={totals.gain >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Return"
          value={`${totals.pct >= 0 ? "+" : ""}${totals.pct.toFixed(2)}%`}
          tone={totals.pct >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Holdings</h2>
        {holdings.length === 0 ? (
          <p className="text-gray-500 text-sm">No holdings yet. The draft hasn't placed any stocks.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 text-left">
                <tr>
                  <th className="py-2">Ticker</th>
                  <th>Shares</th>
                  <th>Buy price</th>
                  <th>Current</th>
                  <th>Value</th>
                  <th>Gain</th>
                  <th>%</th>
                  <th>Bought</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  if (h.is_cash || !h.ticker) {
                    return (
                      <tr key={h.id} className="border-t border-gray-800">
                        <td className="py-2 font-mono">CASH</td>
                        <td colSpan={4} className="text-gray-500">Idle slot</td>
                        <td className="text-right">$0.00</td>
                        <td className="text-right">0.00%</td>
                        <td className="text-gray-500">{new Date(h.buy_date).toLocaleDateString()}</td>
                      </tr>
                    );
                  }
                  const px = prices[h.ticker]?.price;
                  const value = px ? px * Number(h.shares) : Number(h.slot_value_usd);
                  const gain = value - Number(h.slot_value_usd);
                  const pct = Number(h.buy_price) > 0
                    ? (((px || Number(h.buy_price)) - Number(h.buy_price)) / Number(h.buy_price)) * 100
                    : 0;
                  return (
                    <tr key={h.id} className="border-t border-gray-800">
                      <td className="py-2 font-mono font-semibold">{h.ticker}</td>
                      <td className="font-mono">{Number(h.shares).toFixed(4)}</td>
                      <td className="font-mono">${Number(h.buy_price).toFixed(2)}</td>
                      <td className="font-mono">{px ? `$${px.toFixed(2)}` : "—"}</td>
                      <td className="font-mono">${value.toFixed(2)}</td>
                      <td className={`font-mono ${gain >= 0 ? "text-accent" : "text-loss"}`}>
                        {gain >= 0 ? "+" : ""}${gain.toFixed(2)}
                      </td>
                      <td className={`font-mono ${pct >= 0 ? "text-accent" : "text-loss"}`}>
                        {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                      </td>
                      <td className="text-gray-500">{new Date(h.buy_date).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {tradeOpen && (
        <TradeModal
          player={me}
          holdings={holdings}
          heldTickers={heldTickers}
          prices={prices}
          onClose={() => {
            setTradeOpen(false);
            loadAll();
            refreshPrices(true);
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`text-xl font-bold mt-1 ${
          tone === "good" ? "text-accent" : tone === "bad" ? "text-loss" : ""
        }`}
      >
        {value}
      </div>
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
  return `${Math.floor(h / 24)}d ago`;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-gray-400">{children}</div>;
}
