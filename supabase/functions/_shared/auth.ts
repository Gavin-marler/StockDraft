import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const enc = new TextEncoder();
let _key: CryptoKey | null = null;

async function jwtKey(): Promise<CryptoKey> {
  if (_key) return _key;
  const secret = Deno.env.get("ADMIN_JWT_SECRET");
  if (!secret) throw new Error("ADMIN_JWT_SECRET not set");
  _key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return _key;
}

export async function hash(plaintext: string): Promise<string> {
  return bcrypt.hashSync(plaintext, 10);
}

export async function compare(plaintext: string, hashed: string): Promise<boolean> {
  return bcrypt.compareSync(plaintext, hashed);
}

export async function signAdminToken(league_id: string, ttlSec = 12 * 3600): Promise<string> {
  return await create(
    { alg: "HS256", typ: "JWT" },
    { league_id, role: "admin", exp: getNumericDate(ttlSec) },
    await jwtKey(),
  );
}

export async function verifyAdminToken(token: string): Promise<{ league_id: string }> {
  const payload = await verify(token, await jwtKey());
  if (payload.role !== "admin" || typeof payload.league_id !== "string") {
    throw new Error("Invalid admin token");
  }
  return { league_id: payload.league_id };
}

export function requireAdminTokenForLeague(req: Request, league_id: string): Promise<void> {
  const token = req.headers.get("x-admin-token");
  if (!token) throw new Error("Missing admin token");
  return verifyAdminToken(token).then((p) => {
    if (p.league_id !== league_id) throw new Error("Admin token league mismatch");
  });
}
