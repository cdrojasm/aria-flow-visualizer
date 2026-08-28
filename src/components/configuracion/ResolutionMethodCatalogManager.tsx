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
import { RESOLUTION_TAG_LABELS, type ResolutionTag } from "@/data/configs";
import {
  createResolutionMethod,
  deleteResolutionMethod,
  listResolutionMethods,
  updateResolutionMethod,
  type ResolutionMethodResponse,
} from "@/lib/api/resolutionMethod.functions";

/* ─── Admin CRUD for the resolution-method catalog ───────
   Opened from the Analista subtab, next to the playbook "Resolución"
   dropdown - see SegmentAnalystSection.tsx. Same flat pattern as
   MarcacionCatalogManager, with the fixed ResolutionTag enum playing the
   role MarcacionCategory.risk_label plays there: admins name as many
   methods as they want, each mapped onto one of the 3 tags the workflow
   understands (labels only - see backlog decision, no new execution logic
   per tag today). */

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
    try {
      await deleteResolutionMethod({ data: { entryId: entry.id } });
      refresh();
      invalidatePool();
    } catch {
      setError("No se pudo eliminar el método.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestionar métodos de resolución</DialogTitle>
          <DialogDescription>
            Métodos que un playbook puede asignar como resolución. Cada uno mapea a una de las 3 vías que
            ARIA sabe ejecutar hoy.
          </DialogDescription>
        </DialogHeader>

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

        {error && <p className="text-[12px] text-danger">{error}</p>}

        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Método</TableHead>
                <TableHead className="w-40">Vía</TableHead>
                <TableHead className="w-24">Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {methods.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className={`text-[13px] ${m.active ? "" : "text-text-secondary line-through"}`}>
                    {m.value}
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(m)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      {m.active ? "Desactivar" : "Activar"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleDelete(m)}
                      className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && methods.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-[12px] text-text-secondary py-6">
                    Sin métodos de resolución.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
