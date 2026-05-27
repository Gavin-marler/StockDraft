// Auth helpers backed by Supabase Auth.
// All non-public Edge Functions expect `verify_jwt = true` in config.toml,
// which means Supabase has already validated the JWT before invoking us.
// We just need to resolve user_id from the bearer token to authorize actions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { serviceClient } from "./supabase.ts";

export type AuthUser = { id: string; email: string | null };

export async function requireUser(req: Request): Promise<AuthUser> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing Authorization header");

  // Use a fresh client with the user's token to resolve identity.
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid session");
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function requireLeagueAdmin(req: Request, league_id: string): Promise<AuthUser> {
  const user = await requireUser(req);
  const sb = serviceClient();
  const { data } = await sb.from("leagues").select("admin_user_id").eq("id", league_id).maybeSingle();
  if (!data) throw new Error("League not found");
  if (data.admin_user_id !== user.id) throw new Error("Not the league admin");
  return user;
}

export async function requirePlayerOwner(req: Request, player_id: string): Promise<{
  user: AuthUser;
  player: { id: string; name: string; league_id: string; status: string };
}> {
  const user = await requireUser(req);
  const sb = serviceClient();
  const { data } = await sb
    .from("players")
    .select("id, name, league_id, status, auth_user_id")
    .eq("id", player_id)
    .maybeSingle();
  if (!data) throw new Error("Player not found");
  if (data.auth_user_id !== user.id) throw new Error("Not authorized for this player");
  return { user, player: data };
}
