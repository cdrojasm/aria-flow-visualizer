import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/configuracion/shared/FormControls";
import { extractDataset, getDatasets } from "@/lib/api/datasets.functions";

/* Derives a new dataset from one or more existing ones - source_names are
   pooled, `filters` (exact-match field=value) narrow the pool, `percentage`
   samples from what's left, and the result lands in `target_name`. Mirrors
   ExtractDatasetInput on the backend 1:1 (src/application/dtos/dataset_dtos.py). */

export function ExtractDatasetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [sourceNames, setSourceNames] = useState<string[]>([]);
  const [filters, setFilters] = useState<{ field: string; value: string }[]>([]);
  const [percentage, setPercentage] = useState(100);
  const [targetName, setTargetName] = useState("");

  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });

  const extractMutation = useMutation({
    mutationFn: () =>
      extractDataset({
        data: {
          source_names: sourceNames,
          filters: Object.fromEntries(
            filters.filter((f) => f.field.trim()).map((f) => [f.field, f.value]),
          ),
          percentage,
          target_name: targetName,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      reset();
      onClose();
    },
  });

  const reset = () => {
    setSourceNames([]);
    setFilters([]);
    setPercentage(100);
    setTargetName("");
  };

  const toggleSource = (name: string) =>
    setSourceNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );

  const addFilter = () => setFilters([...filters, { field: "", value: "" }]);
  const updateFilter = (i: number, patch: Partial<{ field: string; value: string }>) =>
    setFilters(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const removeFilter = (i: number) => setFilters(filters.filter((_, idx) => idx !== i));

  const canSubmit =
    sourceNames.length > 0 && targetName.trim().length > 0 && percentage > 0 && percentage <= 100;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extraer / derivar dataset</DialogTitle>
          <DialogDescription>
            Crea un dataset nuevo a partir de uno o más existentes: filtra por campo=valor y toma un
            porcentaje de lo que quede.
          </DialogDescription>
        </DialogHeader>

        <Field label="Datasets fuente" hint="Se combinan las filas de todos los seleccionados.">
          <div className="flex flex-wrap gap-1.5">
            {(datasetsQuery.data ?? []).length === 0 && (
              <span className="text-[11px] text-text-secondary">No hay datasets todavía.</span>
            )}
            {(datasetsQuery.data ?? []).map((d) => {
              const active = sourceNames.includes(d.name);
              return (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => toggleSource(d.name)}
                  className={`px-2.5 py-1 rounded-md text-[12px] border transition-colors ${
                    active
                      ? "bg-primary text-white border-primary"
                      : "border-border text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {d.name} ({d.row_count})
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label="Filtros"
          hint="Coincidencia exacta por campo. Opcional — sin filtros toma todas las filas de los datasets fuente."
        >
          <div className="space-y-2">
            {filters.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={f.field}
                  onChange={(e) => updateFilter(i, { field: e.target.value })}
                  placeholder="campo"
                  className="flex-1 h-8 rounded-md border border-border px-2 text-[12px] font-mono focus:outline-none focus:border-primary"
                />
                <input
                  value={f.value}
                  onChange={(e) => updateFilter(i, { value: e.target.value })}
                  placeholder="valor"
                  className="flex-1 h-8 rounded-md border border-border px-2 text-[12px] focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => removeFilter(i)}
                  className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addFilter}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar filtro
            </button>
          </div>
        </Field>

        <Field label="Porcentaje a muestrear" hint="Del subconjunto ya filtrado.">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={100}
              step={0.1}
              value={percentage}
              onChange={(e) => setPercentage(Number(e.target.value))}
              className="w-24 h-8 rounded-md border border-border px-2 text-[12px] focus:outline-none focus:border-primary"
            />
            <span className="text-[12px] text-text-secondary">%</span>
          </div>
        </Field>

        <Field label="Nombre del dataset destino">
          <input
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
            placeholder="Ej: muestra_validacion_q1"
            className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
          />
        </Field>

        {extractMutation.isError && (
          <p className="text-[12px] text-danger">{(extractMutation.error as Error).message}</p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="px-3 py-2 rounded-md text-[13px] text-text-secondary hover:text-text-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSubmit || extractMutation.isPending}
            onClick={() => extractMutation.mutate()}
            className="px-3 py-2 rounded-md text-[13px] font-medium bg-primary text-white disabled:opacity-50"
          >
            {extractMutation.isPending ? "Extrayendo…" : "Extraer dataset"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
