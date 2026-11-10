import { useState } from "react";
import { Copy, CopyCheck } from "lucide-react";

export function CopyableValue({ label, value }: { label: string; value: string }) {
  const [message, setMessage] = useState("");

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(`Copy is unavailable. Select the value and copy it manually.`);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-neutral-500">{label}:</span>
      <code className="select-all break-all font-mono text-xs text-neutral-700">{value}</code>
      <button
        type="button"
        onClick={() => void copyValue()}
        aria-label={`Copy ${label}`}
        className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
      >
        {message.endsWith("copied.") ? <CopyCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        Copy
      </button>
      {message && <span role="status" className="text-xs text-neutral-500">{message}</span>}
    </div>
  );
}
