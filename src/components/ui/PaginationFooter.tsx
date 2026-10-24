import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

type PaginationFooterProps = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  // Extra controls rendered next to the summary (e.g. "Cargar más").
  extra?: ReactNode;
  // Icon-only pager with a short summary, for narrow side lists.
  compact?: boolean;
  // Present => a "por página" selector sits next to the pager.
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
};

export const PAGE_SIZE_OPTIONS = [20, 50, 100];

const NAV_BUTTON =
  "inline-flex items-center justify-center h-7 min-w-7 px-1.5 gap-0.5 rounded-md border border-border text-text-primary text-[11px] font-medium hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed";

export function PaginationFooter({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  itemLabel = "resultado",
  extra,
  compact = false,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: PaginationFooterProps) {
  const sizes = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const summary =
    total === 0
      ? `0 ${itemLabel}${itemLabel.endsWith("s") ? "" : "s"}`
      : `${start}–${end} de ${total} ${itemLabel}${total !== 1 && !itemLabel.endsWith("s") ? "s" : ""}`;
  return (
    <div
      className={`border-t border-border flex flex-wrap justify-between items-center gap-2 ${compact ? "px-2 py-1.5" : "px-5 py-3"}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-text-secondary">{summary}</span>
        {extra}
        {onPageSizeChange && !compact && (
          <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
            Filas por página
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Filas por página"
              className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px] text-text-primary"
            >
              {sizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            aria-label="Ir al inicio"
            title="Ir al inicio"
            className={NAV_BUTTON}
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
            className={NAV_BUTTON}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> {!compact && "Anterior"}
          </button>
          <span className="text-[11px] text-text-secondary tabular-nums px-1">
            {compact ? `${page}/${pageCount}` : `Página ${page} de ${pageCount}`}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Página siguiente"
            className={NAV_BUTTON}
          >
            {!compact && "Siguiente"} <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(pageCount)}
            disabled={page >= pageCount}
            aria-label="Ir al final"
            title="Ir al final"
            className={NAV_BUTTON}
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
