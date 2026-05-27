import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useLeagues } from "../hooks/useLeagues";
import { useLeagueContext } from "../hooks/useLeagueContext";
import SignInModal from "./SignInModal";

export default function TopBar() {
  const { user, signOut } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const leagueId = params.get("league");
  const ctx = useLeagueContext(leagueId);
  const leagues = useLeagues();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  function isActive(path: string) {
    return location.pathname === path;
  }

  return (
    <header className="border-b border-gray-800 bg-bg sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/" className="font-bold tracking-tight whitespace-nowrap">StockDraft</Link>
          {ctx && (
            <>
              <span className="text-gray-600 hidden sm:inline">/</span>
              <span className="text-sm text-gray-300 truncate hidden sm:inline">{ctx.name}</span>
            </>
          )}
        </div>

        <nav className="flex items-center gap-1 text-sm">
          {ctx && (
            <>
              <NavLink to={`/?league=${ctx.id}`} active={isActive("/") && params.get("league") === ctx.id}>
                Leaderboard
              </NavLink>
              {(ctx.status === "drafting" || ctx.status === "active") && ctx.isPlayer && (
                <NavLink
                  to={`/draft?league=${ctx.id}`}
                  active={isActive("/draft") && params.get("league") === ctx.id}
                >
                  Draft
                </NavLink>
              )}
              {(ctx.status === "active" || ctx.status === "complete") && ctx.isPlayer && (
                <NavLink
                  to={`/portfolio?league=${ctx.id}`}
                  active={isActive("/portfolio") && params.get("league") === ctx.id}
                >
                  My Portfolio
                </NavLink>
              )}
              {ctx.isAdmin && (
                <NavLink
                  to={`/admin?league=${ctx.id}`}
                  active={isActive("/admin") && params.get("league") === ctx.id}
                >
                  Admin
                </NavLink>
              )}
            </>
          )}

          {user && leagues.length > 0 && (
            <div className="relative">
              <button
                className="px-3 py-1.5 rounded hover:bg-panel text-gray-300"
                onClick={() => setMenuOpen((v) => !v)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              >
                My leagues ▾
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-64 bg-panel border border-gray-800 rounded-lg shadow-xl py-2 z-50">
                  {leagues.map((l) => (
                    <Link
                      key={l.id}
                      to={`/?league=${l.id}`}
                      className="block px-4 py-2 hover:bg-black/40 text-sm"
                      onClick={() => setMenuOpen(false)}
                    >
                      <div className="flex justify-between">
                        <span className="truncate">{l.name}</span>
                        <span className="text-xs text-gray-500 ml-2 capitalize">{l.role}</span>
                      </div>
                      <div className="text-xs text-gray-500">{l.status}</div>
                    </Link>
                  ))}
                  <div className="border-t border-gray-800 mt-1 pt-1">
                    <Link
                      to="/create"
                      className="block px-4 py-2 hover:bg-black/40 text-sm text-accent"
                      onClick={() => setMenuOpen(false)}
                    >
                      + New league
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {user ? (
            <div className="flex items-center gap-2 pl-3 ml-1 border-l border-gray-800">
              <span className="text-gray-400 text-xs hidden md:inline">{user.email}</span>
              <button className="btn-ghost text-xs" onClick={() => signOut()}>Sign out</button>
            </div>
          ) : (
            <button className="btn-primary text-xs" onClick={() => setSignInOpen(true)}>
              Sign in
            </button>
          )}
        </nav>
      </div>
      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
    </header>
  );
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded transition ${
        active ? "bg-panel text-white" : "text-gray-400 hover:bg-panel hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
