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
  const [drawerOpen, setDrawerOpen] = useState(false);

  function isActive(path: string) {
    return location.pathname === path;
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <header className="border-b border-gray-800 bg-bg sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="font-bold tracking-tight whitespace-nowrap">StockDraft</Link>
          {ctx && (
            <>
              <span className="text-gray-600 hidden sm:inline">/</span>
              <span className="text-sm text-gray-300 truncate hidden sm:inline">{ctx.name}</span>
            </>
          )}
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1 text-sm">
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
                  Portfolio
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
              <Link
                to="/account"
                className="text-gray-400 text-xs hidden md:inline hover:text-white"
                title="Account settings"
              >
                {user.email}
              </Link>
              <button className="btn-ghost text-xs" onClick={() => signOut()}>Sign out</button>
            </div>
          ) : (
            <button className="btn-primary text-xs" onClick={() => setSignInOpen(true)}>
              Sign in
            </button>
          )}
        </nav>

        {/* Mobile: hamburger or Sign in */}
        <div className="sm:hidden flex items-center gap-2">
          {!user && (
            <button className="btn-primary text-xs" onClick={() => setSignInOpen(true)}>
              Sign in
            </button>
          )}
          <button
            type="button"
            aria-label="Open menu"
            className="p-2 rounded hover:bg-panel"
            onClick={() => setDrawerOpen(true)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}

      {/* Mobile slide-out drawer */}
      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/60"
            onClick={closeDrawer}
            aria-label="Close menu"
          />
          <aside className="w-72 max-w-[85vw] bg-panel border-l border-gray-800 h-full flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <span className="font-bold">Menu</span>
              <button
                type="button"
                aria-label="Close menu"
                className="p-2 rounded hover:bg-black/40"
                onClick={closeDrawer}
              >
                ✕
              </button>
            </div>

            {user && (
              <Link
                to="/account"
                onClick={closeDrawer}
                className="px-4 py-3 border-b border-gray-800 text-sm hover:bg-black/30"
              >
                <div className="text-xs text-gray-500">Signed in as</div>
                <div className="font-mono truncate">{user.email}</div>
              </Link>
            )}

            {ctx && (
              <div className="px-2 py-2 border-b border-gray-800">
                <div className="px-2 py-1 text-xs text-gray-500 uppercase tracking-wider">
                  {ctx.name}
                </div>
                <DrawerLink to={`/?league=${ctx.id}`} onClick={closeDrawer}>Leaderboard</DrawerLink>
                {(ctx.status === "drafting" || ctx.status === "active") && ctx.isPlayer && (
                  <DrawerLink to={`/draft?league=${ctx.id}`} onClick={closeDrawer}>Draft</DrawerLink>
                )}
                {(ctx.status === "active" || ctx.status === "complete") && ctx.isPlayer && (
                  <DrawerLink to={`/portfolio?league=${ctx.id}`} onClick={closeDrawer}>Portfolio</DrawerLink>
                )}
                {ctx.isAdmin && (
                  <DrawerLink to={`/admin?league=${ctx.id}`} onClick={closeDrawer}>Admin</DrawerLink>
                )}
              </div>
            )}

            {user && (
              <div className="px-2 py-2 border-b border-gray-800">
                <div className="px-2 py-1 text-xs text-gray-500 uppercase tracking-wider">
                  My leagues
                </div>
                {leagues.length === 0 ? (
                  <div className="px-2 py-2 text-sm text-gray-500">None yet.</div>
                ) : (
                  leagues.map((l) => (
                    <Link
                      key={l.id}
                      to={`/?league=${l.id}`}
                      onClick={closeDrawer}
                      className="block px-3 py-2 rounded text-sm hover:bg-black/30"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="truncate">{l.name}</span>
                        <span className="text-xs text-gray-500 capitalize shrink-0">{l.role}</span>
                      </div>
                      <div className="text-xs text-gray-500">{l.status}</div>
                    </Link>
                  ))
                )}
                <Link
                  to="/create"
                  onClick={closeDrawer}
                  className="block px-3 py-2 rounded text-sm text-accent hover:bg-black/30"
                >
                  + New league
                </Link>
              </div>
            )}

            <div className="mt-auto px-2 py-3 border-t border-gray-800">
              {user ? (
                <button
                  className="btn-ghost w-full"
                  onClick={() => {
                    signOut();
                    closeDrawer();
                  }}
                >
                  Sign out
                </button>
              ) : (
                <button
                  className="btn-primary w-full"
                  onClick={() => {
                    setSignInOpen(true);
                    closeDrawer();
                  }}
                >
                  Sign in
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
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

function DrawerLink({
  to,
  onClick,
  children,
}: {
  to: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block px-3 py-2 rounded text-sm text-gray-200 hover:bg-black/30"
    >
      {children}
    </Link>
  );
}
