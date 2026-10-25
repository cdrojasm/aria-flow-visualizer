import type { ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";

/* One layout for the pages that filter alerts (Dashboard, En proceso, Histórico,
   Monitor), in three separate zones:
   1. PageHeader: the title (and a badge) on the left, the page's actions on the right
      (export, import, refresh with its last-update indicator).
   2. FilterBar: its own strip under the header, labelled "Filtros", with the filter
      controls, the range control at the far right and a way to clear what is applied.
   3. The page content. */

export function PageHeader({
  title,
  badge,
  actions,
}: {
  title: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-8 px-8 py-4 mb-4 bg-background border-b border-border flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-[20px] font-bold text-text-primary">{title}</h1>
        {badge}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function FilterBar({
  children,
  trailing,
  activeCount = 0,
  onClear,
}: {
  children: ReactNode;
  /** Right-aligned controls that are not filters but shape the data (the date range). */
  trailing?: ReactNode;
  activeCount?: number;
  onClear?: () => void;
}) {
  return (
    <section
      aria-label="Filtros"
      className="mb-6 rounded-xl border border-border bg-card px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Filtros
        {activeCount > 0 && (
          <span
            data-testid="active-filters-count"
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] tabular-nums"
          >
            {activeCount}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {activeCount > 0 && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Limpiar filtros
        </button>
      )}
      {trailing && <div className="ml-auto flex items-center gap-2 flex-wrap">{trailing}</div>}
    </section>
  );
}
