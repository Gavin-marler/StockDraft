import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useAuth } from "./useAuth";

export type LeagueContext = {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  isPlayer: boolean;
} | null;

// Resolves the currently-viewed league (from `?league=` in the URL) plus the
// signed-in user's role within it. Used to render contextual nav links.
export function useLeagueContext(leagueId: string | null): LeagueContext {
  const { user } = useAuth();
  const [ctx, setCtx] = useState<LeagueContext>(null);

  useEffect(() => {
    if (!leagueId) {
      setCtx(null);
      return;
    }
    let cancelled = false;
    async function load() {
      const [{ data: league }, playerRow] = await Promise.all([
        supabase.from("leagues").select("id, name, status, admin_user_id").eq("id", leagueId).maybeSingle(),
        user
          ? supabase
              .from("players")
              .select("id, status")
              .eq("league_id", leagueId)
              .eq("auth_user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled || !league) {
        if (!cancelled) setCtx(null);
        return;
      }
      setCtx({
        id: league.id,
        name: league.name,
        status: league.status,
        isAdmin: !!user && league.admin_user_id === user.id,
        isPlayer: !!(playerRow.data && (playerRow.data as any).status === "approved"),
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [leagueId, user]);

  return ctx;
}
