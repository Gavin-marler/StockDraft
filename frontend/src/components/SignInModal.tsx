import SignInForm from "./SignInForm";

export default function SignInModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-4">Sign in or create account</h3>
        <SignInForm onSignedIn={onClose} />
      </div>
    </div>
  );
}
