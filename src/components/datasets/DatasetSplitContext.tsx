import type {
  DatasetSplitSchemaContext,
  DatasetSplitSourceContext,
} from "@/lib/api/datasets.functions";

const PARTITION_LABELS = [
  ["training", "Entr."],
  ["validation", "Valid."],
  ["calibration", "Calib."],
  ["test", "Prueba"],
] as const;

const SOURCE_LABELS: Record<NonNullable<DatasetSplitSourceContext["kind"]>, string> = {
  uploaded: "Dataset cargado",
  catalog: "Dataset del catálogo",
  mature_sample: "Muestra madura de producción",
};

export function DatasetSplitContext({
  sourceContext,
  schemaContext,
  warnings,
  strataDistribution,
}: {
  sourceContext?: DatasetSplitSourceContext;
  schemaContext?: DatasetSplitSchemaContext;
  warnings?: string[];
  strataDistribution?: Record<string, Record<string, number>>;
}) {
  const strata = Object.entries(strataDistribution ?? {});
  return (
    <div className="space-y-2 text-[12px]">
      {sourceContext?.kind && (
        <div aria-label="Origen de la partición" role="group" className="text-text-secondary">
          <p>
            Origen: <span className="text-text-primary">{SOURCE_LABELS[sourceContext.kind]}</span>
          </p>
          {sourceContext.kind === "mature_sample" && (
            <>
              <p>
                Periodo {sourceContext.period_start} – {sourceContext.period_end} · madurez{" "}
                {sourceContext.maturing_days} días
              </p>
              <p>Partición final excluida: reservada para la evaluación final</p>
              <p className="break-all text-[11px]">
                Muestra madura: {sourceContext.mature_snapshot_id}
              </p>
            </>
          )}
          {sourceContext.kind === "catalog" && sourceContext.source_dataset_names?.length ? (
            <p>Derivado de: {sourceContext.source_dataset_names.join(", ")}</p>
          ) : null}
        </div>
      )}
      {schemaContext?.active_version !== undefined && (
        <p className="text-text-secondary">
          Esquema validado:{" "}
          <span className="text-text-primary">
            {schemaContext.validated_versions?.map((v) => `v${v}`).join(", ") || "—"}
          </span>{" "}
          · activo{" "}
          <span className="text-text-primary">
            {schemaContext.active_version === null ? "—" : `v${schemaContext.active_version}`}
          </span>
        </p>
      )}
      {warnings && warnings.length > 0 && (
        <ul
          aria-label="Avisos de compatibilidad"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 space-y-1 text-text-primary"
        >
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {strata.length > 0 && (
        <table aria-label="Distribución por estrato" className="w-full text-[11px]">
          <thead>
            <tr className="text-text-secondary">
              <th className="text-left font-medium">Estrato</th>
              {PARTITION_LABELS.map(([name, label]) => (
                <th key={name} className="text-right font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strata.map(([stratum, counts]) => (
              <tr key={stratum}>
                <td className="truncate max-w-[10rem]">{stratum}</td>
                {PARTITION_LABELS.map(([name]) => (
                  <td key={name} className="text-right font-mono">
                    {(counts[name] ?? 0).toLocaleString("es-CO")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
