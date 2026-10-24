import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Search } from "lucide-react";

import { ColumnVisibilityMenu, useHiddenColumns } from "@/components/ColumnVisibilityMenu";
import { PaginationFooter } from "@/components/ui/PaginationFooter";
import { usePagination } from "@/hooks/usePagination";

export type DataTableColumn<T> = {
  key: string;
  label: string;
  // Minimum column width in px; the table scrolls horizontally inside its own
  // container instead of squeezing columns below this.
  minWidth?: number;
  align?: "right";
  render: (row: T) => ReactNode;
  // Present => the header is clickable and sorts by this value.
  sortValue?: (row: T) => string | number | null | undefined;
  // Present => the search bar matches against this text.
  searchValue?: (row: T) => string | null | undefined;
};

export type DataTableSelection<T> = {
  selected: Set<string>;
  onToggle: (key: string) => void;
  // Receives every row that passes search (not just the visible page).
  onToggleAll: (rows: T[]) => void;
  rowLabel: (row: T) => string;
};

type DataTableProps<T> = {
  // Persists the hidden-column preference; one per table.
  storageKey: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  title?: ReactNode;
  description?: ReactNode;
  // Rendered at the far right of the title line.
  headerExtra?: ReactNode;
  // Filter controls, one horizontal list under the title line.
  filters?: ReactNode;
  // General actions of the table (create, upload, bulk delete…), right of the search bar.
  tableActions?: ReactNode;
  // Rendered as the first (sticky) column, right where the row starts.
  actions?: (row: T) => ReactNode;
  actionsLabel?: string;
  // Deprecated: the actions column now sizes to its content.
  actionsWidth?: number;
  selection?: DataTableSelection<T>;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  searchPlaceholder?: string;
  pageSize?: number;
  itemLabel?: string;
  isLoading?: boolean;
  loadingLabel?: string;
  error?: ReactNode;
  notice?: ReactNode;
  emptyLabel?: string;
  noMatchLabel?: string;
  footerExtra?: ReactNode;
  // Narrow master/detail lists: tight paddings, no column palette, compact pager.
  compact?: boolean;
  hideColumnMenu?: boolean;
  searchLabel?: string;
  onRowClick?: (row: T) => void;
  isRowActive?: (row: T) => boolean;
};

// More than this many actions in a cell collapse to icon-only buttons.
const MAX_LABELED_ACTIONS = 2;
const IconOnlyContext = createContext(false);

function countElements(node: ReactNode): number {
  return Children.toArray(node).reduce<number>(
    (total, child) =>
      total +
      (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
        ? countElements(child.props.children)
        : 1),
    0,
  );
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es", { numeric: true });
}

const HEAD_CELL =
  "sticky top-0 z-10 bg-card border-b border-border font-normal whitespace-nowrap text-[11px] uppercase tracking-wider text-text-secondary";

export function DataTable<T>({
  storageKey,
  columns,
  rows,
  rowKey,
  title,
  description,
  headerExtra,
  filters,
  tableActions,
  actions,
  actionsLabel = "Acciones",
  selection,
  defaultSort,
  searchPlaceholder,
  pageSize = 10,
  itemLabel = "resultado",
  isLoading = false,
  loadingLabel = "Cargando…",
  error,
  notice,
  emptyLabel = "No hay resultados.",
  noMatchLabel = "Ningún resultado coincide con la búsqueda.",
  footerExtra,
  compact = false,
  hideColumnMenu = false,
  searchLabel = "Buscar en la tabla",
  onRowClick,
  isRowActive,
}: DataTableProps<T>) {
  const { hidden, toggle } = useHiddenColumns<string>(storageKey);
  const [sort, setSort] = useState(defaultSort ?? null);
  const [search, setSearch] = useState("");

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hidden.has(c.key)),
    [columns, hidden],
  );
  const searchable = useMemo(() => columns.filter((c) => c.searchValue), [columns]);

  const term = search.trim().toLowerCase();
  const processed = useMemo(() => {
    const matched = term
      ? rows.filter((row) =>
          searchable.some((c) => (c.searchValue!(row) ?? "").toLowerCase().includes(term)),
        )
      : rows;
    const sortColumn = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (!sort || !sortColumn?.sortValue) return matched;
    const value = sortColumn.sortValue;
    const sign = sort.dir === "asc" ? 1 : -1;
    // Missing values stay last in both directions, so only real values flip.
    return [...matched].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const missing = (v: unknown) => v === null || v === undefined || v === "";
      if (missing(va) || missing(vb)) return compareValues(va, vb);
      return sign * compareValues(va, vb);
    });
  }, [rows, term, searchable, sort, columns]);

  const paging = usePagination(processed, pageSize);

  const onSort = (key: string) =>
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const headPad = compact ? "py-1.5 px-2" : "py-2 px-3";
  const cellPad = compact ? "px-2 py-1" : "px-3 py-1.5";
  const leadingColumns = (selection ? 1 : 0) + (actions ? 1 : 0);
  const colSpan = visibleColumns.length + leadingColumns;
  const placeholder =
    searchPlaceholder ??
    `Buscar por ${searchable
      .map((c) => c.label.toLowerCase())
      .slice(0, 3)
      .join(", ")}…`;
  const allSelected =
    !!selection &&
    processed.length > 0 &&
    processed.every((r) => selection.selected.has(rowKey(r)));

  return (
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
      <div
        className={`border-b border-border ${compact ? "px-2 py-2 space-y-2" : "px-5 pt-3 pb-3 space-y-2.5"}`}
      >
        {/* Line 1: title on the left, column palette always at the opposite (right) end.
            The subtitle always sits on its own line below. */}
        {(title || description || headerExtra || !hideColumnMenu) && (
          <div>
            <div className="flex items-center justify-between gap-3">
              {title ? (
                <h2 className="min-w-0 text-[14px] font-semibold text-text-primary">{title}</h2>
              ) : (
                <span />
              )}
              <div className="flex shrink-0 items-center gap-2">
                {headerExtra}
                {!hideColumnMenu && (
                  <ColumnVisibilityMenu
                    columns={columns.map(({ key, label }) => ({ key, label }))}
                    hidden={hidden}
                    onToggle={toggle}
                  />
                )}
              </div>
            </div>
            {description && <p className="mt-0.5 text-[12px] text-text-secondary">{description}</p>}
          </div>
        )}
        {/* Line 2: filters, full width. Each filter is capped so long labels truncate. */}
        {filters && (
          <div className="flex w-full items-center gap-2 flex-wrap [&>*]:min-w-0 [&>*]:max-w-[220px] [&_select]:max-w-full [&_select]:truncate">
            {filters}
          </div>
        )}
        {/* Line 3: search (70%) and the table's general actions (30%). */}
        {(searchable.length > 0 || tableActions) && (
          <div className="flex w-full items-center gap-3">
            {searchable.length > 0 && (
              <div
                className={`relative min-w-0 ${compact || !tableActions ? "flex-1" : "flex-[7]"}`}
              >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    paging.setPage(1);
                  }}
                  placeholder={placeholder}
                  aria-label={searchLabel}
                  className="w-full h-8 pl-9 pr-3 rounded-lg border border-border bg-card text-[12px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}
            {tableActions && (
              <div className="flex flex-[3] min-w-max items-center justify-end gap-2">
                {tableActions}
              </div>
            )}
          </div>
        )}
      </div>

      {error}
      {notice}

      {/* Roughly one viewport tall at most; scrolls on both axes inside the card. */}
      <div className="overflow-auto max-h-[100vh]">
        <table className="w-full min-w-max border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              {selection && (
                <th className={`${HEAD_CELL} ${headPad} left-0 z-20 w-9 text-left`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => selection.onToggleAll(processed)}
                    aria-label="Seleccionar todas"
                  />
                </th>
              )}
              {actions && (
                <th
                  className={`${HEAD_CELL} ${headPad} z-20 text-left ${selection ? "" : "left-0"}`}
                  style={{
                    ...(selection ? { left: 36 } : {}),
                  }}
                >
                  {actionsLabel}
                </th>
              )}
              {visibleColumns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ minWidth: col.minWidth }}
                    className={`${HEAD_CELL} ${headPad} ${col.align === "right" ? "text-right" : "text-left"}`}
                    aria-sort={
                      active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
                    }
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => onSort(col.key)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-text-primary ${active ? "text-text-primary font-medium" : ""} ${col.align === "right" ? "flex-row-reverse" : ""}`}
                      >
                        {col.label}
                        {active ? (
                          sort.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={colSpan} className="px-5 py-6 text-[13px] text-text-secondary">
                  <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                  {loadingLabel}
                </td>
              </tr>
            ) : paging.total === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-5 py-6 text-[13px] text-text-secondary">
                  {term ? noMatchLabel : emptyLabel}
                </td>
              </tr>
            ) : (
              paging.pageItems.map((row, i) => {
                const key = rowKey(row);
                const stripe = i % 2 === 1 ? "bg-surface" : "bg-card";
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    aria-current={isRowActive?.(row) || undefined}
                    className={`${isRowActive?.(row) ? "bg-primary-light" : stripe} hover:bg-primary-light/60 ${onRowClick ? "cursor-pointer" : ""}`}
                  >
                    {selection && (
                      <td
                        className={`sticky left-0 z-[5] bg-inherit border-t border-border ${cellPad}`}
                      >
                        <input
                          type="checkbox"
                          checked={selection.selected.has(key)}
                          onChange={() => selection.onToggle(key)}
                          aria-label={selection.rowLabel(row)}
                        />
                      </td>
                    )}
                    {actions && (
                      <td
                        className={`sticky z-[5] bg-inherit border-t border-border ${cellPad} whitespace-nowrap ${selection ? "" : "left-0"}`}
                        style={{ ...(selection ? { left: 36 } : {}) }}
                      >
                        <IconOnlyContext.Provider
                          value={countElements(actions(row)) > MAX_LABELED_ACTIONS}
                        >
                          <div className="inline-flex items-center gap-1">{actions(row)}</div>
                        </IconOnlyContext.Provider>
                      </td>
                    )}
                    {visibleColumns.map((col) => (
                      <td
                        key={col.key}
                        style={{ minWidth: col.minWidth }}
                        className={`border-t border-border ${cellPad} align-middle ${col.align === "right" ? "text-right" : ""}`}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <PaginationFooter
        page={paging.page}
        pageCount={paging.pageCount}
        total={paging.total}
        pageSize={paging.pageSize}
        onPageChange={paging.setPage}
        itemLabel={itemLabel}
        extra={footerExtra}
        compact={compact}
      />
    </section>
  );
}

// Single-line text clipped to `maxWidth` px, full value on hover.
export function TruncText({
  children,
  maxWidth = 200,
  maxChars,
  className = "",
}: {
  children: string | null | undefined;
  maxWidth?: number;
  // Hard character cap for ids: shows the first `maxChars` plus "…".
  maxChars?: number;
  className?: string;
}) {
  const text = children ?? "";
  if (!text) return <span className="text-text-secondary">—</span>;
  return (
    <span
      title={text}
      style={{ maxWidth }}
      className={`block truncate whitespace-nowrap ${className}`}
    >
      {maxChars && text.length > maxChars ? `${text.slice(0, maxChars)}…` : text}
    </span>
  );
}

// Dense one-word action buttons shared by every table's first column.
type ActionTone = "default" | "primary" | "danger";

const ACTION_BASE =
  "inline-flex items-center gap-1 rounded-md font-medium whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";
// "sm" lives inside rows; "md" is for the table's general actions above the header.
const ACTION_SIZE = { sm: "h-6 px-2 text-[11px]", md: "h-8 px-3 text-[12px]" } as const;
const ACTION_TONE: Record<ActionTone, string> = {
  default: "border border-border text-text-primary hover:bg-surface",
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  danger: "border border-danger/30 text-danger hover:bg-danger/10",
};

export function ActionButton({
  icon,
  children,
  tone = "default",
  size = "sm",
  ...props
}: {
  icon?: ReactNode;
  tone?: ActionTone;
  size?: keyof typeof ACTION_SIZE;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const iconOnly = useContext(IconOnlyContext) && !!icon && typeof children === "string";
  return (
    <button
      type="button"
      {...props}
      {...(iconOnly
        ? { "aria-label": props["aria-label"] ?? children, title: props.title ?? children }
        : {})}
      className={`${ACTION_BASE} ${ACTION_SIZE[size]} ${ACTION_TONE[tone]}`}
    >
      {icon}
      {iconOnly ? null : children}
    </button>
  );
}

export function ActionLink({
  icon,
  children,
  tone = "default",
  ...props
}: {
  icon?: ReactNode;
  tone?: ActionTone;
  children: ReactNode;
} & LinkProps) {
  const iconOnly = useContext(IconOnlyContext) && !!icon && typeof children === "string";
  return (
    <Link
      {...props}
      {...(iconOnly ? { "aria-label": children, title: children } : {})}
      className={`${ACTION_BASE} ${ACTION_SIZE.sm} ${ACTION_TONE[tone]}`}
    >
      {icon}
      {iconOnly ? null : children}
    </Link>
  );
}
