import { Routes, Route, Link, useSearchParams } from "react-router-dom";
import Leaderboard from "./pages/Leaderboard";
import Create from "./pages/Create";
import Join from "./pages/Join";
import Admin from "./pages/Admin";
import Draft from "./pages/Draft";
import Winner from "./pages/Winner";
import TopBar from "./components/TopBar";
import { AuthProvider } from "./hooks/useAuth";

function Home() {
  const [params] = useSearchParams();
  const leagueId = params.get("league");
  if (leagueId) return <Leaderboard leagueId={leagueId} />;
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-5xl font-bold tracking-tight">StockDraft</h1>
      <p className="text-gray-400 text-center max-w-md">
        Fantasy stock league. Draft real stocks like fantasy football and compete for 3 months.
      </p>
      <div className="flex gap-3">
        <Link to="/create" className="btn-primary">Create a league</Link>
      </div>
      <p className="text-xs text-gray-500">
        Already invited? Use the link your league admin sent you.
      </p>
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
        <Route path="/winner" element={<Winner />} />
      </Routes>
    </AuthProvider>
  );
}
