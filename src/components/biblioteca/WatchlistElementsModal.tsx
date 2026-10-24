import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ActionButton, DataTable, TruncText } from "@/components/ui/DataTable";
import {
  addWatchlistElements,
  importWatchlistElements,
  listWatchlistElements,
  removeWatchlistElements,
  type WatchlistEntry,
} from "@/lib/api/watchlist.functions";

const PAGE_SIZE = 100;

/* Paginated "cargar más" instead of a full table load - a watchlist can
   hold tens of thousands of values, way past what a single response or a
   DOM table should render at once. Import is fire-and-forget through the
   same add path the backend uses for manual entries (AddWatchlistElementsUseCase),
   just fed by a parsed file instead of one value. */
export function WatchlistElementsModal({
  watchlist,
  onClose,
}: {
  watchlist: WatchlistEntry;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const invalidateCount = () => queryClient.invalidateQueries({ queryKey: ["watchlists"] });

  const [values, setValues] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingValue, setRemovingValue] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFirstPage = async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listWatchlistElements({
        data: { watchlistId: watchlist.id, limit: PAGE_SIZE },
      });
      setValues(page.values);
      setCursor(page.next_cursor);
    } catch {
      setError("No se pudo cargar la lista.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.id]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await listWatchlistElements({
        data: { watchlistId: watchlist.id, limit: PAGE_SIZE, cursor },
      });
      setValues((prev) => [...prev, ...page.values]);
      setCursor(page.next_cursor);
    } catch {
      setError("No se pudo cargar más elementos.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    const value = newValue.trim();
    if (!value) return;
    setAdding(true);
    try {
      await addWatchlistElements({ data: { watchlistId: watchlist.id, values: [value] } });
      setNewValue("");
      await loadFirstPage();
      invalidateCount();
    } catch {
      setError("No se pudo agregar el elemento.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (value: string) => {
    setRemovingValue(value);
    try {
      await removeWatchlistElements({ data: { watchlistId: watchlist.id, values: [value] } });
      setValues((prev) => prev.filter((v) => v !== value));
      invalidateCount();
    } catch {
      setError("No se pudo quitar el elemento.");
    } finally {
      setRemovingValue(null);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportMessage(null);
    setError(null);
    try {
      const result = await importWatchlistElements({ data: { watchlistId: watchlist.id, file } });
      setImportMessage(`${result.added.toLocaleString("es-CO")} elementos importados.`);
      await loadFirstPage();
      invalidateCount();
    } catch {
      setError("No se pudo importar el archivo. Verifica que sea .csv o .txt.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border border-border w-full max-w-3xl shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-[14px] font-semibold text-text-primary">{watchlist.name}</h3>
            <p className="text-[11px] text-text-secondary mt-0.5">
              {watchlist.element_count.toLocaleString("es-CO")} elementos
            </p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-border space-y-3">
          <div className="flex gap-2">
            <input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Agregar un valor"
              className="flex-1 h-9 rounded-md border border-border px-3 text-[13px] font-mono focus:outline-none focus:border-primary"
            />
            <button
              onClick={handleAdd}
              disabled={!newValue.trim() || adding}
              className="inline-flex items-center gap-1 px-3 h-9 rounded-md bg-primary text-white text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {adding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}{" "}
              Agregar
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
              className="hidden"
              id="watchlist-import-input"
            />
            <label
              htmlFor="watchlist-import-input"
              className="inline-flex items-center gap-1 px-3 h-9 rounded-md border border-border text-[13px] font-medium text-text-secondary hover:bg-surface cursor-pointer"
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}{" "}
              Importar .csv/.txt
            </label>
            {importMessage && <span className="text-[11px] text-success">{importMessage}</span>}
          </div>
          {error && <p className="text-[11px] text-danger">{error}</p>}
        </div>

        <div className="overflow-y-auto flex-1 p-3">
          <DataTable
            storageKey="biblioteca-lista-elementos"
            itemLabel="elemento"
            rows={values}
            rowKey={(value) => value}
            isLoading={loading && values.length === 0}
            emptyLabel="Sin elementos en esta lista."
            searchPlaceholder="Buscar en lo cargado…"
            columns={[
              {
                key: "value",
                label: "Valor",
                minWidth: 220,
                sortValue: (value) => value,
                searchValue: (value) => value,
                render: (value) => (
                  <TruncText maxWidth={420} className="font-mono text-[12px] text-text-primary">
                    {value}
                  </TruncText>
                ),
              },
            ]}
            actionsWidth={90}
            actions={(value) => (
              <ActionButton
                tone="danger"
                icon={<Trash2 className="h-3 w-3" />}
                disabled={removingValue === value}
                onClick={() => handleRemove(value)}
              >
                Quitar
              </ActionButton>
            )}
            footerExtra={
              cursor && (
                <ActionButton onClick={loadMore} disabled={loading}>
                  {loading ? "Cargando…" : "Cargar más"}
                </ActionButton>
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
