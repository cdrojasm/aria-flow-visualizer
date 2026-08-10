import { RefreshCw } from "lucide-react";

export function RefreshControl({ lastRefresh, onRefresh }: { lastRefresh: Date; onRefresh: () => void }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-secondary tabular-nums border border-border rounded-md px-2 py-1">
      <button onClick={onRefresh} className="hover:text-text-primary transition-colors" title="Actualizar">
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
      Actualizado {lastRefresh.toLocaleTimeString()}
    </div>
  );
}
