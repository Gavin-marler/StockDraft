import { useMemo, useState } from "react";
import { fn } from "../api/functions";
import sp500 from "../data/sp500_top50.json";

type Player = { id: string; name: string; last_trade_month: string | null };
type Holding = {
  id: string;
  ticker: string | null;
  shares: number;
  buy_price: number;
  slot_value_usd: number;
  is_cash: boolean;
};

export default function TradeModal({
  player,
  holdings,
  heldTickers,
  prices,
  onClose,
}: {
  player: Player;
  holdings: Holding[];
  heldTickers: Set<string>;
  prices: Record<string, { price: number }>;
  onClose: () => void;
}) {
  const [sellId, setSellId] = useState<string>(holdings[0]?.id || "");
  const [buyTicker, setBuyTicker] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const alreadyTraded = player.last_trade_month === thisMonth;

  const available = useMemo(
    () => sp500.filter((s) => !heldTickers.has(s.ticker)),
    [heldTickers]
  );

  async function submit() {
    setErr(null);
    if (!sellId) return setErr("Pick a stock to sell.");
    const t = buyTicker.trim().toUpperCase();
    if (!t) return setErr("Enter a ticker to buy.");
    if (heldTickers.has(t)) return setErr(`${t} is currently held by someone.`);
    setSubmitting(true);
    try {
      await fn.executeTrade({ player_id: player.id, sell_holding_id: sellId, buy_ticker: t });
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-4">Trade — {player.name}</h3>
        {alreadyTraded ? (
          <>
            <div className="text-sm text-loss mb-4">
              You've already traded this month ({thisMonth}). Next trade available next month.
            </div>
            <div className="flex justify-end">
              <button className="btn-ghost" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="label">Sell</label>
                <select className="input" value={sellId} onChange={(e) => setSellId(e.target.value)}>
                  {holdings.map((h) => {
                    const px = h.ticker ? prices[h.ticker]?.price : null;
                    const curVal = h.is_cash || !px ? Number(h.slot_value_usd) : px * Number(h.shares);
                    const label = h.is_cash ? "CASH" : h.ticker;
                    return (
                      <option key={h.id} value={h.id}>
                        {label} (current value ${curVal.toFixed(2)})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="label">Buy ticker (free agent)</label>
                <input
                  className="input font-mono"
                  value={buyTicker}
                  onChange={(e) => setBuyTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. NFLX"
                />
                <div className="text-xs text-gray-500 mt-2">
                  Available popular tickers:{" "}
                  {available.slice(0, 12).map((s) => (
                    <button
                      key={s.ticker}
                      type="button"
                      className="font-mono mr-2 underline"
                      onClick={() => setBuyTicker(s.ticker)}
                    >
                      {s.ticker}
                    </button>
                  ))}
                </div>
              </div>
              {err && <div className="text-loss text-sm">{err}</div>}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={submitting} onClick={submit}>
                {submitting ? "Trading…" : "Execute trade"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
