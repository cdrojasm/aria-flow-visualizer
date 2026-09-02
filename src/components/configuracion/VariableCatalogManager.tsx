import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  createVariable,
  deleteVariable,
  listVariables,
  updateVariable,
  type VariableResponse,
} from "@/lib/api/variable.functions";

/* ─── Admin CRUD for the variable catalog ────────────────
   Opened from VariablePicker itself (shared/FormControls.tsx) via a gear
   icon next to its search input - VariablePicker is reused across 5+
   sections, so a single entry point there beats duplicating a "manage"
   link per section. Same flat-list pattern as MarcacionCatalogManager,
   minus the risk-label dimension, plus an optional description (variable
   names alone, e.g. "Altamira", aren't self-explanatory). */

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestionar variables</DialogTitle>
          <DialogDescription>
            Pool de variables disponible al construir taxonomías, modus operandi, flags y prompts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Nueva variable…"
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

        {error && <p className="text-[12px] text-danger">{error}</p>}

        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variable</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="w-24">Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {variables.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className={`text-[13px] ${v.active ? "" : "text-text-secondary line-through"}`}>
                    {v.value}
                  </TableCell>
                  <TableCell>
                    <input
                      defaultValue={v.description}
                      onBlur={(e) => {
                        if (e.target.value !== v.description) handleDescriptionChange(v, e.target.value);
                      }}
                      placeholder="—"
                      className="h-8 w-full rounded-md border border-border px-2 text-[12px] focus:outline-none focus:border-primary bg-background"
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(v)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      {v.active ? "Desactivar" : "Activar"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setDeleting(v)}
                      className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && variables.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-[12px] text-text-secondary py-6">
                    Sin variables en el catálogo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>

      <ConfirmDeleteDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        itemName={`variable "${deleting?.value ?? ""}"`}
        consequence="Citada por prompts vía prompt_vars y por taxonomías vía variables; esas referencias apuntan a un id inexistente."
        pending={deletePending}
        onConfirm={() => deleting && handleDelete(deleting)}
      />
    </Dialog>
  );
}
