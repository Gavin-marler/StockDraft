import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useAuth } from "./useAuth";

export type LeagueRef = {
  id: string;
  name: string;
  status: string;
  role: "admin" | "player" | "both";
};

// Loads all leagues the current user has any role in (admin OR approved player).
// Used by the top nav for the "My leagues" dropdown.
export function useLeagues() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<LeagueRef[]>([]);

  useEffect(() => {
    if (!user) {
      setLeagues([]);
      return;
    }
    let cancelled = false;
    async function load() {
      const [{ data: ownLeagues }, { data: playerRows }] = await Promise.all([
        supabase
          .from("leagues")
          .select("id, name, status")
          .eq("admin_user_id", user!.id),
        supabase
          .from("players")
          .select("league_id, status, leagues!inner(id, name, status, admin_user_id)")
          .eq("auth_user_id", user!.id),
      ]);
      if (cancelled) return;
      const map = new Map<string, LeagueRef>();
      for (const l of (ownLeagues as any[]) || []) {
        map.set(l.id, { id: l.id, name: l.name, status: l.status, role: "admin" });
      }
      for (const r of (playerRows as any[]) || []) {
        const lg = r.leagues;
        if (!lg) continue;
        const existing = map.get(lg.id);
        if (existing) existing.role = "both";
        else
          map.set(lg.id, {
            id: lg.id,
            name: lg.name,
            status: lg.status,
            role: "player",
          });
      }
      setLeagues([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return leagues;
}
