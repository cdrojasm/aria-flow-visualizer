import { useState } from "react";
import { RefreshCw } from "lucide-react";

// The refresh action and its "last updated" indicator, side by side but distinct: a real
// button with a label, and a muted timestamp that is not clickable.
export function RefreshControl({
  lastRefresh,
  onRefresh,
}: {
  lastRefresh: Date;
  onRefresh: () => void;
}) {
  const [spinning, setSpinning] = useState(false);

  const handleClick = () => {
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 600);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-text-secondary tabular-nums" data-testid="last-refresh">
        Última actualización {lastRefresh.toLocaleTimeString()}
      </span>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-lg border border-border bg-card text-[11px] font-medium text-text-primary hover:bg-surface"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`} aria-hidden="true" />
        Actualizar
      </button>
    </div>
  );
}
