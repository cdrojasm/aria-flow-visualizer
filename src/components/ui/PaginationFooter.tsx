type PaginationFooterProps = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
};

export function PaginationFooter({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  itemLabel = "resultado",
}: PaginationFooterProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="px-5 py-3 border-t border-border flex flex-wrap justify-between items-center gap-2">
      <span className="text-[11px] text-text-secondary">
        {total === 0 ? "0" : `${start}–${end} de`} {total} {itemLabel}
        {total !== 1 ? "s" : ""}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="h-8 px-3 rounded-lg border border-border text-text-primary text-[12px] font-medium hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <span className="text-[11px] text-text-secondary tabular-nums px-1">
            Página {page} de {pageCount}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            className="h-8 px-3 rounded-lg border border-border text-text-primary text-[12px] font-medium hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
