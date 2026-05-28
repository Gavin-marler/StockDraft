// Shared draft logic: snake order + advance + completion check.
import { serviceClient } from "./supabase.ts";
import { quote } from "./finnhub.ts";
import { SP500_TOP50 } from "./sp500.ts";

export const PICK_TIMER_SECONDS = 60;

export function snakeAt(round: number, position: number, n: number): number {
  // round/position 1-indexed. Returns 0-indexed player index in approved-by-created_at order.
  return round % 2 === 1 ? position - 1 : n - position;
}

export type Player = { id: string; name: string; created_at: string };

export async function loadApprovedPlayers(leagueId: string): Promise<Player[]> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("players")
    .select("id, name, created_at")
    .eq("league_id", leagueId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Player[]) || [];
}

export async function pickCountForPlayer(playerId: string): Promise<number> {
  const sb = serviceClient();
  const { count } = await sb
    .from("holdings")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId);
  return count || 0;
}

export async function totalPicksInLeague(leagueId: string): Promise<number> {
  const sb = serviceClient();
  const { count } = await sb
    .from("holdings")
    .select("id, players!inner(league_id)", { count: "exact", head: true })
    .eq("players.league_id", leagueId);
  return count || 0;
}

export async function draftedTickers(leagueId: string): Promise<Set<string>> {
  const sb = serviceClient();
  const { data } = await sb
    .from("holdings")
    .select("ticker, players!inner(league_id)")
    .eq("players.league_id", leagueId)
    .not("ticker", "is", null);
  return new Set(((data as any[]) || []).map((h) => h.ticker as string));
}

// Determine whose turn it is from total picks and player count.
export function currentTurn(totalPicks: number, n: number, rounds: number):
  | { complete: true }
  | { complete: false; round: number; position: number; playerIndex: number } {
  if (totalPicks >= n * rounds) return { complete: true };
  const round = Math.floor(totalPicks / n) + 1;
  const position = (totalPicks % n) + 1;
  return { complete: false, round, position, playerIndex: snakeAt(round, position, n) };
}

export async function advanceDraft(leagueId: string): Promise<void> {
  const sb = serviceClient();
  const { data: league } = await sb.from("leagues").select("stocks_per_player").eq("id", leagueId).single();
  if (!league) throw new Error("League not found");
  const players = await loadApprovedPlayers(leagueId);
  const totalPicks = await totalPicksInLeague(leagueId);
  const turn = currentTurn(totalPicks, players.length, league.stocks_per_player);
  if (turn.complete) {
    await sb
      .from("draft_state")
      .update({ status: "complete", current_player_id: null, pick_deadline: null })
      .eq("league_id", leagueId);
    await sb.from("leagues").update({ status: "active" }).eq("id", leagueId);
    return;
  }
  const next = players[turn.playerIndex];
  // Fresh 60s for every pick — including back-to-back snake turns where
  // the same player picks last in round N and first in round N+1. The same
  // `pick_deadline` write fires for both transitions; don't collapse this.
  const deadline = new Date(Date.now() + PICK_TIMER_SECONDS * 1000).toISOString();
  await sb
    .from("draft_state")
    .update({
      status: "picking",
      current_round: turn.round,
      current_player_id: next.id,
      pick_deadline: deadline,
    })
    .eq("league_id", leagueId);
}

// Execute a pick (no PIN check, no turn check — caller guarantees both).
export async function executePick(
  leagueId: string,
  playerId: string,
  ticker: string,
  price: number,
  autoDraft = false,
): Promise<void> {
  const sb = serviceClient();
  const { data: league } = await sb
    .from("leagues")
    .select("budget, stocks_per_player")
    .eq("id", leagueId)
    .single();
  if (!league) throw new Error("League not found");
  const slotValue = Number(league.budget) / Number(league.stocks_per_player);
  const shares = slotValue / price;
  const { error } = await sb.from("holdings").insert({
    player_id: playerId,
    ticker,
    shares,
    buy_price: price,
    slot_value_usd: slotValue,
    is_cash: false,
  });
  if (error) throw error;
  await sb.from("prices").upsert({ ticker, price, change_pct: 0, fetched_at: new Date().toISOString() });
  // Remove this ticker from every player's queue in this league.
  await sb.from("draft_queue").delete().eq("league_id", leagueId).eq("ticker", ticker);
  const { data: player } = await sb.from("players").select("name").eq("id", playerId).single();
  await sb.from("activity").insert({
    league_id: leagueId,
    player_id: playerId,
    type: autoDraft ? "auto_draft" : "draft_pick",
    ticker,
    description: autoDraft
      ? `${player?.name ?? "?"} was auto-drafted ${ticker}`
      : `${player?.name ?? "?"} drafted ${ticker}`,
  });
}

// Auto-draft selection. Tries the player's queue first (top of queue, skipping
// any tickers already drafted), then falls back to the highest-market-cap
// undrafted ticker from our curated S&P 50 list.
export async function pickAutoDraftTicker(
  leagueId: string,
  playerId: string,
): Promise<{ ticker: string; price: number } | null> {
  const sb = serviceClient();
  const drafted = await draftedTickers(leagueId);

  const { data: queueRows } = await sb
    .from("draft_queue")
    .select("ticker")
    .eq("player_id", playerId)
    .order("position", { ascending: true });
  for (const row of (queueRows as { ticker: string }[]) || []) {
    if (drafted.has(row.ticker)) continue;
    const q = await quote(row.ticker);
    if (q) return { ticker: row.ticker, price: q.price };
  }

  for (const t of SP500_TOP50) {
    if (drafted.has(t)) continue;
    const q = await quote(t);
    if (q) return { ticker: t, price: q.price };
  }
  return null;
}
