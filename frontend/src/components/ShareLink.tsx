import { useState } from "react";

// One-shot share widget. Tries the native share sheet first (great on mobile),
// then offers Copy / SMS / Email shortcuts.
export default function ShareLink({
  url,
  title = "Join my StockDraft league",
  text,
}: {
  url: string;
  title?: string;
  text?: string;
}) {
  const [copied, setCopied] = useState(false);
  const shareText = text ?? `${title}: ${url}`;
  const canShare =
    typeof navigator !== "undefined" && typeof (navigator as any).share === "function";

  async function nativeShare() {
    try {
      await (navigator as any).share({ title, text: text ?? title, url });
    } catch {
      /* user cancelled */
    }
  }

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const smsHref = `sms:?&body=${encodeURIComponent(shareText)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareText)}`;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="input flex-1 font-mono text-xs" readOnly value={url} />
        <button type="button" className="btn-ghost text-xs" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {canShare && (
          <button type="button" className="btn-primary text-xs" onClick={nativeShare}>
            Share…
          </button>
        )}
        <a href={smsHref} className="btn-ghost text-xs text-center">
          Text
        </a>
        <a href={mailHref} className="btn-ghost text-xs text-center">
          Email
        </a>
      </div>
    </div>
  );
}
