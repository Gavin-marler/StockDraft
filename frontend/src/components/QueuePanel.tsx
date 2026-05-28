import { useState } from "react";
import { fn } from "../api/functions";
import type { QueueEntry } from "../hooks/useQueue";

export default function QueuePanel({
  playerId,
  queue,
  companyNames,
  isMyTurn,
  onDraftFromQueue,
}: {
  playerId: string;
  queue: QueueEntry[];
  companyNames: Record<string, string>;
  isMyTurn: boolean;
  onDraftFromQueue?: (ticker: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(ticker: string, action: "remove" | "up" | "down") {
    setBusy(ticker + ":" + action);
    setErr(null);
    try {
      if (action === "remove") {
        await fn.queueRemove({ player_id: playerId, ticker });
      } else {
        await fn.queueReorder({ player_id: playerId, ticker, direction: action });
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold">My queue ({queue.length})</h2>
        <span className="text-xs text-gray-500">Auto-drafted top-to-bottom on timer expiry</span>
      </div>

      {queue.length === 0 ? (
        <p className="text-xs text-gray-500">
          Queue stocks you want — when your timer runs out we'll draft the top available one for you.
        </p>
      ) : (
        <ol className="space-y-2">
          {queue.map((q, i) => (
            <li
              key={q.id}
              className="flex items-center justify-between gap-2 rounded border border-gray-800 px-3 py-2"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-gray-500 font-mono w-5 shrink-0">{i + 1}</span>
                <div className="min-w-0">
                  <div className="font-mono font-semibold">{q.ticker}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {companyNames[q.ticker] ?? ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="btn-ghost text-xs px-2 py-1"
                  disabled={i === 0 || busy !== null}
                  onClick={() => act(q.ticker, "up")}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  className="btn-ghost text-xs px-2 py-1"
                  disabled={i === queue.length - 1 || busy !== null}
                  onClick={() => act(q.ticker, "down")}
                  aria-label="Move down"
                >
                  ↓
                </button>
                {isMyTurn && onDraftFromQueue && (
                  <button
                    className="btn-primary text-xs px-2 py-1"
                    disabled={busy !== null}
                    onClick={() => onDraftFromQueue(q.ticker)}
                  >
                    Draft
                  </button>
                )}
                <button
                  className="btn-ghost text-xs px-2 py-1 text-loss"
                  disabled={busy !== null}
                  onClick={() => act(q.ticker, "remove")}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {err && <div className="text-loss text-xs mt-2">{err}</div>}
    </div>
  );
}
