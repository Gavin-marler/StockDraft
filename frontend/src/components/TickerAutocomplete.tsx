import { useEffect, useRef, useState } from "react";
import { fn } from "../api/functions";

type Hit = { ticker: string; name: string };

export default function TickerAutocomplete({
  value,
  onChange,
  onPick,
  placeholder = "e.g. NFLX",
  excludeTickers,
  inputId,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (ticker: string) => void;
  placeholder?: string;
  excludeTickers?: Set<string>;
  inputId?: string;
}) {
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fn.searchTickers(q);
        const filtered = excludeTickers
          ? r.results.filter((h) => !excludeTickers.has(h.ticker))
          : r.results;
        setHits(filtered);
        setActiveIdx(filtered.length > 0 ? 0 : -1);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, excludeTickers]);

  function pick(h: Hit) {
    onChange(h.ticker);
    onPick?.(h.ticker);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(hits[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        id={inputId}
        className="input font-mono"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {open && (hits.length > 0 || loading) && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-panel border border-gray-800 rounded-lg max-h-64 overflow-auto shadow-xl">
          {loading && hits.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-500">Searching…</li>
          )}
          {hits.map((h, i) => (
            <li
              key={h.ticker}
              className={`px-3 py-2 cursor-pointer text-sm flex justify-between gap-3 ${
                i === activeIdx ? "bg-black/40" : "hover:bg-black/30"
              }`}
              // mousedown beats the input's blur, so the click goes through
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
            >
              <span className="font-mono font-semibold">{h.ticker}</span>
              <span className="text-gray-400 truncate">{h.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
