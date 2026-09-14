import { useState } from "react";
import { Check, Copy } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseRowForJsonView } from "@/lib/rowJson";

export function RowJsonModal({
  row,
  onClose,
}: {
  row: Record<string, unknown> | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const json = row ? JSON.stringify(parseRowForJsonView(row), null, 2) : "";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) - nothing to fall back to.
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fila como JSON</DialogTitle>
          <DialogDescription>
            Los campos con contenido JSON embebido (p. ej. un historial de transacciones) se
            muestran parseados en lugar de como texto plano.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <button
            type="button"
            onClick={handleCopy}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <pre className="rounded-lg border border-border bg-surface p-3 pt-10 text-[12px] font-mono overflow-auto max-h-[65vh] whitespace-pre-wrap break-words">
            {json}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
