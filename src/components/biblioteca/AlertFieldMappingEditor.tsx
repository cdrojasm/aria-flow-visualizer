import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAlertFieldMapping,
  getDatasetSummary,
  saveAlertFieldMapping,
} from "@/lib/api/datasets.functions";

/* ─── Alert field mapping editor ─────────────────────────────────────────
   Admin screen (opened from DatasetLibraryManager's row actions) that lets
   an admin pair alert payload field names (free text - not introspectable
   from here, e.g. "object.triggeredRules") with this dataset's real
   columns (a <select> from GET .../summary's available_fields, same query
   key DatasetLibraryManager already uses so it shares cache). Saving does
   a full replace via PUT, not a merge - see saveAlertFieldMapping. */

type MappingPair = { alertField: string; datasetColumn: string };

export function AlertFieldMappingEditor({
  datasetName,
  open,
  onClose,
}: {
  datasetName: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [pairs, setPairs] = useState<MappingPair[]>([]);

  const mappingQuery = useQuery({
    queryKey: ["alertFieldMapping", datasetName],
    queryFn: () => getAlertFieldMapping({ data: { name: datasetName! } }),
    enabled: !!datasetName,
  });

  const summaryQuery = useQuery({
    queryKey: ["datasetSummary", datasetName],
    queryFn: () => getDatasetSummary({ data: { name: datasetName! } }),
    enabled: !!datasetName,
  });

  // Only reset local state when the fetched mapping first becomes available
  // (or when the dataset changes) - not on every render, so in-progress
  // edits aren't clobbered by e.g. a background refetch.
  useEffect(() => {
    if (mappingQuery.data) {
      setPairs(
        Object.entries(mappingQuery.data.mappings).map(([alertField, datasetColumn]) => ({
          alertField,
          datasetColumn,
        })),
      );
    }
  }, [mappingQuery.data, datasetName]);

  const saveMutation = useMutation({
    mutationFn: (mappings: Record<string, string>) =>
      saveAlertFieldMapping({ data: { name: datasetName!, mappings } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertFieldMapping", datasetName] });
      onClose();
    },
  });

  function addPair() {
    setPairs([...pairs, { alertField: "", datasetColumn: "" }]);
  }

  function removePair(index: number) {
    setPairs(pairs.filter((_, i) => i !== index));
  }

  function updatePair(index: number, patch: Partial<MappingPair>) {
    setPairs(pairs.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function handleSave() {
    const mappings = Object.fromEntries(
      pairs
        .filter((p) => p.alertField.trim() && p.datasetColumn)
        .map((p) => [p.alertField.trim(), p.datasetColumn]),
    );
    saveMutation.mutate(mappings);
  }

  const availableColumns = summaryQuery.data?.available_fields ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          saveMutation.reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mapeo de campos de alerta: {datasetName}</DialogTitle>
          <DialogDescription>
            Define cómo cada campo del payload de una alerta corresponde a una columna de este
            dataset, para que curar una alerta produzca valores útiles aunque los nombres no
            coincidan textualmente.
          </DialogDescription>
        </DialogHeader>

        {(mappingQuery.isLoading || summaryQuery.isLoading) && (
          <p className="text-[13px] text-text-secondary">Cargando…</p>
        )}
        {(mappingQuery.isError || summaryQuery.isError) && (
          <p className="text-[13px] text-danger">No se pudo cargar la información del dataset.</p>
        )}

        {mappingQuery.isSuccess && summaryQuery.isSuccess && (
          <div className="space-y-2">
            {pairs.length === 0 && (
              <p className="text-[12px] text-text-secondary">
                Sin campos mapeados todavía. Agrega uno con el botón de abajo.
              </p>
            )}
            {pairs.map((pair, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={pair.alertField}
                  onChange={(e) => updatePair(index, { alertField: e.target.value })}
                  placeholder="Campo de la alerta (ej. eventId)"
                  className="flex-1 h-8 rounded-md border border-border px-2 text-[12px] bg-background"
                />
                <span className="text-text-secondary text-[12px]">→</span>
                <select
                  value={pair.datasetColumn}
                  onChange={(e) => updatePair(index, { datasetColumn: e.target.value })}
                  className="flex-1 h-8 rounded-md border border-border px-2 text-[12px] bg-background"
                >
                  <option value="">Columna del dataset</option>
                  {availableColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removePair(index)}
                  className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addPair}
              className="flex items-center gap-1 px-2.5 h-8 rounded-md border border-border text-[12px] text-text-secondary hover:text-text-primary"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar campo
            </button>
          </div>
        )}

        {saveMutation.isError && (
          <p className="text-[12px] text-danger">
            Error al guardar el mapeo: {(saveMutation.error as Error).message}
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md text-[13px] text-text-secondary hover:text-text-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saveMutation.isPending || !mappingQuery.isSuccess}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium bg-primary text-white disabled:opacity-50"
          >
            {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saveMutation.isPending ? "Guardando…" : "Guardar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
