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
  const results = await Promise.all(tickers.map((t) => quote(t).then((q) => [t, q] as const)));
  for (const [t, q] of results) out[t] = q;
  return out;
}

export type Profile = { name: string; sector: string; exchange: string } | null;

export async function profile(ticker: string): Promise<Profile> {
  const url = `${BASE}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${key()}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || !j.name) return null;
  return {
    name: j.name as string,
    sector: (j.finnhubIndustry as string) || "—",
    exchange: (j.exchange as string) || "—",
  };
}

export type SearchHit = { ticker: string; name: string; type?: string };

export async function searchSymbols(query: string, limit = 10): Promise<SearchHit[]> {
  if (!query.trim()) return [];
  const url = `${BASE}/search?q=${encodeURIComponent(query)}&exchange=US&token=${key()}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  const results: any[] = Array.isArray(j?.result) ? j.result : [];
  return results
    .filter((x) => x?.symbol && x?.description && !String(x.symbol).includes("."))
    .slice(0, limit)
    .map((x) => ({
      ticker: String(x.symbol).toUpperCase(),
      name: String(x.description),
      type: x.type,
    }));
}
