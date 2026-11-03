import { Columns3, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ─── Column visibility for dataset tables (Filas tab) ───────────────────
   Same trigger button + DropdownMenuCheckboxItem items as
   ColumnVisibilityMenu.tsx (Histórico de fraude, Cola) - caller wires up
   the same useHiddenColumns(storageKey) hook from that file, so state
   shape and localStorage persistence are identical. This gets its own
   component (not a direct reuse) because a dataset's column count is
   arbitrary and can be large (an uploaded CSV can have dozens of
   columns) unlike those tables' small fixed sets - so on top of the
   shared look, this adds a regex search box; the list itself stays a
   plain vertical list, just height-capped with its own scroll instead of
   growing the popover indefinitely. */

const LIST_MAX_HEIGHT = "16rem"; // ~10 rows at this row height

export function DatasetColumnVisibilityMenu({
  columns,
  hidden,
  onToggle,
}: {
  columns: string[];
  hidden: Set<string>;
  onToggle: (column: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return columns;
    try {
      const re = new RegExp(search, "i");
      return columns.filter((c) => re.test(c));
    } catch {
      // Invalid regex mid-typing (e.g. an unmatched "(") - fall back to a
      // plain substring match instead of showing an empty/broken list.
      const needle = search.toLowerCase();
      return columns.filter((c) => c.toLowerCase().includes(needle));
    }
  }, [columns, search]);

  return (
    <DropdownMenu onOpenChange={(open) => !open && setSearch("")}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-lg border border-border bg-card text-[11px] text-text-primary hover:bg-surface"
        >
          <Columns3 className="h-3.5 w-3.5" />
          Columnas ({columns.length - hidden.size}/{columns.length})
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Buscar columnas (regex)…"
            className="w-full h-8 rounded-md border border-border pl-7 pr-2 text-[12px] focus:outline-none focus:border-primary bg-background"
          />
        </div>
        <div
          className="flex flex-col overflow-y-auto overflow-x-hidden"
          style={{ maxHeight: LIST_MAX_HEIGHT }}
        >
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-[12px] text-text-secondary">Sin coincidencias.</p>
          )}
          {filtered.map((c) => (
            <DropdownMenuCheckboxItem
              key={c}
              checked={!hidden.has(c)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onToggle(c)}
              className="text-[12px]"
            >
              <span className="truncate">{c}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
