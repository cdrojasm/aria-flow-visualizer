import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  createVariable,
  deleteVariable,
  listVariables,
  updateVariable,
  type VariableResponse,
} from "@/lib/api/variable.functions";

/* ─── Admin CRUD for the source-variable catalog ─────────
   Opened from VariablePicker itself (shared/FormControls.tsx) via a gear
   icon next to its search input - VariablePicker is reused across 5+
   sections, so a single entry point there beats duplicating a "manage"
   link per section. Same flat-list pattern as MarcacionCatalogManager,
   minus the risk-label dimension, plus an optional description. Derived
   variables are configured separately by profiling field categorizations. */

export function VariableCatalogManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [variables, setVariables] = useState<VariableResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<VariableResponse | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError(null);
    listVariables({ data: { activeOnly: false } })
      .then(setVariables)
      .catch(() => setError("No se pudo cargar el catálogo."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const invalidatePool = () => queryClient.invalidateQueries({ queryKey: ["variableCatalog"] });

  const handleCreate = async () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    try {
      await createVariable({ data: { value: trimmed, description: newDescription.trim() } });
      setNewValue("");
      setNewDescription("");
      refresh();
      invalidatePool();
    } catch {
      setError("No se pudo crear la variable.");
    }
  };

  const handleDescriptionChange = async (entry: VariableResponse, description: string) => {
    try {
      await updateVariable({ data: { entryId: entry.id, description } });
      refresh();
      invalidatePool();
    } catch {
      setError("No se pudo actualizar la variable.");
    }
  };

  const handleToggleActive = async (entry: VariableResponse) => {
    try {
      await updateVariable({ data: { entryId: entry.id, active: !entry.active } });
      refresh();
      invalidatePool();
    } catch {
      setError("No se pudo actualizar la variable.");
    }
  };

  const handleDelete = async (entry: VariableResponse) => {
    setDeletePending(true);
    try {
      await deleteVariable({ data: { entryId: entry.id } });
      refresh();
      invalidatePool();
      setDeleting(null);
    } catch {
      setError("No se pudo eliminar la variable.");
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
        title="Gestionar variables de origen"
        description={
          <>
            Campos recibidos en la alerta. Las variables derivadas se crean en Enriquecimiento de la
            data.
          </>
        }
      >
        <div className="flex items-center gap-2">
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Nuevo campo de origen…"
            className="flex-1"
          />
          <Input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="Descripción (opcional)"
            className="flex-1"
          />
          <Button type="button" size="sm" onClick={handleCreate} disabled={!newValue.trim()}>
            Agregar
          </Button>
        </div>

        <DataTable<VariableResponse>
          storageKey="configuration.variables"
          columns={
            [
              {
                key: "value",
                label: "Variable",
                render: (v) => (
                  <span className={v.active ? "" : "text-text-secondary line-through"}>
                    {v.value}
                  </span>
                ),
                sortValue: (v) => v.value,
                searchValue: (v) => v.value,
              },
              {
                key: "description",
                label: "Descripción",
                minWidth: 220,
                render: (v) => (
                  <input
                    defaultValue={v.description}
                    onBlur={(e) =>
                      e.target.value !== v.description && handleDescriptionChange(v, e.target.value)
                    }
                    placeholder="—"
                    className="h-8 w-full rounded-md border border-border px-2 text-[12px] focus:outline-none focus:border-primary bg-background"
                  />
                ),
                searchValue: (v) => v.description ?? "",
              },
              {
                key: "active",
                label: "Estado",
                render: (v) => (
                  <button
                    type="button"
                    onClick={() => handleToggleActive(v)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {v.active ? "Desactivar" : "Activar"}
                  </button>
                ),
                sortValue: (v) => Number(v.active),
                searchValue: (v) => (v.active ? "Activo" : "Inactivo"),
              },
            ] as DataTableColumn<VariableResponse>[]
          }
          rows={variables}
          rowKey={(v) => v.id}
          isLoading={loading}
          error={error ?? undefined}
          actions={(v) => (
            <button
              type="button"
              onClick={() => setDeleting(v)}
              aria-label={`Eliminar variable ${v.value}`}
              className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          emptyLabel="Sin variables en el catálogo."
          pageSize={10}
          itemLabel="variable"
        />
      </SideDrawer>
      <ConfirmDeleteDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        itemName={`variable "${deleting?.value ?? ""}"`}
        consequence="Citada por prompts vía prompt_vars y por taxonomías vía variables; esas referencias apuntan a un id inexistente."
        pending={deletePending}
        onConfirm={() => deleting && handleDelete(deleting)}
      />
    </>
  );
}
