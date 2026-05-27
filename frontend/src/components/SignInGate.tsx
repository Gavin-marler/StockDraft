import { useAuth } from "../hooks/useAuth";
import SignInForm from "./SignInForm";

// Wraps any page that requires authentication. If signed out, renders the
// sign-in form in-place; otherwise renders children.
export default function SignInGate({
  children,
  title = "Sign in to continue",
  hint,
}: {
  children: React.ReactNode;
  title?: string;
  hint?: string;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  }
  if (user) return <>{children}</>;

  return (
    <div className="max-w-md mx-auto py-16 px-6">
      <h1 className="text-3xl font-bold mb-2">{title}</h1>
      {hint && <p className="text-sm text-gray-400 mb-4">{hint}</p>}
      <div className="card">
        <SignInForm />
      </div>
    </div>
  );
}
