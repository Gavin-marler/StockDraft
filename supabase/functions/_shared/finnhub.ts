const BASE = "https://finnhub.io/api/v1";

function key(): string {
  const k = Deno.env.get("FINNHUB_API_KEY");
  if (!k) throw new Error("FINNHUB_API_KEY not set");
  return k;
}

export type Quote = { price: number; change_pct: number } | null;

export async function quote(ticker: string): Promise<Quote> {
  const url = `${BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${key()}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  // Finnhub returns c=0 for unknown symbols.
  if (!j || typeof j.c !== "number" || j.c === 0) return null;
  const change_pct = typeof j.dp === "number" ? j.dp : 0;
  return { price: j.c, change_pct };
}

export async function batchQuotes(tickers: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  // Finnhub free tier: 60/min — small batches & parallel ok for league sizes ≤ 8*5 = 40.
  const results = await Promise.all(tickers.map((t) => quote(t).then((q) => [t, q] as const)));
  for (const [t, q] of results) out[t] = q;
  return out;
}
