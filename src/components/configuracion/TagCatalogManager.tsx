import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

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
import { TAG_CATEGORY_LABELS, type TagCategory } from "@/data/configs";
import {
  createTag,
  deleteTag,
  listTags,
  updateTag,
  type TagEntryResponse,
} from "@/lib/api/configuration.functions";

/* ─── Admin CRUD for one tag-catalog category ───────────
   Opened from the filter builder next to a TagMultiSelect. Create/edit/
   deactivate/delete all hit the real backend immediately (see
   src/lib/api/configuration.functions.ts) - this is managed reference
   data, not part of the page's local-mock configuration state. */

export function TagCatalogManager({
  category,
  open,
  onOpenChange,
}: {
  category: TagCategory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tags, setTags] = useState<TagEntryResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    listTags({ data: { category, activeOnly: false } })
      .then(setTags)
      .catch(() => setError("No se pudo cargar el catálogo."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  const handleCreate = async () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    try {
      await createTag({ data: { category, value: trimmed } });
      setNewValue("");
      refresh();
    } catch {
      setError("No se pudo crear el tag.");
    }
  };

  const handleToggleActive = async (tag: TagEntryResponse) => {
    try {
      await updateTag({ data: { category, tagId: tag.id, active: !tag.active } });
      refresh();
    } catch {
      setError("No se pudo actualizar el tag.");
    }
  };

  const handleDelete = async (tag: TagEntryResponse) => {
    try {
      await deleteTag({ data: { category, tagId: tag.id } });
      refresh();
    } catch {
      setError("No se pudo eliminar el tag.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestionar {TAG_CATEGORY_LABELS[category]}</DialogTitle>
          <DialogDescription>
            Agrega, desactiva o elimina los valores disponibles para este filtro. Los valores desactivados
            dejan de aparecer al construir nuevas condiciones.
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
            placeholder="Nuevo valor…"
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
                <TableHead>Valor</TableHead>
                <TableHead className="w-24">Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className={`text-[13px] ${t.active ? "" : "text-text-secondary line-through"}`}>
                    {t.value}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(t)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      {t.active ? "Desactivar" : "Activar"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && tags.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-[12px] text-text-secondary py-6">
                    Sin tags en esta categoría.
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
