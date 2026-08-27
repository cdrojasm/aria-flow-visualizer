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
import {
  createMarcacionCategory,
  deleteMarcacionCategory,
  listMarcacionCategories,
  updateMarcacionCategory,
  type MarcacionCategoryResponse,
  type RiskLabel,
} from "@/lib/api/marcacion.functions";

/* ─── Admin CRUD for the marcación catalog ───────────
   Opened from the Analista subtab, next to the "handle_by_aria" resolution
   tag - see SegmentAnalystSection.tsx. Same pattern as TagCatalogManager
   but flat (no category partition) plus a risk_label per row. Hits the
   real backend immediately, same as the tag catalog. */

const RISK_LABEL_OPTIONS: { value: RiskLabel; label: string }[] = [
  { value: "risk-suspected", label: "Riesgo sospechado" },
  { value: "no-risk", label: "Sin riesgo" },
];

export function MarcacionCatalogManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [categories, setCategories] = useState<MarcacionCategoryResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [newRiskLabel, setNewRiskLabel] = useState<RiskLabel>("risk-suspected");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    listMarcacionCategories({ data: { activeOnly: false } })
      .then(setCategories)
      .catch(() => setError("No se pudo cargar el catálogo."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const handleCreate = async () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    try {
      await createMarcacionCategory({ data: { value: trimmed, riskLabel: newRiskLabel } });
      setNewValue("");
      refresh();
    } catch {
      setError("No se pudo crear la categoría.");
    }
  };

  const handleRiskLabelChange = async (entry: MarcacionCategoryResponse, riskLabel: RiskLabel) => {
    try {
      await updateMarcacionCategory({ data: { entryId: entry.id, riskLabel } });
      refresh();
    } catch {
      setError("No se pudo actualizar la categoría.");
    }
  };

  const handleToggleActive = async (entry: MarcacionCategoryResponse) => {
    try {
      await updateMarcacionCategory({ data: { entryId: entry.id, active: !entry.active } });
      refresh();
    } catch {
      setError("No se pudo actualizar la categoría.");
    }
  };

  const handleDelete = async (entry: MarcacionCategoryResponse) => {
    try {
      await deleteMarcacionCategory({ data: { entryId: entry.id } });
      refresh();
    } catch {
      setError("No se pudo eliminar la categoría.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestionar categorías de marcación</DialogTitle>
          <DialogDescription>
            Razones de marcación que ARIA puede asignar cuando resuelve una alerta directamente. Cada una
            mapea a una etiqueta de riesgo general.
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
            placeholder="Nueva razón de marcación…"
          />
          <select
            value={newRiskLabel}
            onChange={(e) => setNewRiskLabel(e.target.value as RiskLabel)}
            className="h-9 rounded-md border border-border px-2 text-[13px] focus:outline-none focus:border-primary bg-background"
          >
            {RISK_LABEL_OPTIONS.map((o) => (
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
                <TableHead>Valor</TableHead>
                <TableHead className="w-40">Riesgo</TableHead>
                <TableHead className="w-24">Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className={`text-[13px] ${c.active ? "" : "text-text-secondary line-through"}`}>
                    {c.value}
                  </TableCell>
                  <TableCell>
                    <select
                      value={c.risk_label}
                      onChange={(e) => handleRiskLabelChange(c, e.target.value as RiskLabel)}
                      className="h-8 w-full rounded-md border border-border px-2 text-[12px] focus:outline-none focus:border-primary bg-background"
                    >
                      {RISK_LABEL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(c)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      {c.active ? "Desactivar" : "Activar"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-[12px] text-text-secondary py-6">
                    Sin categorías de marcación.
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
