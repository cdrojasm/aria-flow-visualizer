import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
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
   tag - see SegmentAnalystSection.tsx. Same CRUD shape as biblioteca.tsx's
   EventCatalogSection, but as a dialog (not inline) and flat (no category
   partition) plus a risk_label per row. Hits the
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
  const [deleting, setDeleting] = useState<MarcacionCategoryResponse | null>(null);
  const [deletePending, setDeletePending] = useState(false);

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
    setDeletePending(true);
    try {
      await deleteMarcacionCategory({ data: { entryId: entry.id } });
      refresh();
      setDeleting(null);
    } catch {
      setError("No se pudo eliminar la categoría.");
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
        title="Gestionar categorías de marcación"
        description={
          <>
            Razones de marcación que ARIA puede asignar cuando resuelve una alerta directamente.
            Cada una mapea a una etiqueta de riesgo general.
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

        <DataTable<MarcacionCategoryResponse>
          storageKey="configuration.marcacion-categories"
          columns={
            [
              {
                key: "value",
                label: "Valor",
                render: (c) => (
                  <span className={c.active ? "" : "text-text-secondary line-through"}>
                    {c.value}
                  </span>
                ),
                sortValue: (c) => c.value,
                searchValue: (c) => c.value,
              },
              {
                key: "risk",
                label: "Riesgo",
                minWidth: 180,
                render: (c) => (
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
                ),
                sortValue: (c) => c.risk_label,
                searchValue: (c) =>
                  RISK_LABEL_OPTIONS.find((o) => o.value === c.risk_label)?.label ?? c.risk_label,
              },
              {
                key: "active",
                label: "Estado",
                render: (c) => (
                  <button
                    type="button"
                    onClick={() => handleToggleActive(c)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {c.active ? "Desactivar" : "Activar"}
                  </button>
                ),
                sortValue: (c) => Number(c.active),
                searchValue: (c) => (c.active ? "Activo" : "Inactivo"),
              },
            ] as DataTableColumn<MarcacionCategoryResponse>[]
          }
          rows={categories}
          rowKey={(c) => c.id}
          isLoading={loading}
          error={error ?? undefined}
          actions={(c) => (
            <button
              type="button"
              onClick={() => setDeleting(c)}
              aria-label={`Eliminar categoría ${c.value}`}
              className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          emptyLabel="Sin categorías de marcación."
          pageSize={10}
          itemLabel="categoría"
        />
      </SideDrawer>
      <ConfirmDeleteDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        itemName={`categoría de marcación "${deleting?.value ?? ""}"`}
        consequence="Referenciada por los playbooks 'Resolver con ARIA'; esas referencias apuntan a un id inexistente."
        pending={deletePending}
        onConfirm={() => deleting && handleDelete(deleting)}
      />
    </>
  );
}
