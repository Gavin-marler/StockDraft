import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

export type QueueEntry = { id: string; ticker: string; position: number };

// Subscribes to the signed-in player's draft queue. RLS guarantees we only
// see our own rows even if the channel filter is loose.
export function useQueue(playerId: string | null | undefined) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);

  useEffect(() => {
    if (!playerId) {
      setQueue([]);
      return;
    }
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("draft_queue")
        .select("id, ticker, position")
        .eq("player_id", playerId)
        .order("position", { ascending: true });
      if (!cancelled) setQueue((data as QueueEntry[]) || []);
    }
    load();
    const ch = supabase
      .channel(`queue:${playerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_queue", filter: `player_id=eq.${playerId}` },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [playerId]);

  return queue;
}
