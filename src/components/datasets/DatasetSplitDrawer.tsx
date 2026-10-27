import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Field } from "@/components/configuracion/shared/FormControls";
import { DatasetSplitContext } from "@/components/datasets/DatasetSplitContext";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  prepareDatasetSplit,
  previewDatasetSplit,
  type DatasetSplitRequest,
} from "@/lib/api/datasets.functions";

const PARTITIONS = [
  ["training", "Entrenamiento"],
  ["validation", "Validación"],
  ["calibration", "Calibración"],
  ["test", "Prueba"],
] as const;
type PartitionName = (typeof PARTITIONS)[number][0];
const DEFAULT_PROPORTIONS: DatasetSplitRequest["proportions"] = {
  training: 0.6,
  validation: 0.2,
  calibration: 0.1,
  test: 0.1,
};

export function DatasetSplitDrawer({
  datasetName,
  open,
  onClose,
}: {
  datasetName: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [targetName, setTargetName] = useState("");
  const [proportions, setProportions] = useState(DEFAULT_PROPORTIONS);
  const [seed, setSeed] = useState(42);
  const [stratifyFields, setStratifyFields] = useState<string[]>([]);
  const preview = useQuery({
    queryKey: ["datasetSplitPreview", datasetName, proportions, seed, stratifyFields],
    enabled: open && !!datasetName,
    queryFn: () =>
      previewDatasetSplit({
        data: { source_name: datasetName!, proportions, seed, stratify_fields: stratifyFields },
      }),
  });
  const splitMutation = useMutation({
    mutationFn: () =>
      prepareDatasetSplit({
        data: {
          source_name: datasetName!,
          target_name: targetName.trim(),
          proportions,
          seed,
          stratify_fields: stratifyFields,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      queryClient.invalidateQueries({ queryKey: ["datasetSummary"] });
      reset();
      onClose();
    },
  });
  const total = useMemo(
    () => Object.values(proportions).reduce((sum, value) => sum + value, 0),
    [proportions],
  );

  useEffect(() => {
    if (open && datasetName) setTargetName(`${datasetName}_split`);
  }, [open, datasetName]);

  function reset() {
    setTargetName("");
    setProportions(DEFAULT_PROPORTIONS);
    setSeed(42);
    setStratifyFields([]);
    splitMutation.reset();
  }

  function updateProportion(name: PartitionName, percentage: number) {
    setProportions((current) => ({ ...current, [name]: percentage / 100 }));
  }

  const validProportions =
    Math.abs(total - 1) < 0.000001 && Object.values(proportions).every((v) => v > 0);
  const canCreate =
    !!preview.data && validProportions && targetName.trim().length > 0 && !splitMutation.isPending;

  return (
    <SideDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
      size="lg"
      title="Preparar particiones"
      description={`Revisa la distribución y confirma una copia reproducible de ${datasetName ?? ""}.`}
      dirty={targetName.length > 0 && !splitMutation.isSuccess}
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="px-3 py-2 rounded-md text-[13px] text-text-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => splitMutation.mutate()}
            className="px-3 py-2 rounded-md text-[13px] font-medium bg-primary text-white disabled:opacity-50"
          >
            {splitMutation.isPending ? "Creando…" : "Confirmar y crear copia"}
          </button>
        </>
      }
    >
      <Field label="Nombre del dataset particionado">
        <input
          aria-label="Nombre del dataset particionado"
          value={targetName}
          onChange={(event) => setTargetName(event.target.value)}
          className="w-full h-9 rounded-md border border-border px-3 text-[13px]"
        />
      </Field>
      <Field
        label="Distribución objetivo"
        hint={`La suma debe ser 100%. Actual: ${(total * 100).toFixed(1)}%.`}
      >
        <div className="grid grid-cols-2 gap-3">
          {PARTITIONS.map(([name, label]) => (
            <label key={name} className="text-[12px] text-text-secondary">
              {label} (%)
              <input
                aria-label={`${label} (%)`}
                type="number"
                min="1"
                max="99"
                step="1"
                value={Math.round(proportions[name] * 100)}
                onChange={(event) => updateProportion(name, Number(event.target.value))}
                className="mt-1 w-full h-8 rounded-md border border-border px-2"
              />
            </label>
          ))}
        </div>
      </Field>
      <Field label="Semilla" hint="La misma semilla y los mismos datos reproducen la asignación.">
        <input
          aria-label="Semilla"
          type="number"
          value={seed}
          onChange={(event) => setSeed(Number(event.target.value))}
          className="w-32 h-8 rounded-md border border-border px-2"
        />
      </Field>
      <Field
        label="Estratificar por campos"
        hint="Opcional. Conserva su distribución entre las particiones."
      >
        {preview.data?.available_fields.length ? (
          <div className="grid grid-cols-2 gap-2 max-h-36 overflow-auto">
            {preview.data.available_fields.map((field) => (
              <label
                key={field}
                className="flex items-center gap-2 text-[12px] text-text-secondary"
              >
                <input
                  type="checkbox"
                  checked={stratifyFields.includes(field)}
                  onChange={(event) =>
                    setStratifyFields((current) =>
                      event.target.checked
                        ? [...current, field]
                        : current.filter((item) => item !== field),
                    )
                  }
                />
                <span className="truncate">{field}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-text-secondary">
            {preview.isLoading ? "Cargando campos…" : "No hay campos disponibles."}
          </p>
        )}
      </Field>
      <section
        aria-label="Vista previa de particiones"
        className="rounded-lg border border-border p-3 space-y-2"
      >
        <h3 className="text-[13px] font-semibold text-text-primary">Conteos antes de confirmar</h3>
        {preview.isLoading && (
          <p className="text-[12px] text-text-secondary">Calculando distribución…</p>
        )}
        {preview.isError && (
          <p role="alert" className="text-[12px] text-danger">
            {(preview.error as Error).message}
          </p>
        )}
        {preview.data && (
          <>
            <p className="text-[11px] text-text-secondary">
              {preview.data.source_row_count.toLocaleString("es-CO")} filas · SHA-256{" "}
              {preview.data.source_content_sha256.slice(0, 12)}…
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PARTITIONS.map(([name, label]) => (
                <div key={name} className="rounded bg-surface px-3 py-2 text-[12px]">
                  {label}
                  <strong className="float-right font-mono">
                    {preview.data!.partition_counts[name].toLocaleString("es-CO")}
                  </strong>
                </div>
              ))}
            </div>
            <DatasetSplitContext
              sourceContext={preview.data.source_context}
              schemaContext={preview.data.schema_context}
              warnings={preview.data.warnings}
              strataDistribution={preview.data.strata_distribution}
            />
          </>
        )}
        {!validProportions && (
          <p role="alert" className="text-[12px] text-danger">
            Las proporciones deben sumar 100% y cada partición debe ser mayor que 0%.
          </p>
        )}
      </section>
      {splitMutation.isError && (
        <p role="alert" className="text-[12px] text-danger">
          {(splitMutation.error as Error).message}
        </p>
      )}
      {splitMutation.data && (
        <p className="text-[12px] text-text-secondary">
          Snapshot reproducible: {splitMutation.data.snapshot_id}
        </p>
      )}
    </SideDrawer>
  );
}
