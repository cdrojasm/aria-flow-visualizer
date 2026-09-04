import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/configuracion/shared/FormControls";
import { getDatasets, getDatasetSummary } from "@/lib/api/testing.functions";
import {
  createModel,
  type FieldTransform,
  type FieldTransformKind,
} from "@/lib/api/models.functions";

const KIND_LABELS: Record<FieldTransformKind, string> = {
  numeric: "Numérico",
  categorical: "Categórico",
  date_derived: "Fecha (derivada)",
  rule_multihot: "Lista de reglas (multi-hot)",
  drop: "Excluir",
};

/* ─── Crear modelo (task 6) ──────────────────────────────
   Field/transformation builder, same list-editable shape as
   SegmentProfilingSection.tsx's FieldCategorizationTable: pick a dataset,
   pick fields from its already-analyzed distribution (GET /datasets/{name}
   /summary, same call the testing page's dataset picker makes), propose a
   transformation kind per field. Kept intentionally generic - the backend
   (build_feature_frame) doesn't hardcode any fraud-specific column, so this
   form doesn't either. */

export function ModelFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();

  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [targetField, setTargetField] = useState("");
  const [positiveLabels, setPositiveLabels] = useState<string[]>([]);
  const [transforms, setTransforms] = useState<FieldTransform[]>([]);
  const [newField, setNewField] = useState("");
  const [newKind, setNewKind] = useState<FieldTransformKind>("categorical");

  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
  const summaryQuery = useQuery({
    queryKey: ["datasetSummary", datasetName],
    queryFn: () => getDatasetSummary({ data: { name: datasetName } }),
    enabled: !!datasetName,
  });

  const fields = useMemo(
    () => [...(summaryQuery.data?.available_fields ?? Object.keys(summaryQuery.data?.field_distributions ?? {}))].sort(),
    [summaryQuery.data],
  );
  const targetValues = useMemo(
    () => (summaryQuery.data?.field_distributions[targetField] ?? []).map((v) => v.value),
    [summaryQuery.data, targetField],
  );
  const availableFields = fields.filter((f) => !transforms.some((t) => t.field === f));

  const createMutation = useMutation({
    mutationFn: () =>
      createModel({
        data: {
          tag,
          description,
          dataset_name: datasetName,
          target_field: targetField,
          positive_labels: positiveLabels,
          feature_transforms: transforms,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
      reset();
      onClose();
    },
  });

  const reset = () => {
    setTag("");
    setDescription("");
    setDatasetName("");
    setTargetField("");
    setPositiveLabels([]);
    setTransforms([]);
  };

  const addTransform = () => {
    if (!newField) return;
    setTransforms([
      ...transforms,
      { field: newField, kind: newKind, reference_field: null, top_n: 30 },
    ]);
    setNewField("");
  };
  const removeTransform = (field: string) =>
    setTransforms(transforms.filter((t) => t.field !== field));
  const updateTransform = (field: string, patch: Partial<FieldTransform>) =>
    setTransforms(transforms.map((t) => (t.field === field ? { ...t, ...patch } : t)));

  const canSubmit =
    tag.trim().length > 0 &&
    datasetName.length > 0 &&
    targetField.length > 0 &&
    positiveLabels.length > 0 &&
    transforms.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo modelo</DialogTitle>
          <DialogDescription>
            Define el dataset, el target y las transformaciones de campos. El modelo se crea en
            estado borrador — el entrenamiento se dispara aparte, desde la tabla.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field
            label="Tag"
            hint="Identificador legible que tú eliges (el id interno se autogenera)."
          >
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Ej: xus-v1"
              className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
            />
          </Field>

          <Field label="Descripción">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
            />
          </Field>

          <Field label="Dataset">
            <select
              value={datasetName}
              onChange={(e) => {
                setDatasetName(e.target.value);
                setTargetField("");
                setPositiveLabels([]);
                setTransforms([]);
              }}
              className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
            >
              <option value="">Selecciona un dataset</option>
              {(datasetsQuery.data ?? []).map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name} ({d.row_count} filas)
                </option>
              ))}
            </select>
          </Field>

          {datasetName && summaryQuery.isLoading && (
            <p className="text-[12px] text-text-secondary">Cargando campos del dataset…</p>
          )}

          {datasetName && fields.length > 0 && (
            <>
              <Field
                label="Campo objetivo (target)"
                hint="Columna que el modelo aprende a predecir."
              >
                <select
                  value={targetField}
                  onChange={(e) => {
                    setTargetField(e.target.value);
                    setPositiveLabels([]);
                  }}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
                >
                  <option value="">Selecciona un campo</option>
                  {fields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>

              {targetField && (
                <Field
                  label="Valores positivos"
                  hint="Qué valores del target cuentan como clase positiva (ej: 'risk')."
                >
                  <div className="flex flex-wrap gap-1.5">
                    {targetValues.map((v) => {
                      const active = positiveLabels.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() =>
                            setPositiveLabels(
                              active
                                ? positiveLabels.filter((p) => p !== v)
                                : [...positiveLabels, v],
                            )
                          }
                          className={`px-2.5 py-1 rounded-md text-[12px] border transition-colors ${
                            active
                              ? "bg-primary text-white border-primary"
                              : "border-border text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}

              <Field
                label="Transformaciones de campos"
                hint="Elige cada campo a usar como feature y cómo transformarlo."
              >
                <div className="space-y-2">
                  {transforms.map((t) => (
                    <div
                      key={t.field}
                      className="rounded-md border border-border px-3 py-2 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-text-primary flex-1 font-mono">
                          {t.field}
                        </span>
                        <select
                          value={t.kind}
                          onChange={(e) =>
                            updateTransform(t.field, { kind: e.target.value as FieldTransformKind })
                          }
                          className="h-7 rounded border border-border px-2 text-[12px] bg-background"
                        >
                          {(Object.keys(KIND_LABELS) as FieldTransformKind[]).map((k) => (
                            <option key={k} value={k}>
                              {KIND_LABELS[k]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeTransform(t.field)}
                          className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {t.kind === "date_derived" && (
                        <div className="flex items-center gap-1.5 pl-1">
                          <span className="text-[11px] text-text-secondary shrink-0">
                            Fecha de referencia (opcional, para calcular días transcurridos):
                          </span>
                          <select
                            value={t.reference_field ?? ""}
                            onChange={(e) =>
                              updateTransform(t.field, { reference_field: e.target.value || null })
                            }
                            className="h-7 rounded border border-border px-2 text-[12px] bg-background"
                          >
                            <option value="">Ninguna</option>
                            {fields
                              .filter((f) => f !== t.field)
                              .map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {t.kind === "rule_multihot" && (
                        <div className="flex items-center gap-1.5 pl-1">
                          <span className="text-[11px] text-text-secondary shrink-0">
                            Top-N tokens más frecuentes:
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={t.top_n}
                            onChange={(e) =>
                              updateTransform(t.field, { top_n: Number(e.target.value) })
                            }
                            className="w-20 h-7 rounded border border-border px-2 text-[12px]"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <select
                      value={newField}
                      onChange={(e) => setNewField(e.target.value)}
                      className="flex-1 h-8 rounded-md border border-border px-2 text-[12px] bg-background"
                    >
                      <option value="">Selecciona un campo…</option>
                      {availableFields.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newKind}
                      onChange={(e) => setNewKind(e.target.value as FieldTransformKind)}
                      className="h-8 rounded-md border border-border px-2 text-[12px] bg-background"
                    >
                      {(Object.keys(KIND_LABELS) as FieldTransformKind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addTransform}
                      disabled={!newField}
                      className="flex items-center gap-1 px-2.5 h-8 rounded-md border border-border text-[12px] text-text-secondary hover:text-text-primary disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> Agregar
                    </button>
                  </div>
                </div>
              </Field>
            </>
          )}

          {createMutation.isError && (
            <p className="text-[12px] text-danger">
              Error al crear el modelo: {(createMutation.error as Error).message}
            </p>
          )}
        </div>

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
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="px-3 py-2 rounded-md text-[13px] font-medium bg-primary text-white disabled:opacity-50"
          >
            {createMutation.isPending ? "Creando…" : "Crear modelo"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
