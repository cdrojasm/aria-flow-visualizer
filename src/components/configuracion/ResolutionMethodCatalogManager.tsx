import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { RESOLUTION_TAG_LABELS, type ResolutionTag } from "@/data/configs";
import {
  createResolutionMethod,
  deleteResolutionMethod,
  listResolutionMethods,
  updateResolutionMethod,
  type ResolutionMethodResponse,
} from "@/lib/api/resolutionMethod.functions";

/* ─── Admin CRUD for the resolution-method catalog ───────
   Opened from a modus operandi playbook (Biblioteca) and from the queue
   discard behavior (Operación). Same flat pattern as
   MarcacionCatalogManager, with the fixed ResolutionTag enum playing the
   role MarcacionCategory.risk_label plays there: admins name as many
   methods as they want, each mapped onto one of the 5 tags the executor
   branches on. */

const RESOLUTION_TAG_OPTIONS: { value: ResolutionTag; label: string }[] = (
  Object.keys(RESOLUTION_TAG_LABELS) as ResolutionTag[]
).map((value) => ({ value, label: RESOLUTION_TAG_LABELS[value] }));

export function ResolutionMethodCatalogManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [methods, setMethods] = useState<ResolutionMethodResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [newTag, setNewTag] = useState<ResolutionTag>("scale_to_analyst");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ResolutionMethodResponse | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError(null);
    listResolutionMethods({ data: { activeOnly: false } })
      .then(setMethods)
      .catch(() => setError("No se pudo cargar el catálogo."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const invalidatePool = () => queryClient.invalidateQueries({ queryKey: ["resolutionMethods"] });

  const handleCreate = async () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    try {
      await createResolutionMethod({ data: { value: trimmed, resolutionTag: newTag } });
      setNewValue("");
      refresh();
      invalidatePool();
    } catch {
      setError("No se pudo crear el método.");
    }
  };

  const handleTagChange = async (entry: ResolutionMethodResponse, resolutionTag: ResolutionTag) => {
    try {
      await updateResolutionMethod({ data: { entryId: entry.id, resolutionTag } });
      refresh();
      invalidatePool();
    } catch {
      setError("No se pudo actualizar el método.");
    }
  };

  const handleToggleActive = async (entry: ResolutionMethodResponse) => {
    try {
      await updateResolutionMethod({ data: { entryId: entry.id, active: !entry.active } });
      refresh();
      invalidatePool();
    } catch {
      setError("No se pudo actualizar el método.");
    }
  };

  const handleDelete = async (entry: ResolutionMethodResponse) => {
    setDeletePending(true);
    try {
      await deleteResolutionMethod({ data: { entryId: entry.id } });
      refresh();
      invalidatePool();
      setDeleting(null);
    } catch {
      setError("No se pudo eliminar el método.");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <>
      <SideDrawer
        open={open}
        onOpenChange={onOpenChange}
        size="md"
        title="Gestionar métodos de resolución"
        description={
          <>
            Métodos que un playbook puede asignar como resolución o como respaldo. Cada uno mapea a
            una de las vías que ARIA sabe ejecutar.
          </>
        }
      >
        <div className="flex items-center gap-2">
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="Nuevo método de resolución…"
          />
          <select
            value={newTag}
            onChange={(e) => setNewTag(e.target.value as ResolutionTag)}
            className="h-9 rounded-md border border-border px-2 text-[13px] focus:outline-none focus:border-primary bg-background"
          >
            {RESOLUTION_TAG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" onClick={handleCreate} disabled={!newValue.trim()}>
            Agregar
          </Button>
        </div>

        <DataTable<ResolutionMethodResponse>
          storageKey="configuration.resolution-methods"
          columns={
            [
              {
                key: "value",
                label: "Método",
                render: (m) => (
                  <span className={m.active ? "" : "text-text-secondary line-through"}>
                    {m.value}
                  </span>
                ),
                sortValue: (m) => m.value,
                searchValue: (m) => m.value,
              },
              {
                key: "tag",
                label: "Vía",
                minWidth: 180,
                render: (m) => (
                  <select
                    value={m.resolution_tag}
                    onChange={(e) => handleTagChange(m, e.target.value as ResolutionTag)}
                    className="h-8 w-full rounded-md border border-border px-2 text-[12px] focus:outline-none focus:border-primary bg-background"
                  >
                    {RESOLUTION_TAG_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ),
                sortValue: (m) => m.resolution_tag,
                searchValue: (m) =>
                  RESOLUTION_TAG_OPTIONS.find((o) => o.value === m.resolution_tag)?.label ??
                  m.resolution_tag,
              },
              {
                key: "active",
                label: "Estado",
                render: (m) => (
                  <button
                    type="button"
                    onClick={() => handleToggleActive(m)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {m.active ? "Desactivar" : "Activar"}
                  </button>
                ),
                sortValue: (m) => Number(m.active),
                searchValue: (m) => (m.active ? "Activo" : "Inactivo"),
              },
            ] as DataTableColumn<ResolutionMethodResponse>[]
          }
          rows={methods}
          rowKey={(m) => m.id}
          isLoading={loading}
          error={error ?? undefined}
          actions={(m) => (
            <button
              type="button"
              onClick={() => setDeleting(m)}
              aria-label={`Eliminar método ${m.value}`}
              className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          emptyLabel="Sin métodos de resolución."
          pageSize={10}
          itemLabel="método"
        />
      </SideDrawer>
      <ConfirmDeleteDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        itemName={`método de resolución "${deleting?.value ?? ""}"`}
        consequence="Referenciado por playbooks de modus operandi y por el descarte de cola; esas referencias apuntan a un id inexistente."
        pending={deletePending}
        onConfirm={() => deleting && handleDelete(deleting)}
      />
    </>
  );
}
