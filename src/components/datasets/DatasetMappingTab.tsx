import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getAlertFieldMapping,
  getDatasetSummary,
  saveAlertFieldMapping,
} from "@/lib/api/datasets.functions";
import { listVariables } from "@/lib/api/variable.functions";
import { useRole } from "@/hooks/useRole";

type Pair = { alertField: string; datasetField: string };

const ALERT_FIELD_DATALIST_ID = "dataset-mapping-alert-fields";
const DATASET_FIELD_DATALIST_ID = "dataset-mapping-dataset-fields";

function mappingsToPairs(mappings: Record<string, string>): Pair[] {
  return Object.entries(mappings).map(([alertField, datasetField]) => ({
    alertField,
    datasetField,
  }));
}

export function DatasetMappingTab({ datasetName }: { datasetName: string }) {
  const { role } = useRole();
  const canEdit = role === "manager" || role === "release_manager";
  const queryClient = useQueryClient();
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const mappingQuery = useQuery({
    queryKey: ["alertFieldMapping", datasetName],
    queryFn: () => getAlertFieldMapping({ data: { name: datasetName } }),
  });

  // Suggestion sources, not validation: "Columna del dataset" suggests the
  // columns actually present in this dataset's file (its available_fields,
  // same summary the "Resumen"/"Filas" tabs read); "Campo de la alerta"
  // suggests names already known system-wide via the variable catalog
  // (Biblioteca-adjacent, admin-managed) - alert payload paths aren't
  // enumerable from anywhere today, so the catalog is the closest existing
  // "known field names" source. Both stay free-text inputs (datalist, not a
  // hard <select>) since a real payload path or column may not appear in
  // either list yet.
  const datasetFieldsQuery = useQuery({
    queryKey: ["datasetSummary", datasetName],
    queryFn: () => getDatasetSummary({ data: { name: datasetName } }),
  });
  const variablesQuery = useQuery({
    queryKey: ["variables", { activeOnly: true }],
    queryFn: () => listVariables({ data: { activeOnly: true } }),
  });
  const datasetFieldOptions = datasetFieldsQuery.data?.available_fields ?? [];
  const alertFieldOptions = (variablesQuery.data ?? []).map((v) => v.value);

  useEffect(() => {
    if (mappingQuery.data && loadedFor !== datasetName) {
      setPairs(mappingsToPairs(mappingQuery.data.mappings));
      setLoadedFor(datasetName);
    }
  }, [mappingQuery.data, datasetName, loadedFor]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveAlertFieldMapping({
        data: {
          name: datasetName,
          mappings: Object.fromEntries(
            pairs
              .filter((p) => p.alertField.trim() && p.datasetField.trim())
              .map((p) => [p.alertField, p.datasetField]),
          ),
        },
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(["alertFieldMapping", datasetName], res);
    },
  });

  const addPair = () => setPairs([...pairs, { alertField: "", datasetField: "" }]);
  const updatePair = (i: number, patch: Partial<Pair>) =>
    setPairs(pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const removePair = (i: number) => setPairs(pairs.filter((_, idx) => idx !== i));

  if (mappingQuery.isLoading) {
    return <p className="text-[13px] text-text-secondary">Cargando mapeo…</p>;
  }
  if (mappingQuery.isError) {
    return <p className="text-[13px] text-danger">No se pudo cargar el mapeo de campos.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-[13px] font-semibold text-text-primary">Exportar a formato externo</h3>
      <p className="text-[12px] text-text-secondary">
        Este mapeo solo se usa al exportar la alerta canónica a un formato externo. La acción "Al
        dataset" no lo usa: llena entrada, etiquetas y la versión del esquema.
      </p>
      {!canEdit && (
        <p className="rounded-md bg-surface px-3 py-2 text-[12px] text-text-secondary">
          Solo manager y release manager pueden editar este formato. Vista de solo lectura.
        </p>
      )}
      <p className="text-[12px] text-text-secondary">
        Este mapeo traduce la data de <strong className="text-text-primary">este dataset</strong> al
        formato interno con el que ARIA representa una alerta: cada fila indica de qué campo del
        payload de una alerta (ruta con puntos, ej.{" "}
        <code className="text-[11px]">transaccion.monto</code>) sale el valor que llenará una
        columna de este dataset, para cuando una alerta se cura hacia él. Un campo sin mapeo
        explícito igual pasa si su nombre aplanado coincide con una columna del dataset. Ambos
        campos sugieren valores al escribir — "Campo de la alerta" desde el catálogo de variables
        del sistema (el vocabulario ya usado por ARIA), "Columna del dataset" desde las columnas
        reales de este archivo — pero aceptan texto libre.
      </p>

      <datalist id={ALERT_FIELD_DATALIST_ID}>
        {alertFieldOptions.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id={DATASET_FIELD_DATALIST_ID}>
        {datasetFieldOptions.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <div className="border border-border rounded-lg divide-y divide-border">
        <div className="grid grid-cols-[1fr_1fr_32px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-text-secondary bg-surface">
          <span>Campo de la alerta (payload)</span>
          <span>Columna del dataset</span>
          <span />
        </div>
        {pairs.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-text-secondary text-center">
            Sin mapeos definidos.
          </p>
        )}
        {pairs.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 px-3 py-2 items-center">
            <input
              disabled={!canEdit}
              value={p.alertField}
              onChange={(e) => updatePair(i, { alertField: e.target.value })}
              placeholder="ej: transaccion.monto"
              list={ALERT_FIELD_DATALIST_ID}
              className="h-8 rounded-md border border-border px-2 text-[12px] font-mono focus:outline-none focus:border-primary"
            />
            <input
              disabled={!canEdit}
              value={p.datasetField}
              onChange={(e) => updatePair(i, { datasetField: e.target.value })}
              placeholder="ej: monto"
              list={DATASET_FIELD_DATALIST_ID}
              className="h-8 rounded-md border border-border px-2 text-[12px] font-mono focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => removePair(i)}
              className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger justify-self-center"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={addPair}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar mapeo
        </button>
      )}

      {saveMutation.isError && (
        <p className="text-[12px] text-danger">{(saveMutation.error as Error).message}</p>
      )}
      {saveMutation.isSuccess && !saveMutation.isPending && (
        <p className="text-[12px] text-success">Mapeo guardado.</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] text-text-secondary">
          {mappingQuery.data?.updated_at
            ? `Última actualización: ${new Date(mappingQuery.data.updated_at).toLocaleString()}`
            : "Sin guardar todavía."}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-primary text-white disabled:opacity-50"
          >
            {saveMutation.isPending ? "Guardando…" : "Guardar mapeo"}
          </button>
        )}
      </div>
    </div>
  );
}
