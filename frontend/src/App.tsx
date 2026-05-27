import { useState } from "react";
import { Routes, Route, Link, useSearchParams } from "react-router-dom";
import Leaderboard from "./pages/Leaderboard";
import Create from "./pages/Create";
import Join from "./pages/Join";
import Admin from "./pages/Admin";
import Draft from "./pages/Draft";
import Portfolio from "./pages/Portfolio";
import Winner from "./pages/Winner";
import TopBar from "./components/TopBar";
import SignInModal from "./components/SignInModal";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { useLeagues } from "./hooks/useLeagues";

function Home() {
  const [params] = useSearchParams();
  const leagueId = params.get("league");
  const { user } = useAuth();
  const leagues = useLeagues();
  const [signInOpen, setSignInOpen] = useState(false);

  if (leagueId) return <Leaderboard leagueId={leagueId} />;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-5xl font-bold tracking-tight">StockDraft</h1>
      <p className="text-gray-400 text-center max-w-md">
        Fantasy stock league. Draft real stocks like fantasy football and compete for 3 months.
      </p>

      {user ? (
        <>
          <div className="flex gap-3">
            <Link to="/create" className="btn-primary">Create a league</Link>
          </div>
          {leagues.length > 0 && (
            <div className="card max-w-md w-full mt-4">
              <div className="label">Your leagues</div>
              <ul className="space-y-2">
                {leagues.map((l) => (
                  <li key={l.id}>
                    <Link
                      to={`/?league=${l.id}`}
                      className="flex justify-between items-center px-3 py-2 rounded hover:bg-black/30"
                    >
                      <span>{l.name}</span>
                      <span className="text-xs text-gray-500 capitalize">
                        {l.role} · {l.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-3">
            <button className="btn-primary" onClick={() => setSignInOpen(true)}>
              Sign in
            </button>
            <Link to="/create" className="btn-ghost">Create a league</Link>
          </div>
          <p className="text-xs text-gray-500 max-w-md text-center">
            Sign in with your email to create a league or join one. We'll send you a one-click magic
            link — no password.
          </p>
        </>
      )}

      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TopBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<Create />} />
        <Route path="/join" element={<Join />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/draft" element={<Draft />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/winner" element={<Winner />} />
      </Routes>
    </AuthProvider>
  );
}
