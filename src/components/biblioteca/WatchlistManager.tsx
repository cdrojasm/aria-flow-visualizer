import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListTree, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/configuracion/shared/FormControls";
import {
  createWatchlist,
  deleteWatchlist,
  listWatchlists,
  updateWatchlist,
  type WatchlistEntry,
  type WatchlistType,
} from "@/lib/api/watchlist.functions";
import { WatchlistElementsModal } from "./WatchlistElementsModal";

/* ─── Blacklist / whitelist admin ────────────────────────
   Same "global catalog" footing as Canales above (channelLibrary), but
   elements aren't loaded here at all - a watchlist can hold tens of
   thousands of values, way past what a table row or a whole-list PATCH
   should carry. This table only shows metadata + element_count; clicking
   "Gestionar elementos" opens WatchlistElementsModal, which paginates,
   adds/removes incrementally, and bulk-imports via CSV/txt - mirrors the
   backend's split between watchlist_port.py's Watchlist (metadata) and its
   (watchlist_id, value) element store. */

const LIST_TYPE_LABELS: Record<WatchlistType, string> = {
  blacklist: "Lista negra",
  whitelist: "Lista blanca",
};
const LIST_TYPE_STYLES: Record<WatchlistType, string> = {
  blacklist: "bg-danger/15 text-danger border-danger/40",
  whitelist: "bg-success/15 text-success border-success/40",
};

type Draft = {
  id?: string;
  name: string;
  description: string;
  list_type: WatchlistType;
  seedElements: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  list_type: "blacklist",
  seedElements: "",
});

export function WatchlistManager() {
  const queryClient = useQueryClient();
  const watchlistsQuery = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => listWatchlists({ data: {} }),
  });
  const watchlists = watchlistsQuery.data ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["watchlists"] });

  const [editing, setEditing] = useState<Draft | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [managingId, setManagingId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (draft: Draft) =>
      draft.id
        ? updateWatchlist({
            data: { watchlistId: draft.id, name: draft.name, description: draft.description },
          })
        : createWatchlist({
            data: {
              name: draft.name,
              description: draft.description,
              listType: draft.list_type,
              elements: draft.seedElements
                .split("\n")
                .map((v) => v.trim())
                .filter(Boolean),
            },
          }),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setEditing(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (watchlistId: string) => deleteWatchlist({ data: { watchlistId } }),
    onSuccess: invalidate,
  });
  const toggleActive = useMutation({
    mutationFn: (entry: WatchlistEntry) =>
      updateWatchlist({ data: { watchlistId: entry.id, active: !entry.active } }),
    onSuccess: invalidate,
  });

  const managingWatchlist = watchlists.find((w) => w.id === managingId) ?? null;

  return (
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-[14px] font-semibold text-text-primary">Listas negras y blancas</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Catálogos de pertenencia (ej. cuentas, IPs, documentos) evaluados por el agente. Cada
            lista puede tener miles de elementos - gestiónalos desde "Elementos", no aquí.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(emptyDraft());
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nueva lista
        </button>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-secondary text-left border-b border-border">
            <th className="px-6 py-2 font-medium">Nombre</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Descripción</th>
            <th className="px-3 py-2 font-medium">Elementos</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium w-36"></th>
          </tr>
        </thead>
        <tbody>
          {watchlists.map((w) => (
            <tr
              key={w.id}
              className="border-b border-border last:border-0 hover:bg-surface align-top"
            >
              <td className="px-6 py-3 font-medium text-text-primary">{w.name}</td>
              <td className="px-3 py-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${LIST_TYPE_STYLES[w.list_type]}`}
                >
                  {LIST_TYPE_LABELS[w.list_type]}
                </span>
              </td>
              <td className="px-3 py-3 text-text-secondary max-w-xs truncate">{w.description}</td>
              <td className="px-3 py-3 font-mono text-[12px] text-text-secondary">
                {w.element_count.toLocaleString("es-CO")}
              </td>
              <td className="px-3 py-3">
                <button
                  onClick={() => toggleActive.mutate(w)}
                  className={`text-[11px] uppercase tracking-wider ${w.active ? "text-success" : "text-text-secondary"}`}
                >
                  {w.active ? "Activo" : "Inactivo"}
                </button>
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setManagingId(w.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-primary border border-primary/30 hover:bg-primary/10"
                  >
                    <ListTree className="h-3.5 w-3.5" /> Elementos
                  </button>
                  <button
                    onClick={() => {
                      setEditing({
                        id: w.id,
                        name: w.name,
                        description: w.description,
                        list_type: w.list_type,
                        seedElements: "",
                      });
                      setShowForm(true);
                    }}
                    className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(w.id)}
                    className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {watchlists.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-8 text-center text-text-secondary">
                Sin listas en la biblioteca.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showForm && editing && (
        <div
          className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">
                {editing.id ? "Editar lista" : "Nueva lista"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-text-secondary hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {!editing.id && (
                <Field label="Tipo">
                  <div className="flex gap-2">
                    {(["blacklist", "whitelist"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEditing({ ...editing, list_type: t })}
                        className={`flex-1 h-9 rounded-md border text-[13px] font-medium ${
                          editing.list_type === t
                            ? LIST_TYPE_STYLES[t]
                            : "border-border text-text-secondary hover:bg-surface"
                        }`}
                      >
                        {LIST_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              <Field label="Nombre">
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                  placeholder="Cuentas mula conocidas"
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
                />
              </Field>
              {!editing.id && (
                <Field
                  label="Elementos iniciales"
                  hint="Opcional, uno por línea. Para cargas grandes usa 'Elementos → Importar' después de crear la lista."
                >
                  <textarea
                    value={editing.seedElements}
                    onChange={(e) => setEditing({ ...editing, seedElements: e.target.value })}
                    rows={4}
                    className="w-full rounded-md border border-border px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-primary resize-none"
                    placeholder={"1234567890\n0987654321"}
                  />
                </Field>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveMutation.mutate(editing)}
                disabled={
                  !editing.name.trim() || !editing.description.trim() || saveMutation.isPending
                }
                className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editing.id ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {managingWatchlist && (
        <WatchlistElementsModal watchlist={managingWatchlist} onClose={() => setManagingId(null)} />
      )}
    </section>
  );
}
