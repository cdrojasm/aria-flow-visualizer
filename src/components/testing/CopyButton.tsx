import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Hint } from "./Hint";

const COPIED_FEEDBACK_MS = 2000;

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Hint content={copied ? "Copiado" : label}>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          navigator.clipboard
            ?.writeText(text)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
            })
            .catch(() => setCopied(false));
        }}
        className={`h-6 w-6 shrink-0 grid place-items-center rounded-md border border-border hover:bg-surface ${copied ? "text-primary" : "text-text-secondary hover:text-primary"}`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </Hint>
  );
}
