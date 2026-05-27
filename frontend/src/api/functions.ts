import { supabase, functionsUrl } from "./supabaseClient";

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function call<T>(name: string, body: unknown, requireAuth = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: anonKey,
  };
  if (requireAuth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers.Authorization = `Bearer ${anonKey}`;
  }
  const res = await fetch(`${functionsUrl}/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data?.error || `Function ${name} failed`);
  return data as T;
}

export const fn = {
  createLeague: (b: {
    name: string;
    budget: number;
    stocks_per_player: number;
    max_players: number;
    start_date: string;
  }) => call<{ league_id: string; invite_token: string }>("create-league", b),

  joinLeague: (b: { invite_token: string; name: string }) =>
    call<{ player_id: string; league_id: string; status: "pending" | "approved" }>(
      "join-league",
      b,
    ),

  approvePlayer: (b: { player_id: string; action: "approve" | "reject" }) =>
    call<{ ok: true }>("approve-player", b),

  editPlayer: (b: { player_id: string; name: string }) =>
    call<{ ok: true }>("approve-player", { ...b, action: "edit" }),

  startDraft: (b: { league_id: string }) =>
    call<{ ok: true }>("start-draft", b),

  makePick: (b: { player_id: string; ticker: string }) =>
    call<{ ok: true }>("make-pick", b),

  autoDraft: (b: { league_id: string; admin?: boolean }) =>
    call<{ ok: true; ticker?: string }>("auto-draft", b),

  executeTrade: (b: { player_id: string; sell_holding_id: string; buy_ticker: string }) =>
    call<{ ok: true }>("execute-trade", b),

  fetchPrices: (b: { league_id: string; refresh?: boolean }) =>
    call<{
      prices: Record<string, { price: number; change_pct: number }>;
      last_updated: string;
    }>("fetch-prices", b, false),

  fetchTickerPrices: (tickers: string[], refresh = false) =>
    call<{
      prices: Record<string, { price: number; change_pct: number }>;
      last_updated: string;
    }>("fetch-prices", { tickers, refresh }, false),

  lookupTicker: (ticker: string) =>
    call<{
      prices: Record<string, { price: number; change_pct: number }>;
      last_updated: string;
    }>("fetch-prices", { tickers: [ticker.toUpperCase()], refresh: true }, false),

  deleteLeague: (b: { league_id: string }) =>
    call<{ ok: true }>("delete-league", b),
};
