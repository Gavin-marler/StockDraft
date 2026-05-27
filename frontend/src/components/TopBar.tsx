import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function TopBar() {
  const { user, signOut } = useAuth();
  return (
    <header className="border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold tracking-tight">StockDraft</Link>
        <div className="text-sm flex items-center gap-3">
          {user ? (
            <>
              <span className="text-gray-400 hidden sm:inline">{user.email}</span>
              <button className="btn-ghost text-xs" onClick={() => signOut()}>Sign out</button>
            </>
          ) : (
            <span className="text-gray-500">Not signed in</span>
          )}
        </div>
      </div>
    </header>
  );
}
