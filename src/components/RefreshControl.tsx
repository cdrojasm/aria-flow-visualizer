import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function RefreshControl({ lastRefresh, onRefresh }: { lastRefresh: Date; onRefresh: () => void }) {
  const [spinning, setSpinning] = useState(false);

  const handleClick = () => {
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 600);
  };

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-secondary tabular-nums border border-border rounded-md px-2 py-1">
      <button onClick={handleClick} className="hover:text-text-primary transition-colors" title="Actualizar">
        <RefreshCw className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`} />
      </button>
      Actualizado {lastRefresh.toLocaleTimeString()}
    </div>
  );
}
