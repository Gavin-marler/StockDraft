import { functionsUrl } from "./supabaseClient";

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function call<T>(name: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${functionsUrl}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      ...headers,
    },
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
    admin_password: string;
    start_date: string;
  }) => call<{ league_id: string; invite_token: string; admin_token: string }>("create-league", b),

  adminLogin: (b: { league_id: string; password: string }) =>
    call<{ admin_token: string }>("admin-login", b),

  joinLeague: (b: { invite_token: string; name: string; pin: string }) =>
    call<{ player_id: string; league_id: string }>("join-league", b),

  approvePlayer: (b: { player_id: string; action: "approve" | "reject" }, token: string) =>
    call<{ ok: true }>("approve-player", b, { "x-admin-token": token }),

  editPlayer: (b: { player_id: string; name: string }, token: string) =>
    call<{ ok: true }>("approve-player", { ...b, action: "edit" }, { "x-admin-token": token }),

  generateResetLink: (b: { player_id: string }, token: string) =>
    call<{ token: string; url: string }>("reset-pin", { ...b, mode: "generate" }, { "x-admin-token": token }),

  consumeResetLink: (b: { token: string; new_pin: string }) =>
    call<{ ok: true }>("reset-pin", { ...b, mode: "consume" }),

  startDraft: (b: { league_id: string }, token: string) =>
    call<{ ok: true }>("start-draft", b, { "x-admin-token": token }),

  makePick: (b: { player_id: string; pin: string; ticker: string }) =>
    call<{ ok: true }>("make-pick", b),

  autoDraft: (b: { league_id: string; admin?: boolean }, token?: string) =>
    call<{ ok: true; ticker?: string }>(
      "auto-draft",
      b,
      token ? { "x-admin-token": token } : {}
    ),

  executeTrade: (b: {
    player_id: string;
    pin: string;
    sell_holding_id: string;
    buy_ticker: string;
  }) => call<{ ok: true }>("execute-trade", b),

  fetchPrices: (b: { league_id: string; refresh?: boolean }) =>
    call<{ prices: Record<string, { price: number; change_pct: number }>; last_updated: string }>(
      "fetch-prices",
      b
    ),

  finalizeLeague: (b: { league_id: string }, token: string) =>
    call<{ ok: true }>("finalize-league", b, { "x-admin-token": token }),

  deleteLeague: (b: { league_id: string }, token: string) =>
    call<{ ok: true }>("delete-league", b, { "x-admin-token": token }),

  lookupTicker: (ticker: string) =>
    call<{ prices: Record<string, { price: number; change_pct: number }>; last_updated: string }>(
      "fetch-prices",
      { tickers: [ticker.toUpperCase()], refresh: true }
    ),

  fetchTickerPrices: (tickers: string[], refresh = false) =>
    call<{ prices: Record<string, { price: number; change_pct: number }>; last_updated: string }>(
      "fetch-prices",
      { tickers, refresh }
    ),
};
